import { parquetReadObjects } from "hyparquet";
import { extractText, getDocumentProxy } from "unpdf";
import type { z } from "zod";
import type { CaseRecord } from "../records.js";

/**
 * Supreme Court judgments from the "Indian Supreme Court Judgments" open dataset
 * (Dattam Labs, CC-BY-4.0, s3://indian-supreme-court-judgments, ap-south-1). Judgments are
 * the Supreme Court's own digital reports (eSCR): text PDFs with the official
 * "Issue for Consideration" and headnotes. Attribution to Dattam Labs is required.
 */
export const SC_BUCKET = "https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com";
export const SC_ATTRIBUTION = "Indian Supreme Court Judgments dataset by Dattam Labs (CC-BY-4.0)";

export interface ScMetadataRow {
  title: string;
  petitioner: string | null;
  respondent: string | null;
  citation: string | null; // "[2024] 10 S.C.R. 108"
  case_id: string | null; // "2024 INSC 735"
  decision_date: string | null; // "25-09-2024"
  disposal_nature: string | null;
  raw_html: string | null; // carries "Issue for Consideration"
  path: string; // "2024_10_108_125"
  nc_display: string | null; // "2024INSC735"
  year: number | string;
}

// ---- topics --------------------------------------------------------------------

/** Keyword filters matched against the title and official summary, before any PDF is downloaded. */
export const TOPICS: Record<string, RegExp[]> = {
  bail: [/\banticipatory bail\b/i, /\bbail\b/i],
  quashing: [/\bquash/i, /\binherent powers?\b/i, /\bs(?:ection|s?\.)\s*482\b/i, /\bs(?:ection|s?\.)\s*528\b.*BNSS/i],
  fir: [/registration of (?:the |an )?F\.?\s?I\.?\s?R/i, /\bs(?:ection|s?\.)\s*154\b/i, /first information report/i],
  cheque: [/negotiable instruments/i, /dishono(?:u)?r of cheque/i, /\bcheque\b/i],
  contract: [/breach of contract/i, /liquidated damages/i, /\bs(?:ection|s?\.)\s*7[34]\b.{0,40}contract act/i],
  tenancy: [/transfer of property act/i, /\beviction\b/i, /\btenan(?:t|cy)\b/i, /\blease\b/i],
  affidavit: [/\baffidavit\b/i],
};

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "Issue for Consideration" text from the metadata's HTML, when present. */
export function issueForConsideration(row: Pick<ScMetadataRow, "raw_html">): string {
  const text = stripHtml(row.raw_html ?? "");
  const m = /Issue for Consideration\s*(.+?)(?:Decision Date\s*:|$)/i.exec(text);
  return m?.[1]?.trim() ?? "";
}

export const matchTopicsInText = (text: string, topics: string[]) =>
  topics.filter((t) => TOPICS[t]?.some((re) => re.test(text)));

/** Matches on the title and official summary. Metadata before mid-2023 has no summary. */
export function matchTopics(row: ScMetadataRow, topics: string[]): string[] {
  return matchTopicsInText(`${row.title} ${issueForConsideration(row)}`, topics);
}

/** The headnotes sit on the first pages of each judgment; enough to judge its topic. */
export const headnoteText = (pages: string[]) => pages.slice(0, 3).join("\n").slice(0, 8000);

// ---- metadata ------------------------------------------------------------------

async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch((err: Error) => err);
  if (res instanceof Response && res.ok) return res;
  if (attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return fetchWithRetry(url, attempt + 1);
  }
  throw new Error(`GET ${url} failed: ${res instanceof Response ? `HTTP ${res.status}` : res.message}`);
}

export async function fetchYearMetadata(year: number): Promise<ScMetadataRow[]> {
  const res = await fetchWithRetry(`${SC_BUCKET}/metadata/parquet/year=${year}/metadata.parquet`);
  return (await parquetReadObjects({ file: await res.arrayBuffer() })) as ScMetadataRow[];
}

export const pdfUrl = (row: Pick<ScMetadataRow, "path" | "year">) =>
  `${SC_BUCKET}/data/pdf/year=${row.year}/english/${row.path}_EN.pdf`;

// ---- text ----------------------------------------------------------------------

export async function extractPages(pdfBytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(pdfBytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

const headerKey = (line: string) => line.toLowerCase().replace(/[\d\s]+/g, "");

/**
 * Joins pages into clean text: drops running headers/footers (first/last lines that repeat,
 * ignoring page numbers, on many pages), the "Digitally signed" stamp, and rejoins words
 * hyphenated across line breaks.
 */
export function cleanJudgmentText(pages: string[]): string {
  const edgeCounts = new Map<string, number>();
  const edges = (lines: string[]) => [...lines.slice(0, 2), ...lines.slice(-2)];
  const pageLines = pages.map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean));
  for (const lines of pageLines) {
    for (const key of new Set(edges(lines).map(headerKey))) edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(pages.length * 0.3));
  const isRunningHeader = (line: string) => (edgeCounts.get(headerKey(line)) ?? 0) >= threshold;

  const kept = pageLines.flatMap((lines) => {
    const edgeSet = new Set([...lines.slice(0, 2), ...lines.slice(-2)]);
    return lines.filter((l) => !(edgeSet.has(l) && isRunningHeader(l)) && !/^Digitally signed by/i.test(l) && !/^Signature Not Verified$/i.test(l));
  });
  return kept.join("\n").replace(/(\w+)-\n(\w+)/g, (_m, before: string, after: string) =>
    COMPOUND_START.has(before.toLowerCase()) || COMPOUND_END.has(after.toLowerCase())
      ? `${before}-${after}` // "brother-in-law", "cross-examination"
      : `${before}${after}`, // "re-ceived" -> "received"
  );
}

/** Hyphens at a line break are usually syllable breaks, except in these compounds. */
const COMPOUND_START = new Set(["cross", "self", "non", "co", "ex", "vice", "quasi", "counter", "pre", "post"]);
const COMPOUND_END = new Set(["in", "law", "cum", "chief", "based", "related", "wise", "like", "vis"]);

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Packs lines into ~targetWords chunks, preferring to break at the end of a sentence or
 * before a numbered paragraph ("12. ..."), never exceeding maxWords.
 */
export function chunkText(text: string, targetWords = 350, maxWords = 550): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;
  const flush = () => {
    if (current.length) chunks.push(current.join(" ").replace(/\s+/g, " ").trim());
    current = [];
    words = 0;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const n = wordCount(line);
    if (words + n > maxWords) flush();
    current.push(line);
    words += n;
    const next = lines[i + 1] ?? "";
    const goodBreak = /[.:;]["”’)]?$/.test(line) || /^\(?\d{1,3}[.)]\s/.test(next);
    if (words >= targetWords && goodBreak) flush();
  }
  flush();
  return chunks;
}

// ---- record ----------------------------------------------------------------------

const SMALL_WORDS = new Set(["of", "and", "the", "in", "for", "to", "at", "by", "on", "v.", "versus", "vs.", "&", "@", "or", "an", "a"]);

/** "THE STATE OF BIHAR" -> "The State of Bihar"; keeps "U.P.", "M/s", "@". */
export function titleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      if (/^([A-Z]\.){2,}$/.test(word)) return word; // U.P., M.P.
      if (/^M\/S\.?$/i.test(word)) return "M/s";
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(/(^|[-(’'])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(" ");
}

/** "25-09-2024" -> "2024-09-25" */
export function isoDate(ddmmyyyy: string | null): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function sourceIdFor(row: Pick<ScMetadataRow, "nc_display" | "path">): string {
  const base = row.nc_display?.trim() || row.path;
  return `sc-${base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Party fields sometimes carry annotations like "... & ANR. R1: STATE OF ..."; keep the name only. */
const cleanParty = (party: string) => party.replace(/\s+[PR]\d+\s*:.*$/i, "").trim();

export function caseName(row: Pick<ScMetadataRow, "title" | "petitioner" | "respondent">): string {
  if (row.petitioner && row.respondent) {
    return `${titleCase(cleanParty(row.petitioner))} v. ${titleCase(cleanParty(row.respondent))}`;
  }
  return titleCase(row.title.replace(/\s+versus\s+/i, " v. "));
}

/** Builds a record in the seed-file shape, so ingestSources() can chunk, embed and upsert it. */
export function toCaseRecord(row: ScMetadataRow, chunks: string[]): z.input<typeof CaseRecord> | null {
  const date = isoDate(row.decision_date);
  const citation = [row.case_id, row.citation].filter(Boolean).join("; ");
  if (!date || !citation || chunks.length === 0) return null;
  return {
    source_id: sourceIdFor(row),
    case_name: caseName(row),
    court: "Supreme Court of India",
    date,
    citation_text: citation,
    excerpts: chunks,
    source_url: pdfUrl(row),
  };
}
