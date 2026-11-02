import { createHash } from "node:crypto";
import { z } from "zod";
import { ACTS, isActCode } from "../modules/legal/acts.js";
import type { LegalSource, SourceChunk } from "../modules/legal/types.js";

/** Field names follow the ingestion spec: statutes {act_name, section_number, section_text, source_url}. */
export const StatuteRecord = z.object({
  source_id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  act_code: z.string().refine(isActCode, "unknown act_code"),
  act_name: z.string().min(1),
  section_number: z.string().min(1),
  section_title: z.string().min(1),
  section_text: z.string().min(1),
  source_url: z.url(),
});

/** Cases {case_name, court, date, citation_text, source_url} plus one or more judgment excerpts. */
export const CaseRecord = z.object({
  source_id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  case_name: z.string().min(1),
  court: z.string().min(1),
  date: z.iso.date(),
  citation_text: z.string().min(1),
  excerpts: z.array(z.string().min(1)).min(1),
  source_url: z.url(),
});

export const SeedFile = z.object({
  statutes: z.array(StatuteRecord),
  cases: z.array(CaseRecord),
});
export type SeedFile = z.infer<typeof SeedFile>;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface PreparedSource {
  source: LegalSource;
  chunks: SourceChunk[];
}

/** Statutes are one chunk per section; each case excerpt is one chunk. Chunks carry a header for retrieval context. */
export function prepareRecords(seed: SeedFile): PreparedSource[] {
  const out: PreparedSource[] = [];

  for (const r of seed.statutes) {
    const actCode = r.act_code as keyof typeof ACTS;
    const header = `${r.act_name} — Section ${r.section_number}: ${r.section_title}`;
    const text = r.section_text;
    out.push({
      source: {
        sourceId: r.source_id,
        sourceType: "statute",
        actCode,
        actName: r.act_name,
        sectionNumber: r.section_number,
        sectionTitle: r.section_title,
        text,
        sourceUrl: r.source_url,
        contentHash: sha256(JSON.stringify([header, text, r.source_url])),
      },
      chunks: [{ chunkId: `${r.source_id}#0`, sourceId: r.source_id, text: `${header}\n${text}` }],
    });
  }

  for (const r of seed.cases) {
    const header = `${r.case_name}, ${r.citation_text} (${r.court}, decided ${r.date})`;
    const text = r.excerpts.join("\n\n");
    out.push({
      source: {
        sourceId: r.source_id,
        sourceType: "case",
        caseName: r.case_name,
        court: r.court,
        decisionDate: r.date,
        citationText: r.citation_text,
        text,
        sourceUrl: r.source_url,
        contentHash: sha256(JSON.stringify([header, text, r.source_url])),
      },
      chunks: r.excerpts.map((excerpt, i) => ({
        chunkId: `${r.source_id}#${i}`,
        sourceId: r.source_id,
        text: `${header}\n${excerpt}`,
      })),
    });
  }

  const ids = out.map((p) => p.source.sourceId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`duplicate source_id(s): ${[...new Set(dupes)].join(", ")}`);
  return out;
}
