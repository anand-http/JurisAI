import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { renderDraftDocx, toParagraphs } from "../src/modules/export/docxRenderer.js";

const DRAFT = [
  "IN THE COURT OF THE SESSIONS JUDGE, [CITY]",
  "Criminal Misc. Application No. [____] of 2026",
  "Ramesh & Sons <Pvt> Ltd\n...Applicant",
  "VERSUS",
  "1. That the applicant is a law-abiding citizen.\nSecond line of the same paragraph.",
  "PRAYER",
  "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to grant anticipatory bail.",
].join("\n\n");

/** Paragraphs of word/document.xml as {align, bold, text}. */
function readParagraphs(buf: Buffer) {
  const xml = new PizZip(buf).file("word/document.xml")!.asText();
  return {
    xml,
    paragraphs: (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => ({
      align: /w:jc w:val="(\w+)"/.exec(p)?.[1] ?? null,
      bold: /<w:b\/>|<w:b /.test(p),
      text: p.replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, ""),
    })),
  };
}

describe("toParagraphs", () => {
  it("splits on blank lines and detects headings", () => {
    const paras = toParagraphs(DRAFT);
    expect(paras).toHaveLength(7);
    expect(paras.filter((p) => p.heading).map((p) => p.text)).toEqual([
      "IN THE COURT OF THE SESSIONS JUDGE, [CITY]",
      "VERSUS",
      "PRAYER",
    ]);
    expect(paras[4]!.heading).toBe(false);
  });
});

describe("renderDraftDocx", () => {
  it("renders headings centred+bold and body justified, with no leftover template tags", async () => {
    const { xml, paragraphs } = readParagraphs(await renderDraftDocx(DRAFT));

    expect(xml).not.toMatch(/\{[#^/]?(paragraphs|heading|text)\}/);
    expect(paragraphs).toHaveLength(7); // loop/condition-only paragraphs are removed

    expect(paragraphs[0]).toMatchObject({ align: "center", bold: true, text: "IN THE COURT OF THE SESSIONS JUDGE, [CITY]" });
    expect(paragraphs[3]).toMatchObject({ align: "center", bold: true, text: "VERSUS" });
    expect(paragraphs[4]).toMatchObject({
      align: "both",
      bold: false,
      text: "1. That the applicant is a law-abiding citizen.\nSecond line of the same paragraph.",
    });
  });

  it("escapes XML special characters from draft text", async () => {
    const { xml, paragraphs } = readParagraphs(await renderDraftDocx(DRAFT));
    expect(xml).toContain("Ramesh &amp; Sons &lt;Pvt&gt; Ltd");
    expect(paragraphs[2]!.text).toContain("Ramesh &amp; Sons");
  });
});
