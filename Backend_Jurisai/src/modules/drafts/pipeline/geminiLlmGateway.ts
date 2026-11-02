import { ApiError, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import type { Config } from "../../../config/env.js";
import type { DraftPrompt } from "./3-buildPrompt.js";
import {
  DraftOutput,
  EXTRACTION_SYSTEM,
  LlmError,
  MentionOutput,
  SUPPORT_SYSTEM,
  SupportOutput,
  renderSupportItems,
  type DraftGeneration,
  type LlmGateway,
  type Mention,
  type SupportCheckItem,
  type SupportResult,
} from "./4-llmGateway.js";

/**
 * Google Gemini as the drafting model (LLM_PROVIDER=gemini). Same prompts, same structured
 * output schemas and the same error contract as the Claude gateway, so everything after
 * step 4 (verification, support check, fact check, export gate) is unchanged.
 *
 * Data use: on Gemini's free tier Google may use prompts to improve its products; on the
 * paid tier it does not. Prompts contain client case facts, so use the free tier only for
 * testing with dummy data.
 */

/** The part of the SDK client this gateway uses (`new GoogleGenAI({ apiKey }).models`). */
export interface GeminiModels {
  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

/** Gemini accepts standard JSON Schema via responseJsonSchema, minus the `$schema` keyword. */
export function geminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** Finish reasons that mean the model declined or its output was withheld. */
const DECLINED = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"]);

export function parseGeminiResponse<T>(res: GenerateContentResponse, schema: z.ZodType<T>): T {
  const blocked = res.promptFeedback?.blockReason;
  if (blocked) throw new LlmError("refusal", `prompt blocked (${blocked})`);
  const reason = res.candidates?.[0]?.finishReason;
  if (reason === "MAX_TOKENS") throw new LlmError("truncated", "model output hit maxOutputTokens");
  if (reason && DECLINED.has(reason)) throw new LlmError("refusal", `model declined (${reason})`);

  const text = res.text;
  if (!text) throw new LlmError("invalid_output", `no text in response (finish reason ${reason ?? "unknown"})`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError("invalid_output", "structured output was not valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new LlmError("invalid_output", `structured output failed validation: ${parsed.error.message}`);
  return parsed.data;
}

/** Same mapping as the Claude gateway: 4xx is our setup (bad key, unknown model); 429/5xx/network are temporary. */
export function translateGeminiError(err: unknown): never {
  if (err instanceof LlmError) throw err;
  if (err instanceof ApiError) {
    const { status } = err;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      throw new LlmError("misconfigured", `Gemini rejected the request (${status}): ${err.message}`);
    }
    throw new LlmError("unavailable", `Gemini request failed (${status}): ${err.message}`);
  }
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(err.message))) {
    throw new LlmError("unavailable", `Gemini connection failed: ${err.message}`);
  }
  throw err;
}

export class GeminiLlmGateway implements LlmGateway {
  constructor(
    private readonly models: GeminiModels,
    private readonly config: Config,
  ) {}

  private async call<T>(model: string, system: string, user: string, schema: z.ZodType<T>, maxOutputTokens: number, timeoutMs: number) {
    try {
      const res = await this.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: geminiJsonSchema(schema),
          // Thinking tokens count against this limit on Gemini, so it is set generously.
          maxOutputTokens,
          // No temperature: Gemini 3 models are tuned for their default and Google advises against lowering it.
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });
      return { res, output: parseGeminiResponse(res, schema) };
    } catch (err) {
      translateGeminiError(err);
    }
  }

  async generateDraft(prompt: DraftPrompt): Promise<DraftGeneration> {
    const model = this.config.GEMINI_MODEL;
    const { res, output } = await this.call(model, prompt.system, prompt.user, DraftOutput, this.config.GENERATION_MAX_TOKENS, 240_000);
    const usage = res.usageMetadata;
    return {
      output,
      model: res.modelVersion ?? model,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      stopReason: res.candidates?.[0]?.finishReason ?? null,
    };
  }

  async extractMentions(draftText: string): Promise<Mention[]> {
    const { output } = await this.call(
      this.config.GEMINI_LIGHT_MODEL,
      EXTRACTION_SYSTEM,
      `<draft>\n${draftText}\n</draft>`,
      MentionOutput,
      8192,
      90_000,
    );
    return output.mentions;
  }

  async checkSupport(items: SupportCheckItem[]): Promise<SupportResult[]> {
    if (items.length === 0) return [];
    const { output } = await this.call(this.config.GEMINI_LIGHT_MODEL, SUPPORT_SYSTEM, renderSupportItems(items), SupportOutput, 8192, 90_000);
    return output.results;
  }
}
