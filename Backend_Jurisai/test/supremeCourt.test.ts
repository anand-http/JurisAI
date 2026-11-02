import { describe, expect, it } from "vitest";
import { CaseRecord, prepareRecords } from "../src/ingestion/records.js";
import {
  caseName,
  chunkText,
  cleanJudgmentText,
  isoDate,
  issueForConsideration,
  matchTopics,
  sourceIdFor,
  titleCase,
  toCaseRecord,
  type ScMetadataRow,
} from "../src/ingestion/sources/supremeCourt.js";
import { canonicalReference, claimMatchesSource } from "../src/modules/legal/claimMatching.js";

// Shaped like a real 2024 metadata row.
const row: ScMetadataRow = {
  title: "M/S SUNRISE TRADERS versus RAKESH GUPTA & ANR.",
  petitioner: "M/S SUNRISE TRADERS",
  respondent: "RAKESH GUPTA & ANR.",
  citation: "[2024] 10 S.C.R. 108",
  case_id: "2024 INSC 735",
  decision_date: "25-09-2024",
  disposal_nature: "Disposed off",
  raw_html:
    "<strong>Coram : X</strong><br> Issue for Consideration Whether the complaint under s. 138 of the Negotiable Instruments Act &ndash; dishonour of cheque &ndash; was maintainable<br><strong> Decision Date :</strong> 25-09-2024",
  path: "2024_10_108_125",
  nc_display: "2024INSC735",
  year: 2024,
};

describe("metadata helpers", () => {
  it("title-cases party names without breaking abbreviations", () => {
    expect(titleCase("THE STATE OF BIHAR")).toBe("The State of Bihar");
    expect(titleCase("STATE OF U.P. & ORS.")).toBe("State of U.P. & Ors.");
    expect(titleCase("M/S SUNRISE TRADERS")).toBe("M/s Sunrise Traders");
    expect(caseName(row)).toBe("M/s Sunrise Traders v. Rakesh Gupta & Anr.");
    expect(caseName({ ...row, respondent: "STATE OF UTTAR PRADESH & ANR. R1: STATE OF UTTAR PRADES" })).toBe(
      "M/s Sunrise Traders v. State of Uttar Pradesh & Anr.",
    );
  });

  it("builds stable ids and ISO dates", () => {
    expect(sourceIdFor(row)).toBe("sc-2024insc735");
    expect(sourceIdFor({ nc_display: null, path: "1999_2_10_20" })).toBe("sc-1999-2-10-20");
    expect(isoDate("25-09-2024")).toBe("2024-09-25");
    expect(isoDate("")).toBeNull();
  });

  it("reads the official issue summary and matches topics before downloading anything", () => {
    expect(issueForConsideration(row)).toBe(
      "Whether the complaint under s. 138 of the Negotiable Instruments Act – dishonour of cheque – was maintainable",
    );
    expect(matchTopics(row, ["cheque", "bail", "tenancy"])).toEqual(["cheque"]);
  });
});

describe("cleanJudgmentText", () => {
  it("drops running headers that repeat across pages, keeps the body", () => {
    const pages = [
      "[2024] 10 S.C.R. 108 : 2024 INSC 735\nM/s Sunrise Traders\nv.\nRakesh Gupta\nIssue for Consideration\nWhether the complaint was maintainable.",
      "[2024] 10 S.C.R. 109Sunrise Traders v. Rakesh Gupta\n1. The appellant supplied goods on credit and re-\nceived a cheque from his brother-\nin-law.\n2. The cheque was returned unpaid.",
      "110 [2024] 10 S.C.R.Digital Supreme Court Reports\n3. A notice was sent within thirty days.",
      "[2024] 10 S.C.R. 111Sunrise Traders v. Rakesh Gupta\n4. The appeal is allowed.\nDigitally signed by JOHN DOE",
      "112 [2024] 10 S.C.R.Digital Supreme Court Reports\n5. No order as to costs.",
    ];
    const text = cleanJudgmentText(pages);
    expect(text).not.toMatch(/Digital Supreme Court Reports|S\.C\.R\. 109|Digitally signed/);
    expect(text).toContain("received a cheque"); // syllable break rejoined
    expect(text).toContain("brother-in-law"); // real compound keeps its hyphen
    expect(text).toContain("Issue for Consideration");
    expect(text).toContain("5. No order as to costs.");
  });
});

describe("chunkText", () => {
  const para = (n: number, words: number) => `${n}. ${"word ".repeat(words - 1).trim()}.`;

  it("packs lines into chunks near the target, breaking at paragraph ends", () => {
    const text = Array.from({ length: 12 }, (_, i) => para(i + 1, 100)).join("\n");
    const chunks = chunkText(text, 350, 550);
    expect(chunks.length).toBe(3);
    for (const c of chunks) expect(c.split(" ").length).toBeLessThanOrEqual(550);
    expect(chunks[1]).toMatch(/^5\. /); // starts at a numbered paragraph
  });

  it("never exceeds the hard cap even without good break points", () => {
    const text = Array.from({ length: 30 }, () => "word ".repeat(49).trim()).join("\n");
    for (const c of chunkText(text, 350, 550)) expect(c.split(" ").length).toBeLessThanOrEqual(550);
  });
});

describe("toCaseRecord", () => {
  it("produces a valid library record whose cite_as verifies", () => {
    const record = CaseRecord.parse(toCaseRecord(row, ["Issue for Consideration ...", "1. The appellant ..."]));
    expect(record).toMatchObject({
      source_id: "sc-2024insc735",
      case_name: "M/s Sunrise Traders v. Rakesh Gupta & Anr.",
      date: "2024-09-25",
      citation_text: "2024 INSC 735; [2024] 10 S.C.R. 108",
      source_url: "https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year=2024/english/2024_10_108_125_EN.pdf",
    });

    const [{ source, chunks }] = prepareRecords({ statutes: [], cases: [record] }) as [ReturnType<typeof prepareRecords>[number]];
    expect(chunks).toHaveLength(2);
    expect(claimMatchesSource(canonicalReference(source), source).matches).toBe(true);
    expect(claimMatchesSource("M/s Sunrise Traders v. Rakesh Gupta, 2024 INSC 735", source).matches).toBe(true);
    expect(claimMatchesSource("M/s Sunrise Traders v. Rakesh Gupta, 2024 INSC 999", source).matches).toBe(false);
  });

  it("skips judgments without a date or citation", () => {
    expect(toCaseRecord({ ...row, decision_date: null }, ["x"])).toBeNull();
    expect(toCaseRecord({ ...row, citation: null, case_id: null }, ["x"])).toBeNull();
  });
});
