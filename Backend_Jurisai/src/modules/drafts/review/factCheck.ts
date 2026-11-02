import type { LegalSource } from "../../legal/types.js";

/**
 * Deterministic fact grounding. Every date, amount, number and honorific-prefixed name
 * in a draft must come from the lawyer's form inputs (or, for legal content, from the
 * retrieved sources). Anything else is something the model supplied and is flagged.
 *
 * Heuristic by design: single-digit numbers are ignored (too common in legal prose),
 * and only names introduced by an honorific or relation ("Shri", "S/o") are checked.
 */

export type FactKind = "date" | "amount" | "number" | "name";

export interface FactIssue {
  kind: FactKind;
  /** As written in the draft. */
  value: string;
  /** Surrounding text, for display. */
  context: string;
}

interface Found {
  start: number;
  end: number;
  raw: string;
  normalized: string;
}

// ---- dates ---------------------------------------------------------------------

const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthNumber = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 1800 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

const DATE_PATTERNS: Array<{ re: RegExp; toIso: (m: RegExpExecArray) => string | null }> = [
  // 2026-03-01 (what date pickers send)
  { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, toIso: (m) => isoDate(+m[1]!, +m[2]!, +m[3]!) },
  // 01.03.2026, 1/3/2026, 01-03-2026: day first, as written in India
  { re: /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g, toIso: (m) => isoDate(+m[3]!, +m[2]!, +m[1]!) },
  // 1st March, 2026 / 1 Mar 2026 / 1st day of March, 2026
  {
    re: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+day\s+of)?\s+${MONTH}\.?,?\s+(\d{4})\b`, "gi"),
    toIso: (m) => isoDate(+m[3]!, monthNumber(m[2]!), +m[1]!),
  },
  // March 1, 2026
  {
    re: new RegExp(String.raw`\b${MONTH}\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`, "gi"),
    toIso: (m) => isoDate(+m[3]!, monthNumber(m[1]!), +m[2]!),
  },
];

export function findDates(text: string): Found[] {
  const out: Found[] = [];
  let masked = text;
  for (const { re, toIso } of DATE_PATTERNS) {
    re.lastIndex = 0;
    for (const m of masked.matchAll(re)) {
      const normalized = toIso(m);
      if (!normalized) continue;
      out.push({ start: m.index, end: m.index + m[0].length, raw: m[0], normalized });
    }
    masked = blank(masked, re); // a later pattern must not re-read part of an earlier match
  }
  return out;
}

// ---- amounts and numbers ---------------------------------------------------------

/** "4,50,000" -> "450000", "000123" -> "123", "4.50" -> "4.5". */
export function normalizeNumber(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : raw;
}

const UNIT: Record<string, number> = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7 };
const AMOUNT_RE =
  /(?:₹|\bRs\.?|\bINR)\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*\/-)?(?:\s*(lakhs?|lacs?|crores?)\b)?|\b(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?)\b/gi;

export function findAmounts(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const digits = m[1] ?? m[3]!;
    const unit = (m[2] ?? m[4])?.toLowerCase();
    const value = Number(digits.replace(/,/g, "")) * (unit ? UNIT[unit]! : 1);
    out.push({ start: m.index, end: m.index + m[0].length, raw: m[0].trim(), normalized: normalizeNumber(String(value)) });
  }
  return out;
}

export function findNumbers(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/[,.]+$/, "");
    out.push({ start: m.index, end: m.index + raw.length, raw, normalized: normalizeNumber(raw) });
  }
  return out;
}

// ---- names -----------------------------------------------------------------------

const NAME = String.raw`([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})`;
const NAME_PATTERNS = [
  new RegExp(String.raw`\b(?:Mr|Mrs|Ms|Miss|Shri|Sh|Sri|Smt|Kumari|Km|Dr|Late)\.?\s+${NAME}`, "g"),
  new RegExp(String.raw`\b(?:S\/o|D\/o|W\/o|H\/o|son of|daughter of|wife of|husband of)\.?\s+(?:(?:Late|Shri|Sh|Sri|Smt|Mr|Mrs)\.?\s+)*${NAME}`, "g"),
];
/** Words that follow an honorific but are titles or roles, not names ("Mr. Justice"). */
const NOT_NAME = new Set(
  "justice judge advocate counsel magistrate officer inspector sub station house public prosecutor applicant petitioner respondent accused complainant deponent court state sessions learned the".split(" "),
);

function findNames(text: string): Found[] {
  const out: Found[] = [];
  for (const re of NAME_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const words = m[1]!.split(/\s+/).filter((w) => !NOT_NAME.has(w.toLowerCase()));
      if (words.length === 0) continue;
      const start = m.index + m[0].lastIndexOf(m[1]!);
      out.push({ start, end: start + m[1]!.length, raw: m[1]!, normalized: words.join(" ").toLowerCase() });
    }
  }
  return out;
}

// ---- masking ---------------------------------------------------------------------

/** Replace matches with spaces so offsets stay valid for context snippets. */
function blank(text: string, re: RegExp): string {
  return text.replace(re, (m) => " ".repeat(m.length));
}

// Legal references are verified by the citation checks, not here.
const SECTION_NUM = String.raw`\d+[A-Za-z]{0,2}(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*`;
const LEGAL_REFERENCE = new RegExp(
  String.raw`\b(?:sections?|secs?\.?|s\.|u\/s\.?|articles?|art\.|orders?|rules?|r\.)\s*${SECTION_NUM}(?:\s*(?:,|and|&|\/|or|to|read with|r\/w)\s*${SECTION_NUM})*`,
  "gi",
);
const ACT_YEAR = /\b(?:Act|Code|Procedure|Sanhita|Adhiniyam|Constitution of India)\s*,?\s*(?:18|19|20)\d{2}\b/gi;
const LAW_REPORTS = [
  /\(\d{4}\)\s*\d{1,3}\s*SCC\s*\d{1,5}/g,
  /\b\d{4}\s+Supp\s*\(\d+\)\s*SCC\s*\d{1,5}/g,
  /\b\d{4}\s+SCC\s+OnLine\s+[A-Za-z]+\s+\d{1,6}/g,
  /\bAIR\s+\d{4}\s+[A-Za-z]+\s+\d{1,5}/g,
  /\[\d{4}\]\s*\d{1,3}\s+S\.?C\.?R\.?\s+\d{1,5}/g,
  /\b\d{4}\s+INSC\s+\d{1,5}/g,
  /\b\d{4}\s+Cri\.?\s?L\.?\s?J\.?\s+\d{1,5}/g,
];
const PLACEHOLDER = /\[[^\[\]\n]*\]/g;
const PARAGRAPH_NUMBER = /^[ \t]*\(?\d{1,3}[.)](?=\s)/gm;

function maskNonFacts(text: string): string {
  let t = blank(text, PLACEHOLDER);
  for (const re of LAW_REPORTS) t = blank(t, re);
  t = blank(t, ACT_YEAR);
  t = blank(t, LEGAL_REFERENCE);
  return blank(t, PARAGRAPH_NUMBER);
}

// ---- allowed facts ---------------------------------------------------------------

export interface AllowedFacts {
  dates: Set<string>;
  numbers: Set<string>;
  nameWords: Set<string>;
}

const IST_YEAR = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" });

export function allowedFacts(formFields: Record<string, string>, sources: LegalSource[], now = new Date()): AllowedFacts {
  const formTexts = Object.values(formFields);
  const sourceTexts = sources.flatMap((s) =>
    s.sourceType === "statute"
      ? [s.text, s.actName, s.sectionNumber]
      : [s.text, s.caseName, s.citationText, s.decisionDate],
  );

  const dates = new Set<string>();
  const numbers = new Set<string>([IST_YEAR.format(now)]); // "... No. ____ of 2026"
  for (const text of [...formTexts, ...sourceTexts]) {
    for (const d of findDates(text)) dates.add(d.normalized);
    for (const a of findAmounts(text)) numbers.add(a.normalized);
    for (const n of findNumbers(text)) numbers.add(n.normalized);
  }
  const nameWords = new Set(formTexts.flatMap((t) => t.toLowerCase().match(/[a-z]+/g) ?? []));
  return { dates, numbers, nameWords };
}

// ---- check -----------------------------------------------------------------------

function context(text: string, f: Found): string {
  return text
    .slice(Math.max(0, f.start - 40), Math.min(text.length, f.end + 40))
    .replace(/\s+/g, " ")
    .trim();
}

export function checkFacts(draftText: string, allowed: AllowedFacts): FactIssue[] {
  const issues: FactIssue[] = [];
  const seen = new Set<string>();
  const flag = (kind: FactKind, f: Found) => {
    const key = `${kind}:${f.normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, value: f.raw, context: context(draftText, f) });
  };

  let masked = maskNonFacts(draftText);

  const dates = findDates(masked);
  for (const d of dates) if (!allowed.dates.has(d.normalized)) flag("date", d);
  for (const d of dates) masked = masked.slice(0, d.start) + " ".repeat(d.end - d.start) + masked.slice(d.end);

  const amounts = findAmounts(masked);
  for (const a of amounts) if (!allowed.numbers.has(a.normalized)) flag("amount", a);
  masked = blank(masked, AMOUNT_RE);

  for (const n of findNumbers(masked)) {
    if (Number(n.normalized) < 10) continue;
    if (!allowed.numbers.has(n.normalized)) flag("number", n);
  }

  for (const name of findNames(blank(draftText, PLACEHOLDER))) {
    const missing = name.normalized.split(" ").some((w) => !allowed.nameWords.has(w));
    if (missing) flag("name", name);
  }

  return issues.sort((a, b) => draftText.indexOf(a.value) - draftText.indexOf(b.value));
}

/** Bracketed blanks left for the lawyer, e.g. "[FIR No. ____]", "[AUTHORITY REQUIRED: ...]". */
export function findPlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) {
    const inner = m[0].slice(1, -1).trim();
    if (/^(sic|\d{1,3}|emphasis (supplied|added))$/i.test(inner)) continue;
    out.add(m[0]);
  }
  return [...out];
}
