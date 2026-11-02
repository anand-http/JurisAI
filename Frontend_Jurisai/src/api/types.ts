/**
 * The app's domain model. Screens and stores only use these types; the
 * backend's wire format lives in ./wire.ts and is mapped in ./endpoints.ts.
 */

// ---- Auth & profile -------------------------------------------------------

export interface LawyerProfile {
  fullName: string;
  /** Enrolment number as printed on the Bar Council certificate. */
  barRegistrationNumber: string;
  /** State/UT whose Bar Council the advocate is enrolled with. */
  enrolmentState: string;
  practiceAreas: string[];
  /** Court the advocate primarily appears in; pre-fills draft forms. */
  primaryCourt: string;
  city: string;
}

export interface User {
  id: string;
  email: string;
  /** False until the user sets one; they can always sign in with an email code. */
  hasPassword: boolean;
  profile: LawyerProfile | null;
}

// ---- Drafts ---------------------------------------------------------------

/**
 * A reference the drafting model relied on. `verified` is true only when the
 * backend matched the citation to a retrieved source document.
 */
export interface Citation {
  source_id: string | null;
  text: string;
  verified: boolean;
}

export type DraftStatus = 'generated' | 'edited';

/**
 * Something the backend wants the lawyer to check before filing: an unverified
 * citation, an authority with no source, a fact not found in the intake answers,
 * or a blank left to fill. The backend recomputes these after every edit.
 */
export type ReviewIssue =
  | {
      type: 'unverified_citation';
      text: string;
      source_id: string;
      detail: string;
    }
  | { type: 'unlinked_authority'; text: string }
  | {
      type: 'unsupported_fact';
      kind: 'date' | 'amount' | 'number' | 'name';
      text: string;
      context: string;
    }
  | { type: 'placeholder'; text: string };

export interface Draft {
  id: string;
  title: string;
  docType: string;
  text: string;
  citations: Citation[];
  /** Authorities named in the text that no verified citation backs. */
  unlinkedMentions: string[];
  /** Open review items from the backend; absent on older or cached drafts. */
  reviewIssues?: ReviewIssue[];
  /** The intake answers the draft was generated from. */
  inputs: Record<string, string>;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DraftSummary {
  id: string;
  /** null when the backend does not send one and the draft isn't cached. */
  title: string | null;
  docType: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  citationCount?: number;
  verifiedCitationCount?: number;
}

export interface DraftPage {
  items: DraftSummary[];
  page: number;
  totalPages: number;
}

export type SourceKind = 'statute' | 'case';

/** Source text retrieved from the legal database — never model output. */
export interface CitationSource {
  source_id: string;
  kind: SourceKind;
  /** e.g. "The Negotiable Instruments Act, 1881" or a case name. */
  title: string;
  /** e.g. "Section 138 — Dishonour of cheque…" or "(2022) 10 SCC 51". */
  reference: string;
  text: string;
  verified: boolean;
  /** What the draft claimed, when it differs from the source. */
  claimedSection: string | null;
  /** Why the backend could not verify the citation, if it couldn't. */
  verificationDetail: string | null;
  court?: string;
  date?: string;
  url?: string;
}

export type ExportFormat = 'pdf' | 'docx';
export type PaperSize = 'A4' | 'LEGAL';

export interface ExportedFile {
  url: string;
  format: ExportFormat;
}

// ---- Billing --------------------------------------------------------------

export type PlanTier = 'free' | 'pro';

export interface Subscription {
  tier: PlanTier;
  draftsUsedThisPeriod: number;
  draftLimit: number;
  renewsAt: string | null;
  /** Razorpay subscription status, if a checkout was ever started. */
  paymentStatus: string | null;
}

export interface CheckoutSession {
  subscriptionId: string;
  keyId: string;
}
