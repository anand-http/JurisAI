import type { DraftCitation, UnlinkedMention } from "../../../models/draft.model.js";
import { claimMatchesSource } from "../../legal/claimMatching.js";
import type { LegalStore } from "../../legal/legalStore.js";
import type { LegalSource } from "../../legal/types.js";
import { containsLoose } from "../review/textMatch.js";
import type { ClaimedCitation, Mention } from "./4-llmGateway.js";

/**
 * Step 5 (pure core): cross-check every citation the model claims against the lookup table.
 * The model's own output is never trusted: a citation is verified only if
 *   1. its source_id exists in the lookup table,
 *   2. that source was actually in the retrieved context for this draft, and
 *   3. claimed_section describes that stored source (same act + section, or same case/citation).
 */
export function verifyCitationsAgainst(
  claimed: ClaimedCitation[],
  lookup: Map<string, LegalSource>,
  retrievedIds: Set<string>,
): DraftCitation[] {
  return claimed.map((c) => {
    const base = { sourceId: c.source_id, text: c.text, claimedSection: c.claimed_section };
    const source = lookup.get(c.source_id);
    if (!source) {
      return { ...base, verified: false, reason: "unknown_source_id", detail: "source_id is not in the lookup table" };
    }
    if (!retrievedIds.has(c.source_id)) {
      return {
        ...base,
        verified: false,
        reason: "not_in_retrieved_context",
        detail: "source exists but was not provided to the model for this draft",
      };
    }
    const match = claimMatchesSource(c.claimed_section, source);
    if (!match.matches) return { ...base, verified: false, reason: "claim_mismatch", detail: match.detail };
    return { ...base, verified: true, reason: "verified" };
  });
}

/** Step 5: load the claimed sources from the lookup table, then verify. */
export async function verifyCitations(
  claimed: ClaimedCitation[],
  retrievedIds: Set<string>,
  store: LegalStore,
): Promise<{ citations: DraftCitation[]; lookup: Map<string, LegalSource> }> {
  const lookup = await store.getSources([...new Set(claimed.map((c) => c.source_id))]);
  return { citations: verifyCitationsAgainst(claimed, lookup, retrievedIds), lookup };
}

/**
 * Authorities named in the draft body that no citation backs, e.g. a section the model
 * wrote into draftText from memory without listing it in citations. Pure; mentions come from
 * the extraction model, but whether each one is backed is decided here, deterministically.
 *
 * A citation that passed lookup but failed the support check still counts as backing: it is
 * already flagged as unverified, and flagging its mention again would double-count it.
 */
export function findUnlinkedMentions(
  mentions: Mention[],
  citations: DraftCitation[],
  lookup: Map<string, LegalSource>,
  draftText: string,
): UnlinkedMention[] {
  const linkedSources = citations
    .filter((c) => c.verified || c.reason === "unsupported_by_source")
    .map((c) => lookup.get(c.sourceId))
    .filter((s): s is LegalSource => s !== undefined);

  const seen = new Set<string>();
  return mentions
    .filter((m) => !linkedSources.some((s) => claimMatchesSource(m.reference, s).matches))
    .filter((m) => {
      const key = m.reference.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Clients highlight by searching the text, so prefer the verbatim quote when it is really there.
    .map((m) => ({
      mention: containsLoose(draftText, m.quote) ? m.quote : m.reference,
      kind: m.kind,
      reference: m.reference,
    }));
}
