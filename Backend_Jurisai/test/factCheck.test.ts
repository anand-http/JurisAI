import { describe, expect, it } from "vitest";
import { allowedFacts, checkFacts, findDates, findPlaceholders } from "../src/modules/drafts/review/factCheck.js";
import type { LegalSource } from "../src/modules/legal/types.js";

const NOW = new Date("2026-09-28T10:00:00Z");

// Shapes exactly as the mobile app sends them: ISO dates, bare-digit amounts.
const notice = {
  noticeType: "cheque_dishonour",
  noticeDate: "2026-03-10",
  senderName: "M/s Sunrise Traders through Shri Anil Mehta",
  recipientName: "Rakesh Gupta",
  chequeNumber: "000123",
  chequeDate: "2026-01-15",
  dishonourDate: "2026-02-20",
  amount: "450000",
  facts: "Goods supplied on 3rd December 2025 worth Rs 4.5 lakh. Invoice 7781.",
  relief: "Pay with 18% interest",
  compliancePeriodDays: "15",
};

const crpc438: LegalSource = {
  sourceId: "crpc-s438",
  sourceType: "statute",
  actCode: "CRPC",
  actName: "Code of Criminal Procedure, 1973",
  sectionNumber: "438",
  sectionTitle: "",
  text: "…",
  sourceUrl: "",
  contentHash: "",
};

const issuesFor = (draft: string, fields: Record<string, string> = notice, sources: LegalSource[] = []) =>
  checkFacts(draft, allowedFacts(fields, sources, NOW));

describe("findDates", () => {
  it.each([
    ["on 15.01.2026", "2026-01-15"],
    ["on 15/1/2026", "2026-01-15"],
    ["on 15th January, 2026", "2026-01-15"],
    ["on the 15th day of January, 2026", "2026-01-15"],
    ["on January 15, 2026", "2026-01-15"],
    ["on 15 Jan 2026", "2026-01-15"],
    ["dated 2026-01-15", "2026-01-15"],
  ])("reads %s", (text, iso) => {
    expect(findDates(text).map((d) => d.normalized)).toEqual([iso]);
  });

  it("rejects impossible dates", () => {
    expect(findDates("on 31.02.2026")).toEqual([]);
  });
});

describe("checkFacts", () => {
  it("accepts facts that come from the form, in any common format", () => {
    const draft = [
      "LEGAL NOTICE",
      "1. That your cheque No. 000123 dated 15.01.2026 for Rs. 4,50,000/- (Rupees Four Lakh Fifty Thousand only) was returned on 20th February, 2026.",
      "2. That goods worth ₹4,50,000 were supplied on December 3, 2025 against Invoice 7781.",
      "3. You are called upon to pay within 15 days with interest at 18% per annum.",
      "Issued on behalf of Shri Anil Mehta. Dated: 10.03.2026",
    ].join("\n\n");
    expect(issuesFor(draft)).toEqual([]);
  });

  it("flags a date, amount, number and name the lawyer never supplied", () => {
    const draft =
      "Your cheque dated 16.01.2026 for Rs. 5,00,000/- (Cheque No. 000124) was presented by Shri Vikram Singh.";
    expect(issuesFor(draft).map((i) => [i.kind, i.value])).toEqual([
      ["date", "16.01.2026"],
      ["amount", "Rs. 5,00,000/-"],
      ["number", "000124"],
      ["name", "Vikram Singh"],
    ]);
  });

  it("gives the surrounding text so the lawyer can find it", () => {
    const [issue] = issuesFor("The notice was served on 21.03.2026 by registered post.");
    expect(issue).toMatchObject({ kind: "date", context: "The notice was served on 21.03.2026 by registered post." });
  });

  it("ignores legal references, act years, law reports, placeholders and paragraph numbers", () => {
    const draft = [
      "12. That Section 138 of the Negotiable Instruments Act, 1881 and Sections 318(4), 316(2) BNS apply.",
      "13. Reliance is placed on Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273 and AIR 1992 SC 604.",
      "14. Case No. [____] of 2026, FIR No. [FIR No. 245/2027]",
    ].join("\n\n");
    expect(issuesFor(draft)).toEqual([]);
  });

  it("ignores act years in capitalised headings", () => {
    expect(issuesFor("APPLICATION UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT, 1881", {}, [])).toEqual([]);
  });

  it("allows numbers and dates that come from the retrieved law", () => {
    expect(issuesFor("As held under the Code of 1973, Section 438 ...", {}, [crpc438])).toEqual([]);
    expect(issuesFor("The Code of 1973 ...", {}, [])).toEqual([expect.objectContaining({ kind: "number", value: "1973" })]);
  });

  it("does not treat titles after an honorific as names", () => {
    expect(issuesFor("Before Hon'ble Mr. Justice presiding, Shri Anil Mehta appeared.")).toEqual([]);
  });

  it("ignores single-digit numbers", () => {
    expect(issuesFor("The applicant has 2 children and 3 witnesses.")).toEqual([]);
  });
});

describe("findPlaceholders", () => {
  it("finds blanks but not [sic] or footnote markers", () => {
    expect(
      findPlaceholders("FIR No. [____] at [Police Station]. He said [sic] so [1]. [AUTHORITY REQUIRED: s.41A CrPC] [____]"),
    ).toEqual(["[____]", "[Police Station]", "[AUTHORITY REQUIRED: s.41A CrPC]"]);
  });
});
