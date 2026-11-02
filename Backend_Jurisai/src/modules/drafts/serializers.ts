import type { Draft } from "../../models/draft.model.js";
import type { ReviewIssue } from "./review/reviewIssues.js";

/** Client contract: citations are exposed as { source_id, text, verified }. */
export const serializeCitations = (draft: Pick<Draft, "citations">) =>
  draft.citations.map((c) => ({ source_id: c.sourceId, text: c.text, verified: c.verified }));

/**
 * POST /drafts/generate response. `unlinkedMentions` and `reviewIssues` are additive to the
 * agreed contract; reviewIssues is everything still open before filing (see review/reviewIssues.ts).
 */
export const serializeGenerated = (draft: Draft, reviewIssues: ReviewIssue[]) => ({
  draftId: draft._id.toString(),
  draftText: draft.draftText,
  citations: serializeCitations(draft),
  unlinkedMentions: draft.unlinkedMentions.map((m) => ({ mention: m.mention, kind: m.kind })),
  reviewIssues,
});

export const serializeDraft = (draft: Draft, reviewIssues: ReviewIssue[]) => ({
  ...serializeGenerated(draft, reviewIssues),
  documentType: draft.documentType,
  formFields: draft.formFields,
  status: draft.status,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
  editedAt: draft.editedAt ?? null,
});

export const serializeDraftSummary = (draft: Pick<Draft, "_id" | "documentType" | "status" | "citations" | "createdAt" | "updatedAt">) => ({
  draftId: draft._id.toString(),
  documentType: draft.documentType,
  status: draft.status,
  citationCount: draft.citations.length,
  verifiedCitationCount: draft.citations.filter((c) => c.verified).length,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
});
