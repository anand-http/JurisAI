import { describe, expect, it } from "vitest";
import { detectActs } from "../src/modules/legal/acts.js";
import { canonicalReference, claimMatchesSource, parseSectionNumber } from "../src/modules/legal/claimMatching.js";
import type { CaseSource, StatuteSource } from "../src/modules/legal/types.js";

const statute = (over: Partial<StatuteSource>): StatuteSource => ({
  sourceId: "x",
  sourceType: "statute",
  actCode: "CRPC",
  actName: "Code of Criminal Procedure, 1973",
  sectionNumber: "438",
  sectionTitle: "",
  text: "",
  sourceUrl: "https://example.test",
  contentHash: "",
  ...over,
});

const arnesh: CaseSource = {
  sourceId: "case-sc-2014-arnesh-kumar",
  sourceType: "case",
  caseName: "Arnesh Kumar v. State of Bihar",
  court: "Supreme Court of India",
  decisionDate: "2014-07-02",
  citationText: "(2014) 8 SCC 273",
  text: "",
  sourceUrl: "https://example.test",
  contentHash: "",
};

const bhajanLal: CaseSource = { ...arnesh, caseName: "State of Haryana v. Bhajan Lal", citationText: "1992 Supp (1) SCC 335", decisionDate: "1990-11-21" };

describe("detectActs", () => {
  it("distinguishes BNS from BNSS and handles dotted abbreviations", () => {
    expect(detectActs("Section 482 BNSS")).toEqual(["BNSS"]);
    expect(detectActs("Section 85 BNS")).toEqual(["BNS"]);
    expect(detectActs("u/s 438 Cr.P.C.")).toEqual(["CRPC"]);
    expect(detectActs("Section 420 I.P.C.")).toEqual(["IPC"]);
    expect(detectActs("Section 101 of the Indian Evidence Act, 1872")).toEqual(["IEA"]);
    expect(detectActs("u/s 138 of the N.I. Act")).toEqual(["NIA"]);
    expect(detectActs("Section 106 of the T.P. Act")).toEqual(["TPA"]);
    expect(detectActs("Section 73 of the Contract Act")).toEqual(["ICA"]);
  });

  it("keeps civil and criminal procedure apart", () => {
    expect(detectActs("Order XIX Rule 3 C.P.C.")).toEqual(["CPC"]);
    expect(detectActs("Section 139 of the Code of Civil Procedure, 1908")).toEqual(["CPC"]);
    expect(detectActs("Section 154 Cr.P.C.")).toEqual(["CRPC"]);
  });
});

describe("parseSectionNumber", () => {
  it("normalises hyphens, spaces and sub-sections", () => {
    expect(parseSectionNumber("498-A")).toEqual({ base: "498a", subsections: "" });
    expect(parseSectionNumber("318 (4)")).toEqual({ base: "318", subsections: "(4)" });
  });
});

describe("claimMatchesSource — statutes", () => {
  const crpc438 = statute({});
  const ipc498a = statute({ actCode: "IPC", actName: "Indian Penal Code, 1860", sectionNumber: "498A" });
  const bns318_4 = statute({ actCode: "BNS", actName: "Bharatiya Nyaya Sanhita, 2023", sectionNumber: "318(4)" });

  it.each([
    "Section 438, Code of Criminal Procedure, 1973",
    "Section 438 of the Code of Criminal Procedure",
    "S. 438 CrPC",
    "u/s 438 Cr.P.C.",
    "Section 438(1), Code of Criminal Procedure, 1973",
  ])("accepts %s", (claim) => {
    expect(claimMatchesSource(claim, crpc438)).toEqual({ matches: true });
  });

  it("accepts 498-A spelled with a hyphen", () => {
    expect(claimMatchesSource("Section 498-A IPC", ipc498a).matches).toBe(true);
  });

  it("rejects the same section number in a different act (482 CrPC is not 482 BNSS)", () => {
    const bnss482 = statute({ actCode: "BNSS", actName: "Bharatiya Nagarik Suraksha Sanhita, 2023", sectionNumber: "482" });
    expect(claimMatchesSource("Section 482, Code of Criminal Procedure, 1973", bnss482).matches).toBe(false);
  });

  it("rejects a different section of the right act", () => {
    expect(claimMatchesSource("Section 437, Code of Criminal Procedure, 1973", crpc438).matches).toBe(false);
  });

  it("rejects a conflicting sub-section but accepts a claim without one", () => {
    expect(claimMatchesSource("Section 318(2), Bharatiya Nyaya Sanhita, 2023", bns318_4).matches).toBe(false);
    expect(claimMatchesSource("Section 318(4), Bharatiya Nyaya Sanhita, 2023", bns318_4).matches).toBe(true);
    expect(claimMatchesSource("Section 318, Bharatiya Nyaya Sanhita, 2023", bns318_4).matches).toBe(true);
  });

  it("does not read a parenthetical word as a sub-section", () => {
    expect(claimMatchesSource("Section 438 (anticipatory bail), CrPC", crpc438).matches).toBe(true);
  });

  it("rejects claims with no act, two acts, or a wrong act year", () => {
    expect(claimMatchesSource("Section 438", crpc438).matches).toBe(false);
    expect(claimMatchesSource("Section 438 CrPC / Section 482 BNSS", crpc438).matches).toBe(false);
    expect(claimMatchesSource("Section 438, Code of Criminal Procedure, 1898", crpc438).matches).toBe(false);
  });
});

describe("claimMatchesSource — cases", () => {
  it.each([
    "Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273",
    "Arnesh Kumar vs State of Bihar & Anr.",
    "Arnesh Kumar versus State of Bihar",
    "(2014) 8 SCC 273",
  ])("accepts %s", (claim) => {
    expect(claimMatchesSource(claim, arnesh)).toEqual({ matches: true });
  });

  it("rejects the right name with a fabricated reporter citation", () => {
    const result = claimMatchesSource("Arnesh Kumar v. State of Bihar, (2014) 8 SCC 237", arnesh);
    expect(result).toMatchObject({ matches: false });
  });

  it("rejects a different case and a statute-style claim", () => {
    expect(claimMatchesSource("Lalita Kumari v. Government of Uttar Pradesh", arnesh).matches).toBe(false);
    expect(claimMatchesSource("Section 438, Code of Criminal Procedure, 1973", arnesh).matches).toBe(false);
  });

  it("accepts a case cited without '& Anr.' or by only one of its citations", () => {
    const multi: CaseSource = {
      ...arnesh,
      caseName: "Vijay Singh v. The State of Bihar & Ors.",
      citationText: "2024 INSC 735; [2024] 10 S.C.R. 108",
      decisionDate: "2024-09-25",
    };
    expect(claimMatchesSource("Vijay Singh v. The State of Bihar, 2024 INSC 735", multi).matches).toBe(true);
    expect(claimMatchesSource("[2024] 10 S.C.R. 108", multi).matches).toBe(true);
    expect(claimMatchesSource("Vijay Singh v. The State of Bihar, 2024 INSC 753", multi).matches).toBe(false);
  });

  it("handles Supp-volume citations and decision dates", () => {
    expect(claimMatchesSource("State of Haryana v. Bhajan Lal, 1992 Supp (1) SCC 335", bhajanLal).matches).toBe(true);
    expect(claimMatchesSource("State of Haryana v. Bhajan Lal (decided 21 November 1990)", bhajanLal).matches).toBe(true);
  });
});

describe("claimMatchesSource — CPC orders and rules", () => {
  const o19r3 = statute({ actCode: "CPC", actName: "Code of Civil Procedure, 1908", sectionNumber: "Order XIX Rule 3" });
  const cpc139 = statute({ actCode: "CPC", actName: "Code of Civil Procedure, 1908", sectionNumber: "139" });

  it.each([
    "Order XIX Rule 3, Code of Civil Procedure, 1908",
    "O. XIX R. 3 CPC",
    "Order 19 Rule 3 of the C.P.C.",
    "Order XIX Rule 3(1), Code of Civil Procedure",
  ])("accepts %s", (claim) => {
    expect(claimMatchesSource(claim, o19r3)).toEqual({ matches: true });
  });

  it("rejects a different rule, a different order, or a section-style claim", () => {
    expect(claimMatchesSource("Order XIX Rule 2, Code of Civil Procedure, 1908", o19r3).matches).toBe(false);
    expect(claimMatchesSource("Order XVIII Rule 3, Code of Civil Procedure, 1908", o19r3).matches).toBe(false);
    expect(claimMatchesSource("Section 3, Code of Civil Procedure, 1908", o19r3).matches).toBe(false);
  });

  it("does not confuse Section 139 CPC with Section 139 CrPC or NI Act", () => {
    expect(claimMatchesSource("Section 139, Code of Civil Procedure, 1908", cpc139).matches).toBe(true);
    expect(claimMatchesSource("Section 139, Code of Criminal Procedure, 1973", cpc139).matches).toBe(false);
    expect(claimMatchesSource("Section 139, Negotiable Instruments Act, 1881", cpc139).matches).toBe(false);
  });

  it("gives order/rule provisions a cite_as without a 'Section' prefix", () => {
    expect(canonicalReference(o19r3)).toBe("Order XIX Rule 3, Code of Civil Procedure, 1908");
    expect(canonicalReference(cpc139)).toBe("Section 139, Code of Civil Procedure, 1908");
    expect(claimMatchesSource(canonicalReference(o19r3), o19r3).matches).toBe(true);
  });
});
