import type { Logger } from "pino";
import type { Config } from "../../config/env.js";
import { HttpError } from "../../lib/errors.js";
import type { Draft, UnlinkedMention } from "../../models/draft.model.js";
import type { Embedder } from "../legal/embeddings.js";
import type { LegalStore } from "../legal/legalStore.js";
import { resolveDocumentType } from "./documentTypes.js";
import { buildRetrievalQuery } from "./pipeline/1-buildRetrievalQuery.js";
import { retrieveContext } from "./pipeline/2-retrieveContext.js";
import { buildDraftPrompt } from "./pipeline/3-buildPrompt.js";
import { LlmError, type LlmGateway } from "./pipeline/4-llmGateway.js";
import { findUnlinkedMentions, verifyCitations } from "./pipeline/5-verifyCitations.js";
import { checkCitationSupport } from "./pipeline/5b-checkSupport.js";
import { saveDraft } from "./pipeline/6-saveDraft.js";
import { computeReviewIssues, type ReviewIssue } from "./review/reviewIssues.js";

export interface DraftPipelineDeps {
  config: Config;
  store: LegalStore;
  embedder: Embedder;
  llm: LlmGateway;
  logger: Logger;
}

export interface GenerateDraftInput {
  userId: string;
  documentType: string;
  formFields: Record<string, string>;
}

function toHttpError(err: LlmError): HttpError {
  switch (err.code) {
    case "refusal":
      return new HttpError(422, "generation_refused", "The model declined to draft this document. Review the inputs and try again.");
    case "unavailable":
    case "misconfigured":
      return new HttpError(503, "llm_unavailable", "Drafting service is temporarily unavailable. Please retry shortly.");
    default:
      return new HttpError(502, "generation_failed", "Draft generation failed. Please retry.");
  }
}

export async function generateDraft(
  deps: DraftPipelineDeps,
  input: GenerateDraftInput,
): Promise<{ draft: Draft; reviewIssues: ReviewIssue[] }> {
  const { config, logger } = deps;
  const started = Date.now();
  const profile = resolveDocumentType(input.documentType);

  const query = buildRetrievalQuery(profile, input.formFields);
  const retrieved = await retrieveContext(
    query,
    { topK: config.RETRIEVAL_TOP_K, minScore: config.RETRIEVAL_MIN_SCORE },
    deps,
  );
  const prompt = buildDraftPrompt({ profile, formFields: input.formFields, retrieved });

  let generation;
  try {
    generation = await deps.llm.generateDraft(prompt);
  } catch (err) {
    if (err instanceof LlmError) {
      // "misconfigured" (no credit, bad key, unknown model) needs an operator, so it logs as an error.
      logger[err.code === "misconfigured" ? "error" : "warn"](
        { userId: input.userId, code: err.code, reason: err.message },
        "draft generation failed",
      );
      throw toHttpError(err);
    }
    throw err;
  }

  const retrievedIds = new Set(retrieved.map((r) => r.source.sourceId));
  const verification = await verifyCitations(generation.output.citations, retrievedIds, deps.store);
  const { lookup } = verification;
  const draftText = generation.output.draftText;

  // Both second-pass checks are independent model calls: run them together, and let
  // neither failure cost the user a generated draft.
  const [support, scan] = await Promise.allSettled([
    config.SUPPORT_CHECK_ENABLED
      ? checkCitationSupport(verification.citations, draftText, retrieved, deps.llm)
      : Promise.resolve(null),
    config.CITATION_SCAN_ENABLED ? deps.llm.extractMentions(draftText) : Promise.resolve(null),
  ]);

  let citations = verification.citations;
  let supportCheck: Draft["supportCheck"] = "skipped";
  if (support.status === "fulfilled" && support.value) {
    citations = support.value;
    supportCheck = "completed";
  } else if (support.status === "rejected") {
    supportCheck = "failed";
    logger.warn({ userId: input.userId, err: (support.reason as Error).message }, "citation support check failed");
  }

  let unlinkedMentions: UnlinkedMention[] = [];
  let mentionScan: Draft["mentionScan"] = "skipped";
  if (scan.status === "fulfilled" && scan.value) {
    unlinkedMentions = findUnlinkedMentions(scan.value, verification.citations, lookup, draftText);
    mentionScan = "completed";
  } else if (scan.status === "rejected") {
    mentionScan = "failed";
    logger.warn({ userId: input.userId, err: (scan.reason as Error).message }, "citation mention scan failed");
  }

  const draft = await saveDraft({
    userId: input.userId,
    documentType: profile.key,
    formFields: input.formFields,
    generation,
    citations,
    unlinkedMentions,
    mentionScan,
    supportCheck,
    retrieved,
    topK: config.RETRIEVAL_TOP_K,
  });

  // Metadata only: never case facts, form fields or draft text.
  logger.info(
    {
      userId: input.userId,
      draftId: draft._id.toString(),
      documentType: profile.key,
      retrieved: retrieved.length,
      citations: citations.length,
      verified: citations.filter((c) => c.verified).length,
      unverifiedReasons: citations.filter((c) => !c.verified).map((c) => c.reason),
      unlinkedMentions: unlinkedMentions.length,
      mentionScan,
      supportCheck,
      unsupported: citations.filter((c) => c.reason === "unsupported_by_source").length,
      model: generation.model,
      inputTokens: generation.inputTokens,
      outputTokens: generation.outputTokens,
      ms: Date.now() - started,
    },
    "draft generated",
  );
  return { draft, reviewIssues: computeReviewIssues(draft, retrieved.map((r) => r.source)) };
}
