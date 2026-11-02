import { formatDate, formatIndianNumber } from '../../lib/format';
import type { LawyerProfile } from '../types';
import type { WireCitation, WireUnlinkedMention } from '../wire';

/**
 * Stand-in for the LLM/RAG drafting service. Produces a plausible draft and
 * citation list from the intake answers so the app can be exercised end to
 * end. Each template deliberately includes one weak reference so the
 * unverified / unlinked UI states are visible during development.
 */

type Inputs = Record<string, string>;
interface Built {
  text: string;
  citations: WireCitation[];
  unlinkedMentions: WireUnlinkedMention[];
}

const cite = (
  text: string,
  source_id: string,
  verified = true,
): WireCitation => ({
  text,
  source_id,
  verified,
});

function advocateBlock(profile: LawyerProfile | null, place?: string): string {
  const name = profile?.fullName ?? 'Advocate';
  const enrolment = profile?.barRegistrationNumber
    ? `\nEnrolment No. ${profile.barRegistrationNumber}`
    : '';
  const where = place ?? profile?.city;
  return `${name}\nAdvocate${enrolment}${where ? `\n${where}` : ''}`;
}

const date = (value?: string) => (value ? formatDate(value) : '__________');
const money = (value?: string) =>
  value ? `Rs. ${formatIndianNumber(value)}/-` : 'the said amount';

function legalNotice(i: Inputs, profile: LawyerProfile | null): Built {
  const s138 = 'Section 138 of the Negotiable Instruments Act, 1881';
  const s142 = 'Section 142 of the Negotiable Instruments Act, 1881';
  const o37 = 'Order XXXVII of the Code of Civil Procedure, 1908';
  const weak = 'Example Traders v. Sample Enterprises, (2099) 1 SCC 1';
  const isCheque = i.noticeType === 'cheque_dishonour';
  const days = i.compliancePeriodDays || '15';

  const paragraphs: string[] = [
    'LEGAL NOTICE',
    'By Registered Post A.D. / Speed Post / Email',
    `Date: ${date(i.noticeDate)}`,
    `To,\n${i.recipientName}\n${i.recipientAddress}`,
    `Subject: Legal notice on behalf of ${i.senderName}${
      isCheque ? ` regarding dishonour of cheque No. ${i.chequeNumber}` : ''
    }`,
    'Sir/Madam,',
    `Under instructions from and on behalf of my client, ${
      i.senderName
    }, of ${i.senderAddress.replace(
      /\n/g,
      ', ',
    )} (hereinafter "my client"), I serve upon you the following notice:`,
    `1. That ${i.facts.trim().replace(/\.$/, '')}.`,
  ];

  if (isCheque) {
    paragraphs.push(
      `2. That towards discharge of the said liability you issued cheque No. ${
        i.chequeNumber
      } dated ${date(i.chequeDate)} for ${money(i.amount)} drawn on ${
        i.bankName
      }. On presentation, the cheque was returned unpaid with the remark "${
        i.dishonourReason
      }" vide return memo dated ${date(i.dishonourDate)}.`,
      `3. That the dishonour of the said cheque for the reason stated constitutes an offence under ${s138}. This notice is the written demand contemplated by clause (b) of the proviso to that section.`,
      `4. That as held in ${weak}, the drawer cannot escape liability once the debt is admitted in writing.`,
      `5. I therefore call upon you to pay ${money(
        i.amount,
      )} to my client within ${days} days of receipt of this notice, failing which my client shall file a complaint before the competent court in accordance with ${s142}, at your risk as to costs and consequences.`,
    );
  } else {
    paragraphs.push(
      `2. That despite repeated requests, you have failed to meet your obligations, causing loss to my client.`,
      `3. I therefore call upon you, within ${days} days of receipt of this notice, to: ${i.relief
        .trim()
        .replace(/\.$/, '')}.`,
      i.amount
        ? `4. That in default, my client shall institute a suit for recovery of ${money(
            i.amount,
          )} under ${o37}, along with interest and costs, at your risk as to costs and consequences.`
        : '4. That in default, my client shall initiate appropriate civil and/or criminal proceedings against you, at your risk as to costs and consequences.',
    );
  }

  paragraphs.push(
    'A copy of this notice is retained in my office for record and further action.',
    advocateBlock(profile),
  );

  const citations = isCheque
    ? [
        cite(s138, 'nia-1881-s138'),
        cite(s142, 'nia-1881-s142'),
        cite(weak, 'case-unknown-2099', false),
      ]
    : i.amount
    ? [cite(o37, 'cpc-1908-o37')]
    : [];
  return { text: paragraphs.join('\n\n'), citations, unlinkedMentions: [] };
}

const BAIL_SECTIONS: Record<
  string,
  { text: string; id: string; heading: string }
> = {
  regular: {
    text: 'Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023',
    id: 'bnss-2023-s480',
    heading: 'REGULAR BAIL',
  },
  interim: {
    text: 'Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023',
    id: 'bnss-2023-s480',
    heading: 'INTERIM BAIL',
  },
  anticipatory: {
    text: 'Section 482 of the Bharatiya Nagarik Suraksha Sanhita, 2023',
    id: 'bnss-2023-s482',
    heading: 'ANTICIPATORY BAIL',
  },
  default: {
    text: 'Section 187 of the Bharatiya Nagarik Suraksha Sanhita, 2023',
    id: 'bnss-2023-s187',
    heading: 'DEFAULT BAIL',
  },
};

function bailApplication(i: Inputs, profile: LawyerProfile | null): Built {
  const section = BAIL_SECTIONS[i.bailType] ?? BAIL_SECTIONS.regular;
  const antil =
    'Satender Kumar Antil v. Central Bureau of Investigation, (2022) 10 SCC 51';
  const arnesh = 'Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273';
  const anticipatory = i.bailType === 'anticipatory';

  const custody = anticipatory
    ? 'apprehends arrest in the above FIR'
    : `has been in custody since ${date(i.arrestDate)}`;

  const paragraphs = [
    `IN THE COURT OF ${i.courtName.toUpperCase()}`,
    `IN THE MATTER OF:\nState v. ${i.accusedName}\nFIR No. ${i.firNumber}, Police Station ${i.policeStation}\nUnder ${i.offenceSections}`,
    `APPLICATION FOR ${
      section.heading
    } UNDER ${section.text.toUpperCase()} ON BEHALF OF ${i.accusedName.toUpperCase()}`,
    'MOST RESPECTFULLY SHOWETH:',
    `1. That the applicant, ${i.accusedName}, child/spouse of ${
      i.parentName
    }, aged about ${i.age} years, resident of ${i.accusedAddress.replace(
      /\n/g,
      ', ',
    )}, ${custody}.`,
    `2. That, as per the prosecution, ${i.facts.trim().replace(/\.$/, '')}.`,
    `3. That the applicant seeks bail on the following grounds, among others: ${i.grounds
      .trim()
      .replace(/\.$/, '')}.`,
    i.antecedents?.trim()
      ? `4. That as regards antecedents: ${i.antecedents
          .trim()
          .replace(/\.$/, '')}.`
      : '4. That the applicant has no criminal antecedents.',
    `5. That the Hon'ble Supreme Court in ${antil} has reiterated that bail is the rule and jail the exception, and laid down guidelines for the disposal of bail applications.`,
    `6. That the directions in ${arnesh} regarding the necessity of arrest are squarely applicable to the facts of the present case.`,
    `7. That this application is maintainable under ${section.text}, which corresponds to Section 437 of the Code of Criminal Procedure, 1973.`,
    i.previousApplications?.trim()
      ? `8. That the details of earlier applications are: ${i.previousApplications
          .trim()
          .replace(/\.$/, '')}.`
      : '8. That no other bail application has been filed by the applicant in this case before this or any other court.',
    "9. That the applicant undertakes to abide by all conditions that this Hon'ble Court may impose and shall not tamper with evidence or influence witnesses.",
    'PRAYER',
    `It is therefore most respectfully prayed that this Hon'ble Court may be pleased to:\n(a) ${
      anticipatory
        ? 'direct that in the event of arrest, the applicant be released on bail'
        : 'release the applicant on bail'
    } in FIR No. ${i.firNumber}, P.S. ${
      i.policeStation
    }, on such terms as this Hon'ble Court deems fit; and\n(b) pass any other order as this Hon'ble Court may deem fit in the interest of justice.`,
    `APPLICANT\nThrough\n${advocateBlock(profile)}`,
  ];

  return {
    text: paragraphs.join('\n\n'),
    citations: [
      cite(section.text, section.id),
      cite(antil, 'sc-2022-10-scc-51'),
      cite(arnesh, 'sc-2014-8-scc-273'),
    ],
    // Named in paragraph 7 but not backed by any citation.
    unlinkedMentions: [
      {
        mention: 'Section 437 of the Code of Criminal Procedure, 1973',
        kind: 'statute',
      },
    ],
  };
}

function affidavit(i: Inputs, profile: LawyerProfile | null): Built {
  const o19 = 'Order XIX of the Code of Civil Procedure, 1908';
  const oaths = 'Section 3 of the Oaths Act, 1969';
  const forCourt = i.affidavitType !== 'general';

  const statements = i.statements
    .split('\n')
    .map(l =>
      l
        .trim()
        .replace(/^\d+[.)]\s*/, '')
        .replace(/\.$/, ''),
    )
    .filter(Boolean);

  const paragraphs: string[] = [];
  if (forCourt) {
    paragraphs.push(
      `IN THE COURT OF ${i.courtName.toUpperCase()}`,
      i.caseTitle,
    );
  }
  paragraphs.push(
    forCourt ? 'AFFIDAVIT' : `AFFIDAVIT — ${i.purpose.toUpperCase()}`,
    `I, ${i.deponentName}, ${i.relation} ${i.relativeName}, aged about ${
      i.age
    } years${
      i.occupation ? `, ${i.occupation}` : ''
    }, resident of ${i.deponentAddress.replace(
      /\n/g,
      ', ',
    )}, do hereby solemnly affirm and declare as under:`,
    '1. That I am the deponent herein, am fully conversant with the facts stated below, and am competent to swear this affidavit.',
    ...statements.map(
      (s, n) => `${n + 2}. That ${s.charAt(0).toLowerCase()}${s.slice(1)}.`,
    ),
  );
  if (forCourt) {
    paragraphs.push(
      `${
        statements.length + 2
      }. That this affidavit is confined to facts within my own knowledge, in accordance with ${o19}.`,
    );
  }
  paragraphs.push(
    'DEPONENT',
    'VERIFICATION',
    `Verified at ${i.verificationPlace} on ${date(
      i.verificationDate,
    )} that the contents of the above affidavit are true and correct to my knowledge and belief, and nothing material has been concealed therefrom.`,
    'DEPONENT',
    `Solemnly affirmed before me in accordance with ${oaths}.\n\nNotary / Oath Commissioner`,
    `Drafted by:\n${advocateBlock(profile, i.verificationPlace)}`,
  );

  return {
    text: paragraphs.filter(Boolean).join('\n\n'),
    citations: [
      ...(forCourt ? [cite(o19, 'cpc-1908-o19')] : []),
      cite(oaths, 'oaths-1969-s3'),
    ],
    unlinkedMentions: [],
  };
}

const BUILDERS: Record<string, (i: Inputs, p: LawyerProfile | null) => Built> =
  {
    legal_notice: legalNotice,
    bail_application: bailApplication,
    affidavit,
  };

export function buildMockDraft(
  docType: string,
  inputs: Inputs,
  profile: LawyerProfile | null,
): Built {
  const builder = BUILDERS[docType];
  if (!builder) {
    throw new Error(`Unsupported document type: ${docType}`);
  }
  return builder(inputs, profile);
}
