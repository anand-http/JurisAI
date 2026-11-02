export interface MockSource {
  source_id: string;
  kind: 'statute' | 'case';
  title: string;
  reference: string;
  text: string;
  court?: string;
  date?: string;
  url?: string;
}

/**
 * DEVELOPMENT DATA ONLY. These are short paraphrases standing in for the
 * official text the real backend retrieves; do not rely on them as law.
 */
const MOCK_NOTE =
  '[Mock source — paraphrased placeholder for development. The real backend returns the official text.]\n\n';

const sources: MockSource[] = [
  {
    source_id: 'nia-1881-s138',
    kind: 'statute',
    title: 'The Negotiable Instruments Act, 1881',
    reference: 'Section 138',
    text:
      MOCK_NOTE +
      'Dishonour of cheque for insufficiency, etc., of funds in the account. Where a cheque drawn by a person for the discharge of a debt or other liability is returned unpaid by the bank for insufficiency of funds, or because it exceeds the arranged amount, the drawer is deemed to have committed an offence, punishable with imprisonment up to two years, or fine up to twice the cheque amount, or both.\n\nThe section applies only if (a) the cheque was presented within its validity period; (b) the payee makes a written demand for payment within thirty days of receiving information of the return; and (c) the drawer fails to pay within fifteen days of receiving that notice.',
    url: 'https://www.indiacode.nic.in/',
  },
  {
    source_id: 'nia-1881-s142',
    kind: 'statute',
    title: 'The Negotiable Instruments Act, 1881',
    reference: 'Section 142',
    text:
      MOCK_NOTE +
      'Cognizance of offences. A court takes cognizance of an offence under Section 138 only on a written complaint by the payee or holder in due course, made within one month of the cause of action arising under clause (c) of the proviso to Section 138. No court inferior to a Metropolitan Magistrate or Judicial Magistrate of the first class shall try the offence. The complaint is to be inquired into and tried by a court within whose local jurisdiction the relevant bank branch is situated, as specified in the section.',
    url: 'https://www.indiacode.nic.in/',
  },
  {
    source_id: 'cpc-1908-o37',
    kind: 'statute',
    title: 'The Code of Civil Procedure, 1908',
    reference: 'Order XXXVII',
    text:
      MOCK_NOTE +
      'Summary procedure. Applies to suits upon bills of exchange, hundies and promissory notes, and to suits in which the plaintiff seeks only to recover a debt or liquidated demand in money, with or without interest, arising on a written contract, an enactment, or a guarantee. The defendant may defend only with leave of the court.',
    url: 'https://www.indiacode.nic.in/',
  },
  {
    source_id: 'bnss-2023-s480',
    kind: 'statute',
    title: 'The Bharatiya Nagarik Suraksha Sanhita, 2023',
    reference: 'Section 480',
    text:
      MOCK_NOTE +
      'When bail may be taken in case of non-bailable offence. Provides when a person accused of, or suspected of, a non-bailable offence may be released on bail by a court other than the High Court or Court of Session, and the conditions and restrictions that apply. Corresponds to Section 437 of the Code of Criminal Procedure, 1973.',
    url: 'https://www.indiacode.nic.in/',
  },
  {
    source_id: 'bnss-2023-s482',
    kind: 'statute',
    title: 'The Bharatiya Nagarik Suraksha Sanhita, 2023',
    reference: 'Section 482',
    text:
      MOCK_NOTE +
      'Direction for grant of bail to person apprehending arrest. A person who has reason to believe they may be arrested on an accusation of a non-bailable offence may apply to the High Court or the Court of Session for a direction that, in the event of arrest, they be released on bail. Corresponds to Section 438 of the Code of Criminal Procedure, 1973.',
    url: 'https://www.indiacode.nic.in/',
  },
  {
    source_id: 'bnss-2023-s187',
    kind: 'statute',
    title: 'The Bharatiya Nagarik Suraksha Sanhita, 2023',
    reference: 'Section 187',
    text:
      MOCK_NOTE +
      'Procedure when investigation cannot be completed in twenty-four hours. Governs remand of an arrested person and provides for release on bail where investigation is not completed within the period prescribed, if the accused is prepared to and does furnish bail. Corresponds to Section 167 of the Code of Criminal Procedure, 1973.',
    url: 'https://www.indiacode.nic.in/',
  },
  {
    source_id: 'sc-2022-10-scc-51',
    kind: 'case',
    title: 'Satender Kumar Antil v. Central Bureau of Investigation',
    reference: '(2022) 10 SCC 51',
    court: 'Supreme Court of India',
    date: '2022',
    text:
      MOCK_NOTE +
      'The Supreme Court classified offences into categories for the purpose of bail, reiterated that bail is the rule and jail the exception, and issued directions to courts on the disposal of bail applications, including timelines and the treatment of accused who co-operated with the investigation.',
  },
  {
    source_id: 'sc-2014-8-scc-273',
    kind: 'case',
    title: 'Arnesh Kumar v. State of Bihar',
    reference: '(2014) 8 SCC 273',
    court: 'Supreme Court of India',
    date: '2014',
    text:
      MOCK_NOTE +
      'Laid down directions to prevent unnecessary arrests in offences punishable with imprisonment up to seven years, requiring police officers to record reasons for arrest against a checklist and Magistrates to scrutinise those reasons before authorising detention.',
  },
  {
    source_id: 'cpc-1908-o19',
    kind: 'statute',
    title: 'The Code of Civil Procedure, 1908',
    reference: 'Order XIX',
    text:
      MOCK_NOTE +
      'Affidavits. The court may order that any particular fact be proved by affidavit. Affidavits are to be confined to facts the deponent can prove from their own knowledge, except on interlocutory applications, where statements of belief may be admitted if the grounds are stated.',
    url: 'https://www.indiacode.nic.in/',
  },
  {
    source_id: 'oaths-1969-s3',
    kind: 'statute',
    title: 'The Oaths Act, 1969',
    reference: 'Section 3',
    text:
      MOCK_NOTE +
      'Power to administer oaths. Courts, persons having authority to receive evidence, and persons authorised by the High Court or State Government (such as Oath Commissioners and Notaries) may administer oaths and affirmations for the purposes of affidavits.',
    url: 'https://www.indiacode.nic.in/',
  },
];

export const MOCK_SOURCES: Record<string, MockSource> = Object.fromEntries(
  sources.map(s => [s.source_id, s]),
);
