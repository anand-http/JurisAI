import type { DraftPrompt } from "./3-buildPrompt.js";
import type { DraftGeneration, LlmGateway, Mention, SupportCheckItem, SupportResult } from "./4-llmGateway.js";

/**
 * Development only (config refuses it in production): stands in for Claude so the whole
 * app can be exercised without API credit. It builds a plainly labelled template from the
 * prompt's form fields and cites the retrieved statutes via their cite_as strings, so
 * retrieval, verification, the fact check, review issues, editing and export all run for
 * real on its output. It is not legal drafting.
 */
export const OFFLINE_BANNER = "[OFFLINE TEST DRAFT: assembled from a template without AI, for testing the app. Not for filing.]";

const unescapeXml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const humanize = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

interface ParsedPrompt {
  documentType: string;
  fields: Array<[string, string]>;
  sources: Array<{ id: string; citeAs: string; type: "statute" | "case" }>;
}

export function parsePrompt(user: string): ParsedPrompt {
  const documentType = unescapeXml(/<document_type>([\s\S]*?)<\/document_type>/.exec(user)?.[1] ?? "Document");
  const fields = [...user.matchAll(/<field name="([^"]*)">([\s\S]*?)<\/field>/g)].map(
    (m): [string, string] => [unescapeXml(m[1]!), unescapeXml(m[2]!).trim()],
  );
  const sources = [...user.matchAll(/<source id="([^"]+)" cite_as="([^"]+)" type="(statute|case)"/g)].map((m) => ({
    id: unescapeXml(m[1]!),
    citeAs: unescapeXml(m[2]!),
    type: m[3] as "statute" | "case",
  }));
  return { documentType, fields, sources };
}

export class OfflineLlmGateway implements LlmGateway {
  async generateDraft(prompt: DraftPrompt): Promise<DraftGeneration> {
    const { documentType, fields, sources } = parsePrompt(prompt.user);
    const value = (key: string) => fields.find(([k]) => k === key)?.[1];
    const cited = sources.filter((s) => s.type === "statute").slice(0, 3);

    const paragraphs: string[] = [
      OFFLINE_BANNER,
      (value("courtName") ? `IN THE ${value("courtName")}` : "IN THE [COURT]").toUpperCase(),
      documentType.toUpperCase(),
      "PARTICULARS",
      ...fields.filter(([, v]) => v).map(([k, v], i) => `${i + 1}. ${humanize(k)}: ${v}`),
      "PROVISIONS RETRIEVED FOR THIS DRAFT",
      ...(cited.length > 0
        ? cited.map((s, i) => `${fields.length + i + 1}. Reference is made to ${s.citeAs}.`)
        : ["No relevant statutory provision was retrieved for this draft; authorities must be added by counsel."]),
      "PRAYER",
      "[PRAYER TO BE DRAFTED BY COUNSEL]",
      "PLACE: [____]\nDATE: [____]",
      "ADVOCATE FOR THE APPLICANT",
    ];

    return {
      output: {
        draftText: paragraphs.join("\n\n"),
        citations: cited.map((s) => ({ source_id: s.id, claimed_section: s.citeAs, text: s.citeAs })),
      },
      model: "offline-template",
      inputTokens: 0,
      outputTokens: 0,
      stopReason: "end_turn",
    };
  }

  /** The template names only what it cites, so every mention is its own citation. */
  async extractMentions(draftText: string): Promise<Mention[]> {
    return [...draftText.matchAll(/Reference is made to (.+?)\.$/gm)].map((m) => ({
      kind: "statute",
      quote: m[1]!,
      reference: m[1]!,
    }));
  }

  /** The template only names provisions, which the support check treats as supported. */
  async checkSupport(items: SupportCheckItem[]): Promise<SupportResult[]> {
    return items.map((i) => ({ id: i.id, verdict: "supported", explanation: "" }));
  }
}
