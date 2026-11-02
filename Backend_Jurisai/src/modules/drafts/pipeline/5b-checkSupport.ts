import type { DraftCitation } from "../../../models/draft.model.js";
import { containsLoose, splitParagraphs } from "../review/textMatch.js";
import type { RetrievedSource } from "./2-retrieveContext.js";
import type { LlmGateway, SupportCheckItem } from "./4-llmGateway.js";

/** Keeps one check call bounded; any citations beyond this are marked not_checked. */
export const MAX_SUPPORT_ITEMS = 25;

/**
 * Step 5b: for every citation that passed the lookup-table check, ask an independent
 * model whether the source text supports the passage that cites it. This catches the
 * failure verification can't: a real, correctly numbered source cited for something
 * it doesn't say.
 *
 * It can only DOWNGRADE: an unsupported or overstated citation becomes verified=false
 * (reason "unsupported_by_source"); nothing unverified is ever upgraded.
 */
export async function checkCitationSupport(
  citations: DraftCitation[],
  draftText: string,
  retrieved: RetrievedSource[],
  llm: LlmGateway,
): Promise<DraftCitation[]> {
  const paragraphs = splitParagraphs(draftText);
  const passages = new Map(retrieved.map((r) => [r.source.sourceId, r.passages.join("\n...\n")]));

  // One item per (source, passage): several citations in one paragraph to one source share a verdict.
  const items: SupportCheckItem[] = [];
  const itemFor = new Map<number, string>();
  const byKey = new Map<string, string>();
  citations.forEach((c, index) => {
    const sourceText = passages.get(c.sourceId);
    if (!c.verified || !sourceText) return;
    const passage = paragraphs.find((p) => containsLoose(p, c.text)) ?? c.text;
    const key = `${c.sourceId}\u0000${passage}`;
    let id = byKey.get(key);
    if (!id) {
      if (items.length >= MAX_SUPPORT_ITEMS) return;
      id = String(items.length);
      byKey.set(key, id);
      items.push({ id, passage, citedAs: c.claimedSection, sourceText });
    }
    itemFor.set(index, id);
  });

  const results = new Map((await llm.checkSupport(items)).map((r) => [r.id, r]));

  return citations.map((c, index): DraftCitation => {
    if (!c.verified) return c;
    const result = results.get(itemFor.get(index) ?? "");
    if (!result) return { ...c, support: "not_checked" };
    if (result.verdict === "supported") return { ...c, support: "supported" };
    const lead = result.verdict === "unsupported" ? "The source does not support this" : "The source only partly supports this";
    return {
      ...c,
      verified: false,
      reason: "unsupported_by_source",
      support: result.verdict,
      detail: result.explanation ? `${lead}: ${result.explanation}` : lead,
    };
  });
}
