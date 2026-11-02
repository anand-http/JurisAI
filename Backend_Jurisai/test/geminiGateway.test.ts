import { ApiError, GenerateContentResponse, type GenerateContentParameters } from "@google/genai";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { LlmError } from "../src/modules/drafts/pipeline/4-llmGateway.js";
import { GeminiLlmGateway, geminiJsonSchema, type GeminiModels } from "../src/modules/drafts/pipeline/geminiLlmGateway.js";
import { DraftOutput } from "../src/modules/drafts/pipeline/4-llmGateway.js";

const config = loadConfig({
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://unused",
  JWT_SECRET: "test-secret-test-secret-test-secret-1234",
  LEGAL_STORE: "memory",
  EMBEDDING_PROVIDER: "hash",
  LLM_PROVIDER: "gemini",
  GEMINI_API_KEY: "test-key",
});

/** A response shaped like the SDK's, carrying `text` as the first candidate's part. */
function response(body: unknown, extra: Partial<GenerateContentResponse> = {}, finishReason = "STOP"): GenerateContentResponse {
  return Object.assign(new GenerateContentResponse(), {
    candidates: [{ content: { role: "model", parts: [{ text: typeof body === "string" ? body : JSON.stringify(body) }] }, finishReason }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 900, thoughtsTokenCount: 300 },
    modelVersion: "gemini-3.8-flash-001",
    ...extra,
  });
}

function fakeModels(reply: (params: GenerateContentParameters) => GenerateContentResponse | Promise<GenerateContentResponse>) {
  const calls: GenerateContentParameters[] = [];
  const models: GeminiModels = {
    async generateContent(params) {
      calls.push(params);
      return reply(params);
    },
  };
  return { models, calls };
}

const prompt = { system: "SYSTEM RULES", user: "<legal_context>...</legal_context>" };
const draft = { draftText: "IN THE COURT...", citations: [{ source_id: "nia-s138", claimed_section: "Section 138, Negotiable Instruments Act, 1881", text: "Section 138" }] };

describe("GeminiLlmGateway", () => {
  it("sends the same prompt and a JSON schema, and maps output and token usage", async () => {
    const { models, calls } = fakeModels(() => response(draft));
    const gen = await new GeminiLlmGateway(models, config).generateDraft(prompt);

    expect(gen).toEqual({ output: draft, model: "gemini-3.8-flash-001", inputTokens: 1200, outputTokens: 1200, stopReason: "STOP" });
    const sent = calls[0]!;
    expect(sent.model).toBe("gemini-3.8-flash");
    expect(sent.contents).toBe(prompt.user);
    expect(sent.config).toMatchObject({
      systemInstruction: "SYSTEM RULES",
      responseMimeType: "application/json",
      responseJsonSchema: geminiJsonSchema(DraftOutput),
      maxOutputTokens: config.GENERATION_MAX_TOKENS,
    });
    expect(sent.config?.temperature).toBeUndefined();
  });

  it("produces a schema Gemini accepts (no $schema keyword, closed objects)", () => {
    const schema = geminiJsonSchema(DraftOutput);
    expect(schema).not.toHaveProperty("$schema");
    expect(schema).toMatchObject({ type: "object", additionalProperties: false, required: ["draftText", "citations"] });
  });

  it("runs the lighter checks on the light model with the shared prompts", async () => {
    const { models, calls } = fakeModels((p) =>
      String(p.contents).startsWith("<draft>")
        ? response({ mentions: [{ kind: "statute", quote: "Section 138", reference: "Section 138, Negotiable Instruments Act, 1881" }] })
        : response({ results: [{ id: "0", verdict: "supported", explanation: "" }] }),
    );
    const gateway = new GeminiLlmGateway(models, config);
    expect(await gateway.extractMentions("the draft")).toHaveLength(1);
    expect(await gateway.checkSupport([{ id: "0", passage: "p", citedAs: "c", sourceText: "s" }])).toEqual([
      { id: "0", verdict: "supported", explanation: "" },
    ]);
    expect(calls.map((c) => c.model)).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash-lite"]);
    expect(String(calls[0]!.config?.systemInstruction)).toContain("legal authorities");
    expect(String(calls[1]!.config?.systemInstruction)).toContain("supported by the legal source");
    expect(await gateway.checkSupport([])).toEqual([]); // no call for nothing to check
    expect(calls).toHaveLength(2);
  });

  const codeOf = async (reply: () => GenerateContentResponse | Promise<GenerateContentResponse>) => {
    const { models } = fakeModels(reply);
    try {
      await new GeminiLlmGateway(models, config).generateDraft(prompt);
    } catch (err) {
      return (err as LlmError).code;
    }
    return "no error";
  };

  it("maps truncation, refusals and bad output to the same errors as Claude", async () => {
    expect(await codeOf(() => response("{", {}, "MAX_TOKENS"))).toBe("truncated");
    expect(await codeOf(() => response("", {}, "SAFETY"))).toBe("refusal");
    expect(await codeOf(() => response("", { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } } as never))).toBe("refusal");
    expect(await codeOf(() => response("not json"))).toBe("invalid_output");
    expect(await codeOf(() => response({ draftText: 42 }))).toBe("invalid_output");
  });

  it("treats a bad key or unknown model as setup errors, and rate limits/outages as temporary", async () => {
    const fail = (status: number) => () => Promise.reject(new ApiError({ message: `HTTP ${status}`, status }));
    expect(await codeOf(fail(400))).toBe("misconfigured"); // e.g. invalid API key
    expect(await codeOf(fail(404))).toBe("misconfigured"); // unknown model name
    expect(await codeOf(fail(429))).toBe("unavailable"); // free-tier rate limit
    expect(await codeOf(fail(503))).toBe("unavailable");
    expect(await codeOf(() => Promise.reject(new TypeError("fetch failed")))).toBe("unavailable");
  });
});
