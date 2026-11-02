import type { Citation } from '../src/api/types';
import {
  citationsMissingFromText,
  findUnlinkedReferences,
  isHeading,
  joinParagraphs,
  segmentParagraph,
  splitParagraphs,
  summarizeCitations,
} from '../src/lib/citations';

const s138: Citation = {
  source_id: 'nia-1881-s138',
  text: 'Section 138 of the Negotiable Instruments Act, 1881',
  verified: true,
};
const weak: Citation = {
  source_id: 'x',
  text: 'Example v. Sample, (2099) 1 SCC 1',
  verified: false,
};

const refs = (text: string) =>
  findUnlinkedReferences(text).map(r => text.slice(r.start, r.end));

describe('segmentParagraph', () => {
  it('turns backend citations into citation segments and keeps the rest as text', () => {
    const p = `The dishonour is an offence under ${s138.text}. See ${weak.text}.`;
    const segments = segmentParagraph(p, [s138, weak]);
    expect(segments.map(s => s.kind)).toEqual([
      'text',
      'citation',
      'text',
      'citation',
      'text',
    ]);
    expect(segments[1]).toMatchObject({ text: s138.text, citationIndex: 0 });
    expect(segments[3]).toMatchObject({ citationIndex: 1 });
    expect(segments.map(s => s.text).join('')).toBe(p);
  });

  it('matches case- and whitespace-insensitively (headings are in capitals)', () => {
    const p =
      'APPLICATION UNDER SECTION 138 OF THE NEGOTIABLE\nINSTRUMENTS ACT, 1881';
    const segments = segmentParagraph(p, [s138]);
    expect(segments[1]).toMatchObject({ kind: 'citation', citationIndex: 0 });
    expect(segments.map(s => s.text).join('')).toBe(p);
  });

  it('flags references that have no citation entry', () => {
    const p =
      'Maintainable under Section 437 of the Code of Criminal Procedure, 1973 as well.';
    const segments = segmentParagraph(p, []);
    expect(segments.find(s => s.kind === 'unlinked')?.text).toBe(
      'Section 437 of the Code of Criminal Procedure, 1973',
    );
  });

  it('never flags text already covered by a citation', () => {
    const segments = segmentParagraph(`Under ${s138.text}.`, [s138]);
    expect(segments.some(s => s.kind === 'unlinked')).toBe(false);
  });

  it('uses the backend unlinkedMentions even when the pattern would not match', () => {
    const p =
      'As held in the Kesavananda Bharati case, the basic structure applies.';
    const segments = segmentParagraph(p, [], ['Kesavananda Bharati case']);
    expect(segments.find(s => s.kind === 'unlinked')?.text).toBe(
      'Kesavananda Bharati case',
    );
  });
});

describe('findUnlinkedReferences', () => {
  it.each([
    [
      'He is charged under Sections 318(4) and 316(2) BNS today',
      'Sections 318(4) and 316(2) BNS',
    ],
    ['Relief u/s 482 CrPC is sought', 'u/s 482 CrPC'],
    [
      'Article 21 of the Constitution of India protects liberty',
      'Article 21 of the Constitution of India',
    ],
    [
      'Apply Order XXXIX Rules 1 and 2 CPC here',
      'Order XXXIX Rules 1 and 2 CPC',
    ],
    ['See (2014) 8 SCC 273 for guidance', '(2014) 8 SCC 273'],
    ['Reported as AIR 1978 SC 597.', 'AIR 1978 SC 597'],
    ['Also 2023 SCC OnLine SC 1234.', '2023 SCC OnLine SC 1234'],
  ])('detects %j', (text, expected) => {
    expect(refs(text)).toEqual([expected]);
  });

  it.each([
    'Pay Rs. 4,50,000 within 15 days.',
    'ORDER IN THE MATTER OF THE APPLICANT',
    'Mrs. Sharma filed 3 applications.',
    'Order dated 12 March 2026.',
  ])('ignores ordinary text %j', text => {
    expect(refs(text)).toEqual([]);
  });
});

describe('paragraph helpers', () => {
  it('splits on blank lines and keeps single line breaks', () => {
    const text = 'To,\nMr. X\nDelhi\n\n\nSir,\r\n\r\nBody';
    expect(splitParagraphs(text)).toEqual([
      'To,\nMr. X\nDelhi',
      'Sir,',
      'Body',
    ]);
    expect(joinParagraphs(['a', '  ', 'b '])).toBe('a\n\nb');
  });

  it('treats short all-caps paragraphs as headings', () => {
    expect(isHeading('IN THE COURT OF THE SESSIONS JUDGE, SAKET')).toBe(true);
    expect(isHeading('PRAYER')).toBe(true);
    expect(isHeading('1. That the applicant is innocent.')).toBe(false);
  });

  it('reports citations edited out of the text and summarises counts', () => {
    const text = `Under ${s138.text}. Also Section 420 IPC.`;
    expect(citationsMissingFromText(text, [s138, weak])).toEqual([1]);
    expect(summarizeCitations(text, [s138, weak])).toEqual({
      verified: 1,
      unverified: 1,
      unlinked: 1,
      unlinkedTexts: ['Section 420 IPC'],
    });
  });
});
