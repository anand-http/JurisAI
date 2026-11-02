import { describe, expect, it } from "vitest";
import { ingestSeed, ingestSources } from "../src/ingestion/ingestSources.js";
import { StatuteRecord, prepareRecords } from "../src/ingestion/records.js";
import { sectionHtmlToText, statuteSourceId, stripAmendmentMarkers, toStatuteRecord, type IcSection } from "../src/ingestion/sources/indiaCode.js";
import { canonicalReference, claimMatchesSource } from "../src/modules/legal/claimMatching.js";
import { HashingEmbedder } from "../src/modules/legal/embeddings.js";
import { MemoryLegalStore } from "../src/modules/legal/memoryLegalStore.js";

// Markup exactly as India Code returns it (trimmed).
const S138_HTML =
  '<span style="margin-left: 15px;"></span>1[Where any cheque ... is returned by the bank unpaid, such person shall be punished with imprisonment for 2[a term which may be extended to two years], or with fine, or with both:<br/><hr style="border: none;"/> Provided that nothing contained in this section shall apply unless--<br/><hr/> (b) the payee makes a demand by giving a notice, in writing, 3[within thirty days] of the receipt of information;]<br/><hr/> <i>Explanation.</i>-- For the purposes of this section, &quot;debt or other liability&quot; means a legally enforceable debt.';

const section = (over: Partial<IcSection> = {}): IcSection => ({
  handle: "123456789/535880",
  sectionNumber: "138",
  title: "Dishonour of cheque for insufficiency, etc., of funds in the account",
  html: S138_HTML,
  order: 143,
  repealed: false,
  ...over,
});

describe("India Code text cleaning", () => {
  it("drops amendment markers but keeps genuine brackets", () => {
    expect(stripAmendmentMarkers("1[Where any cheque 2[a term] or fine:]")).toBe("Where any cheque a term or fine:");
    expect(stripAmendmentMarkers("see [Annexure A] and 3[within thirty days]")).toBe("see [Annexure A] and within thirty days");
  });

  it("turns section HTML into clean paragraphs", () => {
    const text = sectionHtmlToText(S138_HTML);
    expect(text.split("\n")).toEqual([
      "Where any cheque ... is returned by the bank unpaid, such person shall be punished with imprisonment for a term which may be extended to two years, or with fine, or with both:",
      "Provided that nothing contained in this section shall apply unless—",
      "(b) the payee makes a demand by giving a notice, in writing, within thirty days of the receipt of information;",
      'Explanation.— For the purposes of this section, "debt or other liability" means a legally enforceable debt.',
    ]);
  });
});

describe("toStatuteRecord", () => {
  it("maps a section to a record whose id matches the seed and whose cite_as verifies", () => {
    const record = StatuteRecord.parse(toStatuteRecord("NIA", section()));
    expect(record).toMatchObject({
      source_id: "nia-s138",
      act_name: "Negotiable Instruments Act, 1881",
      section_number: "138",
      source_url: "https://indiacode.gov.in/handle/123456789/535880",
    });
    const [{ source }] = prepareRecords({ statutes: [record], cases: [] }) as [ReturnType<typeof prepareRecords>[number]];
    expect(claimMatchesSource(canonicalReference(source), source).matches).toBe(true);
  });

  it("skips omitted and repealed sections", () => {
    expect(toStatuteRecord("NIA", section({ html: "[Omitted.]" }))).toBeNull();
    expect(toStatuteRecord("NIA", section({ html: "Rep. by Act 5 of 1990" }))).toBeNull();
    expect(toStatuteRecord("NIA", section({ repealed: true }))).toBeNull();
  });

  it("makes ids from lettered section numbers", () => {
    expect(statuteSourceId("NIA", "143A")).toBe("nia-s143a");
    expect(statuteSourceId("BNS", "318")).toBe("bns-s318");
  });
});

describe("seed vs official text", () => {
  it("the dev seed never overwrites official India Code text", async () => {
    const store = new MemoryLegalStore();
    const embedder = new HashingEmbedder(1024);
    await ingestSeed({ store, embedder });
    const official = StatuteRecord.parse(toStatuteRecord("NIA", section()));
    expect(await ingestSources(prepareRecords({ statutes: [official], cases: [] }), { store, embedder })).toEqual({ upserted: 1, unchanged: 0 });

    await ingestSeed({ store, embedder }); // e.g. someone re-runs `npm run ingest`
    const [kept] = (await store.getSources(["nia-s138"])).values();
    expect(kept!.sourceUrl).toBe("https://indiacode.gov.in/handle/123456789/535880");
  });
});
