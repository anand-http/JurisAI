import { z } from "zod";
import { ACTS, type ActCode } from "../../modules/legal/acts.js";
import type { StatuteRecord } from "../records.js";

/**
 * Official bare-act text from India Code (indiacode.gov.in, Legislative Department,
 * Government of India). The site runs DSpace, whose public REST API returns one item per
 * section with the act, section number, heading and the section text as HTML.
 */
export const INDIA_CODE_API = "https://indiacode.gov.in/server/api";

/**
 * India Code act ids for the acts this library covers. The IPC, CrPC and Indian Evidence
 * Act (repealed on 1 July 2024) are not available section-by-section on the new site, so
 * their verified sections stay in the dev seed until another official source is added.
 */
export const INDIA_CODE_ACTS: Partial<Record<ActCode, string>> = {
  BNS: "AC_CEN_5_23_00048_2023-45_1719292564123",
  BNSS: "AC_CEN_5_23_00049_202346_1719552320687",
  BSA: "AC_CEN_5_23_00049_2023-47_1719292804654",
  NIA: "AC_CEN_2_33_00042_00042_1523271998701",
  ICA: "AC_CEN_3_20_00035_187209_1523268996428",
  TPA: "AC_CEN_3_20_00042_188204_1523272233671",
  CPC: "AC_CEN_3_20_00051_190805_1523340333624",
};

export interface IcSection {
  handle: string;
  sectionNumber: string;
  title: string;
  html: string;
  order: number;
  repealed: boolean;
}

const Metadata = z.record(z.string(), z.array(z.object({ value: z.string().nullable() })));
const SearchPage = z.object({
  _embedded: z.object({
    searchResult: z.object({
      page: z.object({ totalElements: z.number(), totalPages: z.number() }),
      _embedded: z.object({
        objects: z.array(
          z.object({ _embedded: z.object({ indexableObject: z.object({ handle: z.string().nullable(), metadata: Metadata }) }) }),
        ),
      }),
    }),
  }),
});

const USER_AGENT = "JurisAI-ingest (legal research; contact via app website)";

async function getJson(url: string, attempt = 1): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(60_000) }).catch(
    (err: Error) => err,
  );
  if (res instanceof Response && res.ok) return res.json();
  if (attempt < 4) {
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    return getJson(url, attempt + 1);
  }
  throw new Error(`GET ${url} failed: ${res instanceof Response ? `HTTP ${res.status}` : res.message}`);
}

/** Every section item of one act, in the act's own order. */
export async function fetchActSections(actId: string, pageSize = 100): Promise<IcSection[]> {
  const out: IcSection[] = [];
  for (let page = 0; ; page++) {
    const params = new URLSearchParams({ query: `dc.identifier.act_id:"${actId}"`, dsoType: "ITEM", size: String(pageSize), page: String(page) });
    const body = SearchPage.parse(await getJson(`${INDIA_CODE_API}/discover/search/objects?${params}`));
    const { objects } = body._embedded.searchResult._embedded;
    for (const o of objects) {
      const md = o._embedded.indexableObject.metadata;
      const get = (k: string) => md[k]?.[0]?.value ?? null;
      if (get("dc.identifier.collection") !== "SECTION") continue;
      const sectionNumber = get("dc.identifier.section_number")?.trim();
      if (!sectionNumber) continue;
      out.push({
        handle: o._embedded.indexableObject.handle ?? "",
        sectionNumber,
        title: (get("dc.title") ?? "").trim().replace(/\.$/, ""),
        html: get("dc.identifier.section_page_note") ?? "",
        order: Number(get("dc.identifier.order_number") ?? 0),
        repealed: get("dc.identifier.repealed") === "true",
      });
    }
    if (page + 1 >= body._embedded.searchResult.page.totalPages || objects.length === 0) break;
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * India Code marks amended text with footnote brackets: "2[a term which may extend to two years]".
 * Drops the "N[" openers and the "]" that close them, keeping any genuine [ ] pairs.
 */
export function stripAmendmentMarkers(text: string): string {
  const withoutOpeners = text.replace(/\b\d{1,3}\[/g, "\u0000");
  let out = "";
  let genuineOpen = 0;
  let markerOpen = 0;
  for (const ch of withoutOpeners) {
    if (ch === "\u0000") markerOpen++;
    else if (ch === "[") (genuineOpen++, (out += ch));
    else if (ch === "]") {
      if (genuineOpen > 0) (genuineOpen--, (out += ch));
      else if (markerOpen > 0) markerOpen--;
      // an unmatched "]" is dropped
    } else out += ch;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };

export function sectionHtmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>|<hr[^>]*>|<\/?(p|div|center)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) =>
      e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/--/g, "—");
  return stripAmendmentMarkers(text)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const OMITTED = /^\W*(omitted|repealed|rep\.)(?=\W|$)/i;

export const statuteSourceId = (code: ActCode, sectionNumber: string) =>
  `${code.toLowerCase()}-s${sectionNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** One section in the seed-file shape; null for omitted or empty sections. */
export function toStatuteRecord(code: ActCode, section: IcSection): z.input<typeof StatuteRecord> | null {
  const text = sectionHtmlToText(section.html);
  if (section.repealed || text.length < 15 || OMITTED.test(text)) return null;
  return {
    source_id: statuteSourceId(code, section.sectionNumber),
    act_code: code,
    act_name: ACTS[code].name,
    section_number: section.sectionNumber,
    section_title: section.title || `Section ${section.sectionNumber}`,
    section_text: text,
    source_url: section.handle ? `https://indiacode.gov.in/handle/${section.handle}` : "https://indiacode.gov.in/",
  };
}

export const isIndiaCodeSource = (sourceUrl: string) => sourceUrl.startsWith("https://indiacode.gov.in/");
