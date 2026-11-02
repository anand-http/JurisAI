/// <reference types="node" />
import { buildDocx, buildPdf } from '../src/api/mock/devFiles';

const TEXT = [
  'IN THE COURT OF THE SESSIONS JUDGE',
  'BAIL APPLICATION',
  ...Array.from(
    { length: 60 },
    (_, i) =>
      `${
        i + 1
      }. That the applicant — aged ₹ “34” — is innocent and has roots in society.`,
  ),
].join('\n\n');

describe('mock export files', () => {
  it('writes a PDF whose xref offsets point at every object', () => {
    const bytes = buildPdf(TEXT, 'A4');
    const pdf = Buffer.from(bytes).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

    const startxref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const entries = pdf
      .slice(startxref)
      .split('\n')
      .filter(l => / 00000 n $/.test(l));
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(
        `${i + 1} 0 obj`,
      );
    });
    // Long drafts paginate, and non-Latin characters are made safe.
    expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBeGreaterThan(1);
    expect(pdf).toContain('Rs.');
  });

  it('writes a DOCX zip with valid structure', () => {
    const zip = Buffer.from(buildDocx(TEXT, 'LEGAL'));
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = zip.readUInt16LE(eocd + 10);
    const cdOffset = zip.readUInt32LE(eocd + 16);
    expect(count).toBe(3);

    const names: string[] = [];
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      expect(zip.readUInt32LE(p)).toBe(0x02014b50);
      const nameLen = zip.readUInt16LE(p + 28);
      const localOffset = zip.readUInt32LE(p + 42);
      names.push(zip.subarray(p + 46, p + 46 + nameLen).toString());
      expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
      p += 46 + nameLen;
    }
    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ]);
    expect(zip.toString('utf8')).toContain('w:w="12240" w:h="20160"');
  });
});
