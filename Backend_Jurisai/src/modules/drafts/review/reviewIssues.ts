import type { Draft } from "../../../models/draft.model.js";
import type { LegalStore } from "../../legal/legalStore.js";
import type { LegalSource } from "../../legal/types.js";
import { allowedFacts, checkFacts, findPlaceholders, type FactKind } from "./factCheck.js";
import { containsLoose } from "./textMatch.js";

export type ReviewIssue =
  | { type: "unverified_citation"; text: string; source_id: string; detail: string }
  | { type: "unlinked_authority"; text: string }
  | { type: "unsupported_fact"; kind: FactKind; text: string; context: string }
  | { type: "placeholder"; text: string };

export type ReviewableDraft = Pick<Draft, "draftText" | "citations" | "unlinkedMentions" | "formFields">;

/**
 * Everything the lawyer must look at before filing, evaluated against the CURRENT text:
 * an unverified citation or unlinked mention the lawyer has already edited out no longer
 * counts, and facts/placeholders are re-checked after every edit.
 */
export function computeReviewIssues(draft: ReviewableDraft, sources: LegalSource[], now = new Date()): ReviewIssue[] {
  const text = draft.draftText;
  const issues: ReviewIssue[] = [];

  for (const c of draft.citations) {
    if (!c.verified && containsLoose(text, c.text)) {
      issues.push({ type: "unverified_citation", text: c.text, source_id: c.sourceId, detail: c.detail ?? c.reason });
    }
  }
  for (const m of draft.unlinkedMentions) {
    if (containsLoose(text, m.mention)) issues.push({ type: "unlinked_authority", text: m.mention });
  }
  for (const f of checkFacts(text, allowedFacts(draft.formFields, sources, now))) {
    issues.push({ type: "unsupported_fact", kind: f.kind, text: f.value, context: f.context });
  }
  for (const p of findPlaceholders(text)) issues.push({ type: "placeholder", text: p });

  return issues;
}

/** Loads the draft's retrieved sources (the legal content it may legitimately quote) and computes issues. */
export async function loadReviewIssues(
  draft: ReviewableDraft & Pick<Draft, "retrieval">,
  store: LegalStore,
): Promise<ReviewIssue[]> {
  const sources = await store.getSources(draft.retrieval.sourceIds);
  return computeReviewIssues(draft, [...sources.values()]);
}
