import type { Citation } from '../api/types';

/**
 * Splits draft text into renderable segments so every legal reference is
 * shown as a citation chip — never as plain text.
 *
 *  - `citation`  a citation returned by the backend (verified or not)
 *  - `unlinked`  text that looks like a statute/case reference but has no
 *                citation entry, i.e. nothing was retrieved to back it
 */
export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; text: string; citationIndex: number }
  | { kind: 'unlinked'; text: string };

export type CitationStatus = 'verified' | 'unverified' | 'unlinked';

export function citationStatus(citation: Citation): CitationStatus {
  return citation.verified && citation.source_id ? 'verified' : 'unverified';
}

/** Stable identity for a citation within a draft (used for review ticks). */
export function citationKey(
  citation: Pick<Citation, 'source_id' | 'text'>,
): string {
  return `${citation.source_id ?? '-'}::${normalizeSpaces(
    citation.text,
  ).toLowerCase()}`;
}

/** Paragraphs are separated by one or more blank lines. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map(p => p.replace(/^\n+|\n+$/g, ''))
    .filter(p => p.trim().length > 0);
}

export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs
    .map(p => p.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Headings in court documents are conventionally set in capitals. */
export function isHeading(paragraph: string): boolean {
  const letters = paragraph.replace(/[^A-Za-z]/g, '');
  return (
    letters.length >= 3 &&
    paragraph.length <= 240 &&
    letters === letters.toUpperCase()
  );
}

interface Range {
  start: number;
  end: number;
  kind: 'citation' | 'unlinked';
  citationIndex: number;
}

/**
 * @param mentions authorities the backend found in the text without a
 *   backing citation (`unlinkedMentions`). Pattern detection below also
 *   runs, as a safety net for older drafts or a skipped server scan.
 */
export function segmentParagraph(
  paragraph: string,
  citations: Citation[],
  mentions: string[] = [],
): Segment[] {
  const ranges = findCitationRanges(paragraph, citations);
  const segments: Segment[] = [];
  let cursor = 0;

  const pushGap = (end: number) => {
    if (end <= cursor) {
      return;
    }
    const gap = paragraph.slice(cursor, end);
    let gapCursor = 0;
    for (const ref of unlinkedRanges(gap, mentions)) {
      if (ref.start > gapCursor) {
        segments.push({ kind: 'text', text: gap.slice(gapCursor, ref.start) });
      }
      segments.push({ kind: 'unlinked', text: gap.slice(ref.start, ref.end) });
      gapCursor = ref.end;
    }
    if (gapCursor < gap.length) {
      segments.push({ kind: 'text', text: gap.slice(gapCursor) });
    }
  };

  for (const range of ranges) {
    pushGap(range.start);
    segments.push({
      kind: 'citation',
      text: paragraph.slice(range.start, range.end),
      citationIndex: range.citationIndex,
    });
    cursor = range.end;
  }
  pushGap(paragraph.length);
  return segments;
}

/**
 * Citation indexes that do not appear anywhere in the text (e.g. after the
 * lawyer edited them out). These are still listed so nothing is hidden.
 */
export function citationsMissingFromText(
  text: string,
  citations: Citation[],
): number[] {
  return citations
    .map((c, i) => (findAll(text, c.text).length === 0 ? i : -1))
    .filter(i => i >= 0);
}

export interface CitationSummary {
  verified: number;
  unverified: number;
  unlinked: number;
  unlinkedTexts: string[];
}

export function summarizeCitations(
  text: string,
  citations: Citation[],
  mentions: string[] = [],
): CitationSummary {
  const unlinkedTexts = new Set<string>();
  for (const paragraph of splitParagraphs(text)) {
    for (const segment of segmentParagraph(paragraph, citations, mentions)) {
      if (segment.kind === 'unlinked') {
        unlinkedTexts.add(normalizeSpaces(segment.text));
      }
    }
  }
  const verified = citations.filter(
    c => citationStatus(c) === 'verified',
  ).length;
  return {
    verified,
    unverified: citations.length - verified,
    unlinked: unlinkedTexts.size,
    unlinkedTexts: [...unlinkedTexts],
  };
}

/** Server mentions plus detected references, earliest first, non-overlapping. */
function unlinkedRanges(
  text: string,
  mentions: string[],
): Array<{ start: number; end: number }> {
  const candidates = [
    ...mentions.flatMap(m => findAll(text, m)),
    ...findUnlinkedReferences(text),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted: Array<{ start: number; end: number }> = [];
  let lastEnd = -1;
  for (const c of candidates) {
    if (c.start >= lastEnd) {
      accepted.push(c);
      lastEnd = c.end;
    }
  }
  return accepted;
}

function findCitationRanges(paragraph: string, citations: Citation[]): Range[] {
  const candidates: Range[] = [];
  citations.forEach((citation, citationIndex) => {
    for (const match of findAll(paragraph, citation.text)) {
      candidates.push({ ...match, kind: 'citation', citationIndex });
    }
  });
  // Earliest first; on a tie prefer the longer (more specific) citation.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted: Range[] = [];
  let lastEnd = -1;
  for (const candidate of candidates) {
    if (candidate.start >= lastEnd) {
      accepted.push(candidate);
      lastEnd = candidate.end;
    }
  }
  return accepted;
}

/** Case- and whitespace-insensitive search that preserves original offsets. */
function findAll(
  haystack: string,
  needle: string,
): Array<{ start: number; end: number }> {
  const trimmed = needle.trim();
  if (!trimmed) {
    return [];
  }
  const pattern = trimmed.split(/\s+/).map(escapeRegExp).join('\\s+');
  const regex = new RegExp(pattern, 'gi');
  const results: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(haystack))) {
    results.push({ start: match.index, end: match.index + match[0].length });
  }
  return results;
}

// ---- Reference detection ---------------------------------------------------
//
// Deliberately conservative patterns for Indian statute and law-report
// references. They exist to catch references the backend did not return a
// citation for, so they only need to recognise the common forms.

const NUM = String.raw`\d+[A-Z]{0,2}(?:\s?\(\s?[0-9a-z]{1,4}\s?\))*`;
const NUM_LIST = String.raw`${NUM}(?:\s*(?:,|and|&|\/|or|to)\s*${NUM})*`;
const WORD = String.raw`(?:[A-Z][A-Za-z.'’&-]*)`;
const ACT_KEYWORD = String.raw`(?:Code of (?:Criminal|Civil) Procedure|CODE OF (?:CRIMINAL|CIVIL) PROCEDURE|Act|ACT|Code|CODE|Sanhita|SANHITA|Adhiniyam|ADHINIYAM|Constitution(?: of India)?|CONSTITUTION(?: OF INDIA)?)`;
const ACT_NAME = String.raw`(?:[Oo][Ff]\s+(?:[Tt][Hh][Ee]\s+)?(?:${WORD}\s+){0,7}?${ACT_KEYWORD}(?:,?\s*\d{4})?)`;
const ACT_ABBR = String.raw`(?:IPC|I\.P\.C\.|Cr\.?\s?P\.?\s?C\.?|C\.?P\.?C\.?|BNSS|BNS|BSA|N\.?\s?I\.?\s?Act|IT Act|HMA|DV Act)`;

const SECTION_WORD = String.raw`(?:[Ss]ections?|SECTIONS?|[Ss]ecs?\.|SECS?\.|[Ss]\.|u\/s\.?|U\/S\.?|[Aa]rticles?|ARTICLES?|Art\.)`;
const STATUTE_REF = String.raw`\b${SECTION_WORD}\s*${NUM_LIST}(?:\s+${ACT_NAME}|\s+${ACT_ABBR}(?![A-Za-z]))?`;
const ORDER_RULE_REF = String.raw`\b(?:Order|ORDER)\s+[IVXL]+\b(?:\s+(?:Rules?|RULES?|[Rr]\.)\s*${NUM_LIST})?(?:\s+(?:${ACT_NAME}|${ACT_ABBR}))?`;
const CASE_REPORTS = [
  String.raw`\(\d{4}\)\s?\d{1,3}\s+SCC\s+\d{1,4}`,
  String.raw`\b\d{4}\s+SCC\s+OnLine\s+[A-Z][A-Za-z]*\s+\d{1,6}`,
  String.raw`\bAIR\s+\d{4}\s+[A-Z][A-Za-z]*\s+\d{1,5}`,
  String.raw`\b\d{4}\s+Cri\.?\s?L\.?\s?J\.?\s+\d{1,5}`,
  String.raw`\[\d{4}\]\s?\d{1,3}\s+S\.?C\.?R\.?\s+\d{1,5}`,
  String.raw`\b\d{4}\s+INSC\s+\d{1,5}`,
];
const REFERENCE_REGEX = new RegExp(
  [STATUTE_REF, ORDER_RULE_REF, ...CASE_REPORTS].join('|'),
  'g',
);

export function findUnlinkedReferences(
  text: string,
): Array<{ start: number; end: number }> {
  const results: Array<{ start: number; end: number }> = [];
  REFERENCE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REFERENCE_REGEX.exec(text))) {
    const value = match[0].replace(/[\s,]+$/, '');
    if (value) {
      results.push({ start: match.index, end: match.index + value.length });
    }
  }
  return results;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
