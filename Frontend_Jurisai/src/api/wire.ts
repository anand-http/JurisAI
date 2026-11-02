/**
 * JSON shapes exactly as the JurisAI backend (Backend_Jurisai) sends them.
 * Only ./endpoints.ts and the mock backend should import this file.
 *
 * Fields marked PROPOSED are not in the backend yet; the client tolerates
 * their absence (see docs/API_CONTRACT.md).
 */

export interface WireUser {
  id: string;
  email: string;
  name: string | null;
  hasPassword: boolean;
  plan: 'free' | 'pro';
  planRenewsAt: string | null;
  createdAt: string;
  /** PROPOSED: lawyer profile stored server-side. */
  profile?: WireProfile | null;
}

export interface WireProfile {
  fullName: string;
  barRegistrationNumber: string;
  enrolmentState: string;
  practiceAreas: string[];
  primaryCourt: string;
  city: string;
}

export interface WireCitation {
  source_id: string;
  text: string;
  verified: boolean;
}

export interface WireUnlinkedMention {
  mention: string;
  kind: 'statute' | 'case';
}

/** Open items the lawyer must check before filing, evaluated on the current text. */
export type WireReviewIssue =
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

export interface WireGenerated {
  draftId: string;
  draftText: string;
  citations: WireCitation[];
  unlinkedMentions?: WireUnlinkedMention[];
  reviewIssues?: WireReviewIssue[];
}

export interface WireDraft extends WireGenerated {
  documentType: string;
  formFields: Record<string, string>;
  status: 'generated' | 'edited';
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  /** PROPOSED: display title, e.g. "Bail application — Ravi Kumar". */
  title?: string;
}

export interface WireDraftSummary {
  draftId: string;
  documentType: string;
  status: 'generated' | 'edited';
  citationCount: number;
  verifiedCitationCount: number;
  createdAt: string;
  updatedAt: string;
  /** PROPOSED */
  title?: string;
}

export interface WireDraftList {
  items: WireDraftSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WireCitationSource {
  source_id: string;
  verified: boolean;
  claimed_section: string | null;
  verification_detail: string | null;
  source_type: 'statute' | 'case';
  text: string;
  source_url: string | null;
  metadata:
    | { act_name: string; section_number: string; section_title?: string }
    | {
        case_name: string;
        court?: string;
        date?: string;
        citation_text?: string;
      };
}

export interface WireExport {
  fileUrl: string;
}

export interface WireSubscriptionMe {
  plan: 'free' | 'pro';
  renewsAt: string | null;
  subscription: {
    subscriptionId: string;
    status: string;
    currentEnd: string | null;
  } | null;
  usage: { period: string; draftsGenerated: number; limit: number };
}

export interface WireCreateSubscription {
  subscriptionId: string;
  keyId: string;
  status: string;
}

export interface WireError {
  error: { code: string; message: string; [key: string]: unknown };
}
