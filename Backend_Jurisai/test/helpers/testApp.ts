import { Writable } from "node:stream";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { loadConfig, type Config } from "../../src/config/env.js";
import { ingestSeed } from "../../src/ingestion/ingestSources.js";
import { createLogger } from "../../src/lib/logger.js";
import type { EmailProvider } from "../../src/modules/auth/emailProvider.js";
import type { RazorpayGateway } from "../../src/modules/billing/razorpay.js";
import type { DraftPrompt } from "../../src/modules/drafts/pipeline/3-buildPrompt.js";
import type {
  DraftGeneration,
  DraftOutput,
  LlmGateway,
  Mention,
  SupportCheckItem,
  SupportResult,
} from "../../src/modules/drafts/pipeline/4-llmGateway.js";
import type { FileStorage } from "../../src/modules/export/fileStorage.js";
import { HashingEmbedder } from "../../src/modules/legal/embeddings.js";
import { MemoryLegalStore } from "../../src/modules/legal/memoryLegalStore.js";

export class CapturingEmail implements EmailProvider {
  readonly codes = new Map<string, string>();
  async sendOtp(email: string, code: string) {
    this.codes.set(email, code);
  }
}

/** Stands in for Claude. `respond` sees the real prompt, so tests can cite what was actually retrieved. */
export class FakeLlm implements LlmGateway {
  prompts: DraftPrompt[] = [];
  respond: (prompt: DraftPrompt) => DraftOutput | Promise<DraftOutput> = () => ({ draftText: "DRAFT", citations: [] });
  mentions: Mention[] = [];
  supportItems: SupportCheckItem[][] = [];
  /** Default: the source supports every passage. */
  support: (items: SupportCheckItem[]) => SupportResult[] = (items) =>
    items.map((i) => ({ id: i.id, verdict: "supported", explanation: "" }));

  async generateDraft(prompt: DraftPrompt): Promise<DraftGeneration> {
    this.prompts.push(prompt);
    return { output: await this.respond(prompt), model: "fake-model", inputTokens: 100, outputTokens: 50, stopReason: "end_turn" };
  }
  async extractMentions(): Promise<Mention[]> {
    return this.mentions;
  }
  async checkSupport(items: SupportCheckItem[]): Promise<SupportResult[]> {
    this.supportItems.push(items);
    return this.support(items);
  }
}

export class MemoryStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.files.set(key, body);
  }
  async signedUrl(key: string) {
    return `https://files.test/${key}?signature=abc`;
  }
}

export class FakeRazorpay implements RazorpayGateway {
  created = 0;
  async createSubscription() {
    this.created++;
    return { id: `sub_test_${this.created}`, status: "created", shortUrl: "https://rzp.io/test" };
  }
}

export const WEBHOOK_SECRET = "whsec_test_secret";

export async function startTestApp(overrides: Record<string, string> = {}) {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await mongoose.syncIndexes();

  const config: Config = loadConfig({
    NODE_ENV: "test",
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: "test-secret-test-secret-test-secret-1234",
    LEGAL_STORE: "memory",
    EMBEDDING_PROVIDER: "hash",
    LOG_LEVEL: "info",
    OTP_RESEND_COOLDOWN_SECONDS: "0",
    GENERATE_RATE_LIMIT_MAX: "100",
    AUTH_RATE_LIMIT_PER_IP: "1000",
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "rzp_test_secret",
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    RAZORPAY_PRO_PLAN_ID: "plan_test_pro",
    ...overrides,
  });

  const logLines: string[] = [];
  const logger = createLogger(
    "info",
    false,
    new Writable({
      write(chunk, _enc, cb) {
        logLines.push(chunk.toString());
        cb();
      },
    }),
  );

  const store = new MemoryLegalStore();
  const embedder = new HashingEmbedder(config.EMBEDDING_DIM);
  await ingestSeed({ store, embedder });

  const email = new CapturingEmail();
  const llm = new FakeLlm();
  const storage = new MemoryStorage();
  const razorpay = new FakeRazorpay();
  const deps = { config, logger, store, embedder, llm, storage, email, razorpay };
  const app = createApp(deps);

  return {
    app,
    deps,
    config,
    email,
    llm,
    storage,
    razorpay,
    logLines,
    async stop() {
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}

/** Source ids injected into a prompt's <legal_context>. */
export const promptSourceIds = (prompt: DraftPrompt) => [...prompt.user.matchAll(/<source id="([^"]+)"/g)].map((m) => m[1]!);
