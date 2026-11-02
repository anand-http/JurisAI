import { HttpError } from "../../lib/errors.js";

export interface DocumentTypeProfile {
  key: string;
  label: string;
  /** Legal topics appended to the retrieval query only; never shown to the model. */
  retrievalHints: string;
  /** Structural notes for the model. Deliberately contains no section numbers or case names. */
  draftingNotes: string;
  /** Extra retrieval hints chosen by one form field's value, e.g. the kind of notice. */
  hintsByField?: { field: string; hints: Record<string, string> };
}

const PROFILES: DocumentTypeProfile[] = [
  {
    key: "anticipatory_bail",
    label: "Application for Anticipatory Bail",
    retrievalHints:
      "anticipatory bail direction for grant of bail to person apprehending arrest non-bailable offence Section 438 Code of Criminal Procedure Section 482 Bharatiya Nagarik Suraksha Sanhita personal liberty",
    draftingNotes:
      "Application before the Court of Session or High Court. Set out the FIR/complaint particulars, the grounds for apprehending arrest, the applicant's antecedents and roots in society, readiness to cooperate with investigation and abide by conditions, and a prayer for interim protection pending disposal.",
  },
  {
    key: "regular_bail",
    label: "Application for Regular Bail",
    retrievalHints:
      "regular bail accused in custody non-bailable offence release on bail conditions Code of Criminal Procedure Bharatiya Nagarik Suraksha Sanhita",
    draftingNotes:
      "Application for release of an accused in custody. Set out custody details and period, stage of investigation or trial, grounds for bail, parity if any, and undertakings the accused offers.",
  },
  {
    key: "quashing_petition",
    label: "Petition for Quashing of FIR / Criminal Proceedings",
    retrievalHints:
      "quashing FIR inherent powers of High Court abuse of process of court ends of justice Section 482 Code of Criminal Procedure Section 528 Bharatiya Nagarik Suraksha Sanhita Bhajan Lal",
    draftingNotes:
      "Criminal miscellaneous petition before the High Court. Set out the FIR and proceedings under challenge, a brief statement of facts, specific grounds showing why the allegations taken at face value do not make out the offence or why continuation is an abuse of process, and the prayer for quashing and interim stay.",
  },
  {
    key: "police_complaint",
    label: "Complaint to Police for Registration of FIR",
    retrievalHints:
      "information in cognizable cases registration of FIR mandatory officer in charge of police station Section 154 Code of Criminal Procedure Lalita Kumari",
    draftingNotes:
      "Complaint addressed to the Station House Officer. Chronological statement of facts with dates, places and persons involved, the cognizable offences disclosed, details of evidence and witnesses, and a request to register an FIR and investigate.",
  },
  {
    key: "legal_notice",
    label: "Legal Notice",
    retrievalHints: "legal notice demand notice",
    hintsByField: {
      field: "noticeType",
      hints: {
        cheque_dishonour:
          "dishonour of cheque for insufficiency of funds returned unpaid demand notice in writing within thirty days payment within fifteen days of receipt of notice legally enforceable debt presumption in favour of holder complaint within one month Negotiable Instruments Act Section 138 Section 139 Section 142",
        money_recovery:
          "recovery of money dues compensation for loss or damage caused by breach of contract Indian Contract Act Section 73",
        breach_of_contract:
          "breach of contract compensation for loss or damage sum named in the contract penalty stipulated reasonable compensation Indian Contract Act Section 73 Section 74",
        tenancy:
          "lease of immovable property month to month notice to quit terminable by fifteen days notice notice in writing sent by post Transfer of Property Act Section 106",
      },
    },
    draftingNotes:
      "Notice from an advocate on behalf of the client (sender) to the recipient, not a court filing. Advocate's name and address block, reference and date, mode of dispatch (e.g. 'By Registered Post A.D. / Speed Post'), recipient's name and address, subject line, then 'Under instructions from and on behalf of my client ...'. Numbered paragraphs stating the facts in date order, the legal basis relied on, a specific demand (amount, interest or action) within the compliance period given in the form fields, and the consequence of non-compliance (appropriate civil and/or criminal proceedings at the recipient's risk as to costs). Close by noting a copy is retained for further action, with the advocate's signature block.",
  },
  {
    key: "affidavit",
    label: "Affidavit",
    retrievalHints: "affidavit deponent solemnly affirm verification oath",
    hintsByField: {
      field: "affidavitType",
      hints: {
        supporting:
          "affidavit in support of application matters to which affidavits shall be confined facts deponent is able of his own knowledge to prove interlocutory applications statements of belief grounds stated Order XIX Rule 3 Code of Civil Procedure",
        evidence:
          "evidence affidavit examination-in-chief of a witness shall be on affidavit copies supplied to the opposite party Order XVIII Rule 4 Code of Civil Procedure",
        general:
          "oath on affidavit administered by court magistrate notary or officer appointed by High Court Section 139 Code of Civil Procedure",
      },
    },
    draftingNotes:
      "Affidavit sworn by the deponent. For an affidavit in a case, begin with the court and cause title from the form fields; for a general declaration, begin with the heading only. Heading 'AFFIDAVIT'. Opening: 'I, <name>, <relation> <relative's name>, aged about <age> years, <occupation>, resident of <address>, do hereby solemnly affirm and declare as under:'. Numbered paragraphs, one statement each, using the statements in the form fields and confined to facts within the deponent's own knowledge. Then 'DEPONENT', then a VERIFICATION paragraph (verified at the place and on the date given in the form fields that the contents are true and correct to the deponent's knowledge, no part is false and nothing material has been concealed), then 'DEPONENT'. An affidavit normally cites no authorities; cite one only if the form fields call for it.",
  },
];

const ALIASES: Record<string, string> = {
  anticipatory_bail_application: "anticipatory_bail",
  bail_application: "regular_bail",
  bail: "regular_bail",
  quashing: "quashing_petition",
  quash_fir: "quashing_petition",
  fir_complaint: "police_complaint",
  complaint_for_fir: "police_complaint",
  demand_notice: "legal_notice",
  notice: "legal_notice",
};

/** Transactional drafting is out of scope for this product (litigation only). */
const TRANSACTIONAL =
  /\b(contract|agreement|deed|lease|licen[cs]e|nda|mou|memorandum of understanding|power of attorney|partnership|employment|will|sale|rent)\b/;

const normalizeKey = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function resolveDocumentType(raw: string): DocumentTypeProfile {
  const key = normalizeKey(raw);
  const canonical = ALIASES[key] ?? key;
  const known = PROFILES.find((p) => p.key === canonical);
  if (known) return known;

  if (TRANSACTIONAL.test(key.replace(/_/g, " "))) {
    throw new HttpError(400, "unsupported_document_type", "Only litigation documents are supported", {
      supportedDocumentTypes: PROFILES.map((p) => p.key),
    });
  }
  // Unknown litigation type: draft generically rather than reject a type the client already offers.
  const label = raw.trim().replace(/[_-]+/g, " ");
  return { key, label, retrievalHints: "", draftingNotes: "Follow the standard format for this document in Indian courts." };
}

export const SUPPORTED_DOCUMENT_TYPES = PROFILES.map(({ key, label }) => ({ key, label }));
