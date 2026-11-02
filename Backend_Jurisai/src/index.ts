import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { ingestSeed } from "./ingestion/ingestSources.js";
import { createLogger } from "./lib/logger.js";
import { ConsoleEmailProvider, SesEmailProvider } from "./modules/auth/emailProvider.js";
import { RazorpaySdkGateway } from "./modules/billing/razorpay.js";
import { AnthropicLlmGateway } from "./modules/drafts/pipeline/4-llmGateway.js";
import { GoogleGenAI } from "@google/genai";
import { GeminiLlmGateway } from "./modules/drafts/pipeline/geminiLlmGateway.js";
import { OfflineLlmGateway } from "./modules/drafts/pipeline/offlineLlmGateway.js";
import type { LlmGateway } from "./modules/drafts/pipeline/4-llmGateway.js";
import { acceptsSamplingParams } from "./modules/drafts/pipeline/modelCapabilities.js";
import { LocalFileStorage, S3FileStorage, UnconfiguredFileStorage } from "./modules/export/fileStorage.js";
import { createEmbedder, createLegalStore } from "./modules/legal/factory.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === "development");

await mongoose.connect(config.MONGODB_URI);
await mongoose.syncIndexes();

const embedder = createEmbedder(config);
const store = await createLegalStore(config, logger);
if (config.LEGAL_STORE === "memory") {
  const result = await ingestSeed({ store, embedder });
  logger.warn(result, "in-memory legal store seeded from the dev dataset (not for production)");
}
const sourceCount = await store.countSources();
if (sourceCount === 0) logger.warn("legal store is empty: run `npm run ingest` or every draft will have no authorities");

function createLlm(): LlmGateway {
  switch (config.LLM_PROVIDER) {
    case "offline":
      logger.warn("LLM_PROVIDER=offline: drafts are labelled templates, no AI calls are made (development only)");
      return new OfflineLlmGateway();
    case "gemini":
      logger.info({ drafting: config.GEMINI_MODEL, checks: config.GEMINI_LIGHT_MODEL }, "LLM provider: Google Gemini");
      if (config.NODE_ENV !== "production") {
        logger.warn("Gemini free tier: Google may use prompts to improve its products. Test with dummy case data only.");
      }
      return new GeminiLlmGateway(new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! }).models, config);
    default:
      logger.info({ drafting: config.GENERATION_MODEL, checks: config.SUPPORT_CHECK_MODEL }, "LLM provider: Anthropic Claude");
      // Credentials resolve from ANTHROPIC_API_KEY (or an `ant auth login` profile).
      return new AnthropicLlmGateway(new Anthropic(), config);
  }
}
const llm = createLlm();

if (config.LLM_PROVIDER === "anthropic" && !acceptsSamplingParams(config.GENERATION_MODEL)) {
  logger.info(
    { model: config.GENERATION_MODEL },
    "generation model does not accept temperature; GENERATION_TEMPERATURE is ignored (output is constrained by retrieval + verification)",
  );
}

const app = createApp({
  config,
  logger,
  store,
  embedder,
  llm,
  storage: config.S3_BUCKET
    ? new S3FileStorage(config.AWS_REGION, config.S3_BUCKET, config.S3_SIGNED_URL_TTL_SECONDS)
    : config.NODE_ENV === "production"
      ? new UnconfiguredFileStorage()
      : new LocalFileStorage(".dev-exports"),
  email:
    config.EMAIL_PROVIDER === "ses"
      ? new SesEmailProvider(config.AWS_REGION, config.EMAIL_FROM!, config.APP_NAME)
      : new ConsoleEmailProvider(logger),
  razorpay:
    config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET
      ? new RazorpaySdkGateway(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)
      : null,
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, legalStore: config.LEGAL_STORE, sources: sourceCount }, `${config.APP_NAME} API listening`);
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close();
  await Promise.allSettled([mongoose.disconnect(), store.close()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
