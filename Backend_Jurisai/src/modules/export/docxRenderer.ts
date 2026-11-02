import { readFile } from "node:fs/promises";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

export const DEFAULT_TEMPLATE_PATH = new URL("../../../templates/court-default.docx", import.meta.url);

export interface DocxParagraph {
  text: string;
  heading: boolean;
}

// Lines that are headings in Indian pleadings even when not fully capitalised.
const HEADING_START = /^(in the (court|high court|supreme court)|before the|versus|vs\.?$|prayer|grounds|verification|affidavit|index|synopsis|list of dates)/i;

function isHeading(block: string): boolean {
  if (block.includes("\n") || block.length > 150) return false;
  const letters = block.replace(/[^A-Za-z]/g, "");
  const allCaps = letters.length >= 3 && letters === letters.toUpperCase();
  return allCaps || HEADING_START.test(block.trim());
}

/**
 * Splits plain draft text into paragraphs: blank lines separate paragraphs, single newlines
 * become line breaks inside one, and short capitalised lines become centred bold headings.
 */
export function toParagraphs(draftText: string): DocxParagraph[] {
  return draftText
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/[ \t]+$/gm, "").trim())
    .filter((block) => block.length > 0)
    .map((text) => ({ text, heading: isHeading(text) }));
}

/**
 * Renders the draft into the court-format template (A4, Times New Roman 14pt, 1.5 spacing,
 * wider binding margin, page numbers). Firms can supply their own .docx template with the
 * same tags: {#paragraphs} / {#heading}{text}{/heading} / {^heading}{text}{/heading} / {/paragraphs}.
 */
export async function renderDraftDocx(draftText: string, templatePath: string | URL = DEFAULT_TEMPLATE_PATH): Promise<Buffer> {
  const zip = new PizZip(await readFile(templatePath));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render({ paragraphs: toParagraphs(draftText) });
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
