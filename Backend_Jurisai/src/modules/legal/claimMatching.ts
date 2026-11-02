import { ACTS, detectActs, normalizeLegalText } from "./acts.js";
import type { CaseSource, LegalSource, StatuteSource } from "./types.js";

export type ClaimMatch = { matches: true } | { matches: false; detail: string };

// "Section 498A", "S. 498-A", "u/s 318(4)", "Sec 438 (1)". Letter suffixes must be attached
// ("498A", "498-A") so "Section 420 IPC" doesn't read "IP" as a suffix; sub-section groups are
// digits or short roman/alpha labels so "Section 420 (cheating)" isn't read as a sub-section.
const SECTION_PATTERN =
  /\b(?:sections?|sec|s|u\/s)\.?\s*(\d+(?:-?[a-z]{1,2}\b)?(?:\s*\(\s*(?:\d+|[a-z]{1,4})\s*\))*)/i;

interface SectionRef {
  base: string; // "498a"
  subsections: string; // "(4)" or ""
}

/** "498-A" -> {base:"498a"}, "318 (4)" -> {base:"318", subsections:"(4)"} */
export function parseSectionNumber(raw: string): SectionRef {
  const compact = raw.toLowerCase().replace(/[\s-]/g, "");
  const firstParen = compact.indexOf("(");
  return firstParen === -1
    ? { base: compact, subsections: "" }
    : { base: compact.slice(0, firstParen), subsections: compact.slice(firstParen) };
}

/**
 * Same base section, and if both sides name sub-sections they must agree.
 * "Section 438(1)" matches a stored "438"; "Section 318(2)" does not match a stored "318(4)".
 */
export function sectionsAgree(claimed: SectionRef, stored: SectionRef): boolean {
  if (claimed.base !== stored.base) return false;
  if (!claimed.subsections || !stored.subsections) return true;
  return claimed.subsections === stored.subsections;
}

/** Numbers with leading zeros dropped, so "02" (from an ISO date) equals "2". */
const numberTokens = (text: string) => (text.match(/\d+/g) ?? []).map((n) => String(Number(n)));

const withoutParens = (text: string) => normalizeLegalText(text).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

// CPC-style provisions: "Order XIX Rule 3", "O. XIX R. 3", "Order 19 Rule 3(1)".
const ORDER_RULE_PATTERN =
  /\b(?:order|o)\.?\s*([ivxl]+|\d+)\s*,?\s*(?:rule|r)\.?\s*(\d+[a-z]?(?:\s*\(\s*[0-9a-z]{1,4}\s*\))*)/i;

const ROMAN: Array<[number, string]> = [
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];
function toRoman(n: number): string {
  let out = "";
  for (const [value, numeral] of ROMAN) while (n >= value) (out += numeral), (n -= value);
  return out;
}

const isOrderRule = (sectionNumber: string) => /^order\s/i.test(sectionNumber);

/** "Order 19 Rule 3" and "O. XIX R. 3" both -> {order:"xix", rule:{base:"3"}} */
function parseOrderRule(m: RegExpExecArray): { order: string; rule: SectionRef } {
  const order = /^\d+$/.test(m[1]!) ? toRoman(Number(m[1])) : m[1]!.toLowerCase();
  return { order, rule: parseSectionNumber(m[2]!) };
}

/** Finds the provision named in the claim and checks it against the stored one. Returns the matched text. */
function matchProvision(claim: string, source: StatuteSource): { matched: string } | { detail: string } {
  if (isOrderRule(source.sectionNumber)) {
    const m = ORDER_RULE_PATTERN.exec(claim);
    const stored = ORDER_RULE_PATTERN.exec(source.sectionNumber);
    if (!m) return { detail: "claim does not name an order and rule" };
    const a = parseOrderRule(m);
    const b = parseOrderRule(stored!);
    if (a.order !== b.order || !sectionsAgree(a.rule, b.rule)) {
      return { detail: `claims ${m[0].trim()}, source is ${source.sectionNumber}` };
    }
    return { matched: m[0] };
  }

  const m = SECTION_PATTERN.exec(claim);
  if (!m?.[1]) return { detail: "claim does not name a section number" };
  if (!sectionsAgree(parseSectionNumber(m[1]), parseSectionNumber(source.sectionNumber))) {
    return { detail: `claims section ${m[1].trim()}, source is section ${source.sectionNumber}` };
  }
  return { matched: m[0] };
}

function matchStatute(claim: string, source: StatuteSource): ClaimMatch {
  const provision = matchProvision(claim, source);
  if ("detail" in provision) return { matches: false, detail: provision.detail };

  const acts = detectActs(claim);
  if (acts.length === 0) return { matches: false, detail: "claim does not name the act" };
  if (acts.length > 1) return { matches: false, detail: `claim names more than one act (${acts.join(", ")})` };
  if (acts[0] !== source.actCode) {
    return { matches: false, detail: `claims ${ACTS[acts[0]!].name}, source is ${source.actName}` };
  }

  // Any other number in the claim (e.g. the act's year) must belong to the act name.
  const rest = claim.replace(provision.matched, " ");
  const actNumbers = new Set(numberTokens(source.actName));
  const stray = numberTokens(rest).filter((n) => !actNumbers.has(n));
  if (stray.length > 0) return { matches: false, detail: `unexpected number(s) in claim: ${stray.join(", ")}` };

  return { matches: true };
}

/** "vs"/"versus" -> "v", and trailing "& Anr." / "and Others", which lawyers routinely drop. */
const normalizeCaseName = (name: string) =>
  withoutParens(name)
    .replace(/\b(vs|versus)\b/g, "v")
    .replace(/(\s+and)?\s+(anr|ors|another|others)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

function matchCase(claim: string, source: CaseSource): ClaimMatch {
  const normalizedClaim = normalizeCaseName(claim);
  const namesCase = normalizedClaim.includes(normalizeCaseName(source.caseName));
  // A judgment can carry several citations ("2024 INSC 735; [2024] 10 S.C.R. 108"): any one names it.
  const citations = source.citationText.split(";").map(withoutParens).filter(Boolean);
  const namesCitation = citations.some((c) => normalizedClaim.includes(c));
  if (!namesCase && !namesCitation) {
    return { matches: false, detail: `claim does not reference ${source.caseName} or ${source.citationText}` };
  }

  // A right case name with a wrong reporter citation is still a fabricated citation.
  const known = new Set([
    ...numberTokens(source.caseName),
    ...numberTokens(source.citationText),
    ...numberTokens(source.decisionDate),
  ]);
  const stray = numberTokens(claim).filter((n) => !known.has(n));
  if (stray.length > 0) return { matches: false, detail: `citation numbers do not match stored citation: ${stray.join(", ")}` };

  return { matches: true };
}

/** Does a free-text reference ("Section 420, Indian Penal Code, 1860") describe this stored source? */
export function claimMatchesSource(claim: string, source: LegalSource): ClaimMatch {
  return source.sourceType === "statute" ? matchStatute(claim, source) : matchCase(claim, source);
}

/** Canonical way the model is asked to write `claimed_section` for a source (the prompt's `cite_as`). */
export function canonicalReference(source: LegalSource): string {
  if (source.sourceType === "case") return `${source.caseName}, ${source.citationText}`;
  return isOrderRule(source.sectionNumber)
    ? `${source.sectionNumber}, ${source.actName}`
    : `Section ${source.sectionNumber}, ${source.actName}`;
}
