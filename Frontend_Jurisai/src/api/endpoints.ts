import { env } from '../config/env';
import { documentTypeFor, getDocumentType } from '../documents/registry';
import { http } from './client';
import type {
  CheckoutSession,
  Citation,
  CitationSource,
  Draft,
  DraftPage,
  DraftSummary,
  ExportFormat,
  ExportedFile,
  LawyerProfile,
  PaperSize,
  Subscription,
  User,
} from './types';
import type {
  WireCitationSource,
  WireCreateSubscription,
  WireDraft,
  WireDraftList,
  WireDraftSummary,
  WireExport,
  WireGenerated,
  WireSubscriptionMe,
  WireUser,
} from './wire';

/**
 * Typed calls to the JurisAI backend. Every response is mapped from the
 * wire format (./wire.ts) into the app's domain model (./types.ts).
 */

const PAGE_SIZE = 20;

// ---- mappers ------------------------------------------------------------------

export function toUser(w: WireUser): User {
  return {
    id: w.id,
    email: w.email,
    hasPassword: w.hasPassword ?? false,
    profile: w.profile ?? null,
  };
}

type Session = { token: string; user: User };
const toSession = (r: {
  data: { token: string; user: WireUser };
}): Session => ({
  token: r.data.token,
  user: toUser(r.data.user),
});

function toCitations(
  list: Array<{ source_id: string; text: string; verified: boolean }>,
): Citation[] {
  return list.map(c => ({
    source_id: c.source_id || null,
    text: c.text,
    verified: c.verified,
  }));
}

function draftTitle(docType: string, inputs: Record<string, string>): string {
  return getDocumentType(docType)?.draftTitle(inputs) ?? humanize(docType);
}

function toDraft(w: WireDraft): Draft {
  const def = documentTypeFor(w.documentType);
  const docType = def?.id ?? w.documentType;
  return {
    id: w.draftId,
    title: w.title ?? draftTitle(docType, w.formFields),
    docType,
    text: w.draftText,
    citations: toCitations(w.citations),
    unlinkedMentions: (w.unlinkedMentions ?? []).map(m => m.mention),
    reviewIssues: w.reviewIssues,
    inputs: w.formFields,
    status: w.status,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

function toSummary(w: WireDraftSummary): DraftSummary {
  return {
    id: w.draftId,
    title: w.title ?? null,
    docType: documentTypeFor(w.documentType)?.id ?? w.documentType,
    status: w.status,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    citationCount: w.citationCount,
    verifiedCitationCount: w.verifiedCitationCount,
  };
}

function toSource(w: WireCitationSource): CitationSource {
  const m = w.metadata as Record<string, string | undefined>;
  const isStatute = w.source_type === 'statute';
  return {
    source_id: w.source_id,
    kind: w.source_type,
    title: (isStatute ? m.act_name : m.case_name) ?? 'Source',
    reference: isStatute
      ? [sectionLabel(m.section_number), m.section_title]
          .filter(Boolean)
          .join(' — ')
      : m.citation_text ?? '',
    text: w.text,
    verified: w.verified,
    claimedSection: w.claimed_section,
    verificationDetail: w.verification_detail,
    court: isStatute ? undefined : m.court,
    date: isStatute ? undefined : m.date,
    url: w.source_url ?? undefined,
  };
}

function toSubscription(w: WireSubscriptionMe): Subscription {
  return {
    tier: w.plan,
    draftsUsedThisPeriod: w.usage.draftsGenerated,
    draftLimit: w.usage.limit,
    renewsAt: w.renewsAt,
    paymentStatus: w.subscription?.status ?? null,
  };
}

/** "138" -> "Section 138"; "Order XXXVII" stays as is. */
function sectionLabel(value?: string): string | undefined {
  return value && /^\d/.test(value) ? `Section ${value}` : value;
}

/** Trust what the server actually produced over what was requested. */
function formatFromUrl(url: string): ExportFormat {
  if (url.startsWith('data:')) {
    return url.startsWith('data:application/pdf') ? 'pdf' : 'docx';
  }
  return /\.pdf(\?|$)/i.test(url) ? 'pdf' : 'docx';
}

const humanize = (key: string) =>
  key.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());

// ---- endpoints ------------------------------------------------------------------

export const authApi = {
  /** Emails a 6-digit sign-in code. New emails get an account on verify. */
  requestOtp: (email: string) =>
    http
      .post<{ success: boolean }>('/auth/otp', { email })
      .then(() => undefined),

  verifyOtp: (email: string, otp: string): Promise<Session> =>
    http
      .post<{ token: string; user: WireUser }>('/auth/verify', { email, otp })
      .then(toSession),

  /** 401 `invalid_credentials` for a wrong password or an account without one. */
  loginWithPassword: (email: string, password: string): Promise<Session> =>
    http
      .post<{ token: string; user: WireUser }>('/auth/login', {
        email,
        password,
      })
      .then(toSession),

  /**
   * Sets or changes the password. `currentPassword` is required to change an
   * existing one, except within 15 minutes of signing in with an email code
   * (the backend answers 400 `current_password_required` otherwise).
   */
  setPassword: (newPassword: string, currentPassword?: string) =>
    http
      .put<{ user: WireUser }>('/auth/password', {
        newPassword,
        currentPassword: currentPassword || undefined,
      })
      .then(r => toUser(r.data.user)),

  /** PROPOSED endpoint — see docs/API_CONTRACT.md. */
  me: () => http.get<WireUser>('/me').then(r => toUser(r.data)),

  /** PROPOSED endpoint — see docs/API_CONTRACT.md. */
  updateProfile: (profile: LawyerProfile) =>
    http.put<WireUser>('/me/profile', profile).then(r => toUser(r.data)),
};

export const draftsApi = {
  generate: async (
    docType: string,
    inputs: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Draft> => {
    const def = getDocumentType(docType);
    const documentType = def?.backendType?.(inputs) ?? docType;
    const { data } = await http.post<WireGenerated>(
      '/drafts/generate',
      { documentType, formFields: inputs },
      { signal, timeout: env.generateTimeoutMs },
    );
    const now = new Date().toISOString();
    return {
      id: data.draftId,
      title: draftTitle(docType, inputs),
      docType,
      text: data.draftText,
      citations: toCitations(data.citations),
      unlinkedMentions: (data.unlinkedMentions ?? []).map(m => m.mention),
      reviewIssues: data.reviewIssues,
      inputs,
      status: 'generated',
      createdAt: now,
      updatedAt: now,
    };
  },

  list: (page: number, q?: string): Promise<DraftPage> =>
    http
      .get<WireDraftList>('/drafts', {
        // `q` is PROPOSED; the backend currently ignores it and the
        // client also filters locally.
        params: { page, limit: PAGE_SIZE, q: q || undefined },
      })
      .then(r => ({
        items: r.data.items.map(toSummary),
        page: r.data.page,
        totalPages: r.data.totalPages,
      })),

  get: (id: string) =>
    http.get<WireDraft>(`/drafts/${id}`).then(r => toDraft(r.data)),

  update: (id: string, text: string) =>
    http
      .put<WireDraft>(`/drafts/${id}`, { draftText: text })
      .then(r => toDraft(r.data)),

  citationSource: (draftId: string, sourceId: string) =>
    http
      .get<WireCitationSource>(
        `/drafts/${draftId}/citation/${encodeURIComponent(sourceId)}`,
      )
      .then(r => toSource(r.data)),

  /**
   * The backend renders DOCX only; `format` and `paperSize` are PROPOSED
   * options. While the draft has open review issues, the backend refuses to
   * export (409 `review_required`) unless `acknowledgeIssues` is true, and it
   * records the acknowledgement with the export.
   */
  export: (
    id: string,
    format: ExportFormat,
    paperSize: PaperSize,
    acknowledgeIssues = false,
  ): Promise<ExportedFile> =>
    http
      .post<WireExport>(
        `/drafts/${id}/export`,
        { format, paperSize, acknowledgeIssues },
        { timeout: 60_000 },
      )
      .then(r => ({
        url: r.data.fileUrl,
        format: formatFromUrl(r.data.fileUrl),
      })),
};

export const billingApi = {
  subscription: () =>
    http
      .get<WireSubscriptionMe>('/subscriptions/me')
      .then(r => toSubscription(r.data)),

  /** Creates (or resumes) a Razorpay subscription for the Pro plan. */
  startCheckout: (): Promise<CheckoutSession> =>
    http.post<WireCreateSubscription>('/subscriptions').then(r => ({
      subscriptionId: r.data.subscriptionId,
      keyId: r.data.keyId,
    })),
};
