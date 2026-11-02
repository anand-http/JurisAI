import { Types } from "mongoose";
import { DraftModel, type Draft, type DraftCitation, type UnlinkedMention } from "../../../models/draft.model.js";
import type { DraftGeneration } from "./4-llmGateway.js";
import type { RetrievedSource } from "./2-retrieveContext.js";

/** Step 6: persist the draft with full citation verification results. */
export async function saveDraft(input: {
  userId: string;
  documentType: string;
  formFields: Record<string, string>;
  generation: DraftGeneration;
  citations: DraftCitation[];
  unlinkedMentions: UnlinkedMention[];
  mentionScan: Draft["mentionScan"];
  supportCheck: Draft["supportCheck"];
  retrieved: RetrievedSource[];
  topK: number;
}): Promise<Draft> {
  const doc = await DraftModel.create({
    userId: new Types.ObjectId(input.userId),
    documentType: input.documentType,
    formFields: input.formFields,
    draftText: input.generation.output.draftText,
    generatedText: input.generation.output.draftText,
    citations: input.citations,
    unlinkedMentions: input.unlinkedMentions,
    mentionScan: input.mentionScan,
    supportCheck: input.supportCheck,
    retrieval: {
      sourceIds: input.retrieved.map((r) => r.source.sourceId),
      scores: input.retrieved.map((r) => r.score),
      topK: input.topK,
    },
    llm: {
      model: input.generation.model,
      inputTokens: input.generation.inputTokens,
      outputTokens: input.generation.outputTokens,
      stopReason: input.generation.stopReason,
    },
    status: "generated",
  });
  return doc.toObject();
}
