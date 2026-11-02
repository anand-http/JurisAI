/* eslint-disable no-bitwise */
import { isHeading, splitParagraphs } from '../../lib/citations';
import { utf8Encode } from '../../lib/utf8';
import type { PaperSize } from '../types';

/**
 * Minimal PDF and DOCX writers so the mock backend can hand back real files
 * for the export → share → offline flow. Production formatting (fonts,
 * margins, court-specific layouts) belongs to the backend exporter.
 */

// ---- PDF --------------------------------------------------------------------

const PAGE_POINTS: Record<PaperSize, [number, number]> = {
  A4: [595, 842],
  LEGAL: [612, 1008],
};

/** PDF standard fonts only cover Latin-1; map common typography to ASCII. */
function toPdfSafe(text: string): string {
  return text
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\n]/g, '?');
}

const escapePdf = (s: string) => s.replace(/([\\()])/g, '\\$1');

/** Rough Times-Roman advance widths (per 1pt of font size). */
function textWidth(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) {
    if (ch === ' ') {
      units += 0.25;
    } else if (/[A-Z]/.test(ch)) {
      units += 0.68;
    } else if (/[mwMW]/.test(ch)) {
      units += 0.78;
    } else if (/[il.,;:'!|]/.test(ch)) {
      units += 0.28;
    } else {
      units += 0.5;
    }
  }
  return units * size * (bold ? 1.05 : 1);
}

function wrap(
  line: string,
  maxWidth: number,
  size: number,
  bold: boolean,
): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth || !current) {
      current = candidate;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current || out.length === 0) {
    out.push(current);
  }
  return out;
}

export function buildPdf(text: string, paperSize: PaperSize): Uint8Array {
  const [width, height] = PAGE_POINTS[paperSize];
  const margin = { left: 72, right: 72, top: 72, bottom: 72 };
  const size = 12;
  const leading = 18; // 1.5 line spacing
  const usable = width - margin.left - margin.right;

  interface Line {
    text: string;
    bold: boolean;
    center: boolean;
  }
  const lines: Line[] = [];
  for (const paragraph of splitParagraphs(toPdfSafe(text))) {
    const heading = isHeading(paragraph);
    for (const raw of paragraph.split('\n')) {
      for (const l of wrap(raw, usable, size, heading)) {
        lines.push({ text: l, bold: heading, center: heading });
      }
    }
    lines.push({ text: '', bold: false, center: false });
  }

  const perPage = Math.floor((height - margin.top - margin.bottom) / leading);
  const pages: Line[][] = [];
  for (let i = 0; i < lines.length; i += perPage) {
    pages.push(lines.slice(i, i + perPage));
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  // 1 catalog, 2 pages, 3 regular font, 4 bold font, then page/content pairs.
  pages.forEach((pageLines, index) => {
    const ops = ['BT'];
    pageLines.forEach((line, n) => {
      if (!line.text) {
        return;
      }
      const w = textWidth(line.text, size, line.bold);
      const x = line.center
        ? Math.max(margin.left, (width - w) / 2)
        : margin.left;
      const y = height - margin.top - size - n * leading;
      ops.push(
        `/${line.bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(
          2,
        )} ${y.toFixed(2)} Tm (${escapePdf(line.text)}) Tj`,
      );
    });
    const footer = `Page ${index + 1} of ${pages.length}`;
    ops.push(
      `/F1 9 Tf 1 0 0 1 ${((width - textWidth(footer, 9, false)) / 2).toFixed(
        2,
      )} 36 Tm (${footer}) Tj`,
      'ET',
    );
    const stream = ops.join('\n');
    const pageId = 5 + index * 2;
    pageObjectIds.push(pageId);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${
        pageId + 1
      } 0 R >>`;
    objects[
      pageId + 1
    ] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds
    .map(id => `${id} 0 R`)
    .join(' ')}] /Count ${pages.length} >>`;
  objects[3] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>';
  objects[4] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>';

  // Everything is ASCII, so string length equals byte length for offsets.
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) {
    bytes[i] = out.charCodeAt(i);
  }
  return bytes;
}

// ---- DOCX -------------------------------------------------------------------

const TWIPS: Record<PaperSize, [number, number]> = {
  A4: [11906, 16838],
  LEGAL: [12240, 20160],
};

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function buildDocx(text: string, paperSize: PaperSize): Uint8Array {
  const [w, h] = TWIPS[paperSize];
  const runProps =
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/>';

  const body = splitParagraphs(text)
    .map(paragraph => {
      const heading = isHeading(paragraph);
      const runs = paragraph
        .split('\n')
        .map(
          (line, i) =>
            `<w:r><w:rPr>${runProps}${heading ? '<w:b/>' : ''}</w:rPr>${
              i > 0 ? '<w:br/>' : ''
            }<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`,
        )
        .join('');
      return `<w:p><w:pPr><w:spacing w:after="240" w:line="360" w:lineRule="auto"/>${
        heading ? '<w:jc w:val="center"/>' : '<w:jc w:val="both"/>'
      }</w:pPr>${runs}</w:p>`;
    })
    .join('');

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body +
    `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="2268" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>` +
    '</w:body></w:document>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  return zipStored([
    { name: '[Content_Types].xml', data: utf8Encode(contentTypes) },
    { name: '_rels/.rels', data: utf8Encode(rels) },
    { name: 'word/document.xml', data: utf8Encode(documentXml) },
  ]);
}

// ---- ZIP (stored, no compression) -------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(
  entries: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const entry of entries) {
    const name = utf8Encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, entry.data);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, DOS_TIME, true);
    header.setUint16(14, DOS_DATE, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, size, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint16(30, 0, true);
    header.setUint16(32, 0, true);
    header.setUint16(34, 0, true);
    header.setUint16(36, 0, true);
    header.setUint32(38, 0, true);
    header.setUint32(42, offset, true);
    central.push(new Uint8Array(header.buffer), name);

    offset += 30 + name.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of all) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
