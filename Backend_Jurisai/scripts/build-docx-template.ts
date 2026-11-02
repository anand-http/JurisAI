/**
 * Generates templates/court-default.docx, the docxtemplater template used for exports.
 * Re-run after changing layout: npm run build:template
 *
 * Defaults approximate common Indian court filing format (A4, Times New Roman 14pt,
 * 1.5 line spacing, wider left margin for binding). Adjust per court's rules as needed.
 */
import { writeFile } from "node:fs/promises";
import { AlignmentType, Document, Footer, Packer, PageNumber, Paragraph, TextRun } from "docx";

const TWIPS_PER_INCH = 1440;
const tag = (text: string) => new Paragraph({ children: [new TextRun(text)] });

const doc = new Document({
  creator: process.env.APP_NAME ?? "JurisAI",
  styles: {
    default: {
      document: {
        run: { font: "Times New Roman", size: 28 }, // half-points: 14pt
        paragraph: { spacing: { line: 360, after: 240 } }, // 1.5 lines, 12pt after
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: {
            top: TWIPS_PER_INCH,
            bottom: TWIPS_PER_INCH,
            left: 1.5 * TWIPS_PER_INCH,
            right: TWIPS_PER_INCH,
          },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 22 })],
            }),
          ],
        }),
      },
      // Each loop/condition tag sits alone in its paragraph so paragraphLoop removes it on render.
      children: [
        tag("{#paragraphs}"),
        tag("{#heading}"),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "{text}", bold: true })] }),
        tag("{/heading}"),
        tag("{^heading}"),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun("{text}")] }),
        tag("{/heading}"),
        tag("{/paragraphs}"),
      ],
    },
  ],
});

const out = new URL("../templates/court-default.docx", import.meta.url);
await writeFile(out, await Packer.toBuffer(doc));
console.log(`wrote ${out.pathname}`);
