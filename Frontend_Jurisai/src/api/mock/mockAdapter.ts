import {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosResponse,
  type GenericAbortSignal,
  type InternalAxiosRequestConfig,
} from 'axios';

import { documentTypeFor } from '../../documents/registry';
import { bytesToBase64 } from '../../lib/base64';
import { getEncrypted, setEncrypted } from '../../storage/encryptedStore';
import type { LawyerProfile } from '../types';
import type {
  WireCitationSource,
  WireDraft,
  WireDraftList,
  WireSubscriptionMe,
  WireUser,
} from '../wire';
import { buildDocx, buildPdf } from './devFiles';
import { MOCK_SOURCES } from './sources';
import { buildMockDraft } from './templates';

/**
 * In-app stand-in for Backend_Jurisai (enabled by env.useMockApi). Speaks
 * the same wire format (../wire.ts) with realistic latency, plus the
 * PROPOSED additions from docs/API_CONTRACT.md. Its "database" is kept in
 * the encrypted store so drafts survive reloads during development.
 *
 * Mock sign-in code for every email: 123456. Passwords set in mock mode are
 * kept in memory, so they survive sign-out but not an app restart.
 */

export const MOCK_OTP = '123456';
const FREE_DRAFTS_PER_MONTH = 3;
const PRO_DRAFTS_PER_MONTH = 200;
const DB_KEY = 'mock:db';

interface MockDb {
  user: WireUser | null;
  drafts: WireDraft[];
  usage: { period: string; draftsGenerated: number };
  subscription: WireSubscriptionMe['subscription'];
}

let db: MockDb | null = null;
/** email -> password. Outside MockDb because sign-out wipes the DB. */
const mockPasswords = new Map<string, string>();

const currentPeriod = () => new Date().toISOString().slice(0, 7);

async function loadDb(): Promise<MockDb> {
  if (!db) {
    db = (await getEncrypted<MockDb>(DB_KEY)) ?? {
      user: null,
      drafts: [],
      usage: { period: currentPeriod(), draftsGenerated: 0 },
      subscription: null,
    };
  }
  if (db.usage.period !== currentPeriod()) {
    db.usage = { period: currentPeriod(), draftsGenerated: 0 };
  }
  return db;
}

const saveDb = () => (db ? setEncrypted(DB_KEY, db) : Promise.resolve());

/** Called on sign-out: the encrypted store (and this DB with it) is wiped. */
export function resetMockDb() {
  db = null;
}

/** Stands in for the Razorpay webhook that activates Pro on the server. */
export async function mockActivateSubscription(subscriptionId: string) {
  const store = await loadDb();
  if (!store.user) {
    return;
  }
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  store.user.plan = 'pro';
  store.user.planRenewsAt = end.toISOString();
  store.subscription = {
    subscriptionId,
    status: 'active',
    currentEnd: end.toISOString(),
  };
  await saveDb();
}

// ---- plumbing -------------------------------------------------------------------

class MockHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

let latencyScale = 1;

/** Tests run the mock with no artificial latency. */
export function setMockLatencyScale(scale: number) {
  latencyScale = scale;
}

function wait(ms: number, signal?: GenericAbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CanceledError());
      return;
    }
    const timer = setTimeout(resolve, ms * latencyScale);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer);
      reject(new CanceledError());
    });
  });
}

type Handler = (ctx: {
  body: any;
  params: Record<string, string>;
  query: Record<string, string | number | undefined>;
  signal?: GenericAbortSignal;
}) => Promise<unknown>;

const routes: Array<{
  method: string;
  pattern: RegExp;
  keys: string[];
  auth: boolean;
  handler: Handler;
}> = [];

function route(method: string, path: string, handler: Handler, auth = true) {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    })}$`,
  );
  routes.push({ method, pattern, keys, auth, handler });
}

export async function mockAdapter(
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  const method = (config.method ?? 'get').toUpperCase();
  const path = (config.url ?? '').split('?')[0];
  const body =
    typeof config.data === 'string' && config.data
      ? JSON.parse(config.data)
      : config.data ?? {};

  const respond = (status: number, data: unknown): AxiosResponse => ({
    data,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
    request: {},
  });

  const matched = routes
    .filter(r => r.method === method)
    .map(r => ({ r, m: r.pattern.exec(path) }))
    .find(x => x.m);

  try {
    await wait(250 + Math.random() * 350, config.signal);
    if (!matched) {
      throw new MockHttpError(404, 'not_found', 'Route not found');
    }
    const auth = String(config.headers?.Authorization ?? '');
    if (matched.r.auth && !auth.startsWith('Bearer mock-token-')) {
      throw new MockHttpError(401, 'unauthorized', 'Authentication required');
    }
    const params = Object.fromEntries(
      matched.r.keys.map((k, i) => [k, decodeURIComponent(matched.m![i + 1])]),
    );
    const data = await matched.r.handler({
      body,
      params,
      query: config.params ?? {},
      signal: config.signal,
    });
    return respond(200, data);
  } catch (error) {
    if (error instanceof MockHttpError) {
      throw new AxiosError(
        error.message,
        error.status >= 500
          ? AxiosError.ERR_BAD_RESPONSE
          : AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        respond(error.status, {
          error: { code: error.code, message: error.message },
        }),
      );
    }
    throw error;
  }
}

// ---- auth -------------------------------------------------------------------------

const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

async function signInMock(email: string) {
  const store = await loadDb();
  if (!store.user || store.user.email !== email) {
    store.user = {
      id: 'usr_mock_1',
      email,
      name: null,
      hasPassword: mockPasswords.has(email),
      plan: 'free',
      planRenewsAt: null,
      createdAt: new Date().toISOString(),
      profile: null,
    };
  }
  if (store.drafts.length === 0) {
    store.drafts = seedDrafts(store.user.profile ?? null);
  }
  await saveDb();
  return { token: `mock-token-${Date.now()}`, user: store.user };
}

route(
  'POST',
  '/auth/otp',
  async ({ body }) => {
    if (!isEmail(body.email)) {
      throw new MockHttpError(
        400,
        'validation_error',
        'Enter a valid email address',
      );
    }
    return { success: true };
  },
  false,
);

route(
  'POST',
  '/auth/verify',
  async ({ body }) => {
    await wait(400);
    if (body.otp !== MOCK_OTP) {
      throw new MockHttpError(
        400,
        'otp_invalid',
        'That code is incorrect. Please try again.',
      );
    }
    return signInMock(String(body.email));
  },
  false,
);

route(
  'POST',
  '/auth/login',
  async ({ body }) => {
    await wait(400);
    const email = String(body.email ?? '');
    if (
      !mockPasswords.has(email) ||
      mockPasswords.get(email) !== body.password
    ) {
      throw new MockHttpError(
        401,
        'invalid_credentials',
        'Incorrect email or password',
      );
    }
    return signInMock(email);
  },
  false,
);

route('PUT', '/auth/password', async ({ body }) => {
  const store = await loadDb();
  if (!store.user) {
    throw new MockHttpError(401, 'unauthorized', 'Account not found');
  }
  const next = String(body.newPassword ?? '');
  if (next.length < 8) {
    throw new MockHttpError(
      400,
      'validation_error',
      'Password must be at least 8 characters',
    );
  }
  mockPasswords.set(store.user.email, next);
  store.user = { ...store.user, hasPassword: true };
  await saveDb();
  return { user: store.user };
});

// PROPOSED
route('GET', '/me', async () => {
  const store = await loadDb();
  if (!store.user) {
    throw new MockHttpError(401, 'unauthorized', 'Account not found');
  }
  return store.user;
});

// PROPOSED
route('PUT', '/me/profile', async ({ body }) => {
  const store = await loadDb();
  if (!store.user) {
    throw new MockHttpError(401, 'unauthorized', 'Account not found');
  }
  const profile = body as LawyerProfile;
  store.user = { ...store.user, name: profile.fullName, profile };
  await saveDb();
  return store.user;
});

// ---- drafts -------------------------------------------------------------------------

route('POST', '/drafts/generate', async ({ body, signal }) => {
  const { documentType, formFields } = body as {
    documentType: string;
    formFields: Record<string, string>;
  };
  const store = await loadDb();
  const def = documentTypeFor(documentType);
  if (!def) {
    throw new MockHttpError(
      400,
      'unsupported_document_type',
      'Only litigation documents are supported',
    );
  }
  const limit =
    store.user?.plan === 'pro' ? PRO_DRAFTS_PER_MONTH : FREE_DRAFTS_PER_MONTH;
  if (store.usage.draftsGenerated >= limit) {
    throw new MockHttpError(
      402,
      'quota_exceeded',
      `Monthly draft limit reached for the ${store.user?.plan ?? 'free'} plan`,
    );
  }

  // Retrieval + drafting + citation verification latency.
  await wait(6500 + Math.random() * 2500, signal);

  const built = buildMockDraft(def.id, formFields, store.user?.profile ?? null);
  const now = new Date().toISOString();
  const draft: WireDraft = {
    draftId: Date.now().toString(16).padStart(24, '0'),
    documentType,
    formFields,
    draftText: built.text,
    citations: built.citations,
    unlinkedMentions: built.unlinkedMentions,
    status: 'generated',
    createdAt: now,
    updatedAt: now,
    editedAt: null,
    title: def.draftTitle(formFields),
  };
  store.drafts.unshift(draft);
  store.usage.draftsGenerated += 1;
  await saveDb();
  const { draftId, draftText, citations, unlinkedMentions } = draft;
  return { draftId, draftText, citations, unlinkedMentions };
});

route('GET', '/drafts', async ({ query }) => {
  const store = await loadDb();
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const q = String(query.q ?? '')
    .toLowerCase()
    .trim();
  const matches = store.drafts
    .filter(
      d =>
        !q ||
        (d.title ?? '').toLowerCase().includes(q) ||
        d.draftText.toLowerCase().includes(q),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const response: WireDraftList = {
    items: matches.slice((page - 1) * limit, page * limit).map(d => ({
      draftId: d.draftId,
      documentType: d.documentType,
      status: d.status,
      citationCount: d.citations.length,
      verifiedCitationCount: d.citations.filter(c => c.verified).length,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      title: d.title,
    })),
    page,
    limit,
    total: matches.length,
    totalPages: Math.ceil(matches.length / limit),
  };
  return response;
});

async function findDraft(id: string): Promise<WireDraft> {
  const draft = (await loadDb()).drafts.find(d => d.draftId === id);
  if (!draft) {
    throw new MockHttpError(404, 'not_found', 'Draft not found');
  }
  return draft;
}

route('GET', '/drafts/:id', async ({ params }) => findDraft(params.id));

route('PUT', '/drafts/:id', async ({ params, body }) => {
  const draft = await findDraft(params.id);
  if (typeof body.draftText !== 'string' || !body.draftText.trim()) {
    throw new MockHttpError(
      400,
      'validation_error',
      'Draft text cannot be empty',
    );
  }
  draft.draftText = body.draftText;
  draft.status = 'edited';
  draft.editedAt = draft.updatedAt = new Date().toISOString();
  await saveDb();
  return draft;
});

route('GET', '/drafts/:id/citation/:sourceId', async ({ params }) => {
  const draft = await findDraft(params.id);
  const citation = draft.citations.find(c => c.source_id === params.sourceId);
  if (!citation) {
    throw new MockHttpError(
      404,
      'not_found',
      'Citation not found on this draft',
    );
  }
  const source = MOCK_SOURCES[params.sourceId];
  if (!source) {
    throw new MockHttpError(
      404,
      'source_not_found',
      'No source exists for this citation; it was not verified',
    );
  }
  const section = source.reference.replace(/^Section\s+/, '');
  const response: WireCitationSource = {
    source_id: source.source_id,
    verified: citation.verified,
    claimed_section: null,
    verification_detail: citation.verified
      ? null
      : 'Claimed section does not match the stored source',
    source_type: source.kind,
    text: source.text,
    source_url: source.url ?? null,
    metadata:
      source.kind === 'statute'
        ? { act_name: source.title, section_number: section }
        : {
            case_name: source.title,
            court: source.court,
            date: source.date,
            citation_text: source.reference,
          },
  };
  return response;
});

route('POST', '/drafts/:id/export', async ({ params, body }) => {
  const draft = await findDraft(params.id);
  await wait(1200);
  // PROPOSED body options; the real backend renders DOCX only today.
  const paperSize = body.paperSize === 'LEGAL' ? 'LEGAL' : 'A4';
  const pdf = body.format === 'pdf';
  const bytes = pdf
    ? buildPdf(draft.draftText, paperSize)
    : buildDocx(draft.draftText, paperSize);
  const mime = pdf
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return { fileUrl: `data:${mime};base64,${bytesToBase64(bytes)}` };
});

// ---- subscriptions --------------------------------------------------------------------

route('GET', '/subscriptions/me', async () => {
  const store = await loadDb();
  const plan = store.user?.plan ?? 'free';
  const response: WireSubscriptionMe = {
    plan,
    renewsAt: store.user?.planRenewsAt ?? null,
    subscription: store.subscription,
    usage: {
      period: store.usage.period,
      draftsGenerated: store.usage.draftsGenerated,
      limit: plan === 'pro' ? PRO_DRAFTS_PER_MONTH : FREE_DRAFTS_PER_MONTH,
    },
  };
  return response;
});

route('POST', '/subscriptions', async () => {
  const store = await loadDb();
  if (store.subscription?.status === 'active') {
    throw new MockHttpError(
      409,
      'already_subscribed',
      'You already have an active subscription',
    );
  }
  store.subscription = {
    subscriptionId: `sub_mock_${Date.now()}`,
    status: 'created',
    currentEnd: null,
  };
  await saveDb();
  return {
    subscriptionId: store.subscription.subscriptionId,
    keyId: 'rzp_test_mock',
    status: 'created',
  };
});

// ---- seed data ---------------------------------------------------------------------------

function seedDrafts(profile: LawyerProfile | null): WireDraft[] {
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();
  const samples: Array<{
    docType: string;
    inputs: Record<string, string>;
    age: number;
  }> = [
    {
      docType: 'legal_notice',
      age: 2,
      inputs: {
        noticeType: 'cheque_dishonour',
        noticeDate: daysAgo(2).slice(0, 10),
        senderName: 'M/s Sunrise Traders',
        senderAddress: '14, Chandni Chowk\nDelhi 110006',
        recipientName: 'Mr. Vikram Mehta',
        recipientAddress: 'B-22, Lajpat Nagar II\nNew Delhi 110024',
        chequeNumber: '004512',
        chequeDate: '2026-08-05',
        bankName: 'State Bank of India, Lajpat Nagar branch',
        dishonourDate: '2026-09-10',
        dishonourReason: 'Funds insufficient',
        amount: '450000',
        facts:
          'you purchased textile goods worth Rs. 4,50,000/- from my client under invoice No. ST/112 dated 12 July 2026 and acknowledged the outstanding amount in writing',
        relief: 'Pay Rs. 4,50,000/- within 15 days',
        compliancePeriodDays: '15',
      },
    },
    {
      docType: 'bail_application',
      age: 6,
      inputs: {
        bailType: 'regular',
        courtName: 'Sessions Judge, Saket Courts, New Delhi',
        firNumber: '245/2026',
        policeStation: 'Malviya Nagar',
        offenceSections: 'Sections 318(4) and 316(2) BNS',
        accusedName: 'Ravi Kumar',
        parentName: 'Suresh Kumar',
        age: '34',
        accusedAddress: 'H.No. 56, Shivalik\nNew Delhi 110017',
        arrestDate: '2026-09-01',
        facts:
          'the complainant alleges that the applicant received an advance for a property transaction and failed to return it',
        grounds:
          'the dispute is civil in nature, the documents are already seized, the charge-sheet is yet to be filed and the applicant has permanent roots in Delhi',
      },
    },
  ];
  return samples.map(({ docType, inputs, age }, n) => {
    const def = documentTypeFor(docType)!;
    const built = buildMockDraft(docType, inputs, profile);
    return {
      draftId: `5eed0000000000000000000${n + 1}`,
      documentType: def.backendType?.(inputs) ?? docType,
      formFields: inputs,
      draftText: built.text,
      citations: built.citations,
      unlinkedMentions: built.unlinkedMentions,
      status: 'generated',
      createdAt: daysAgo(age),
      updatedAt: daysAgo(age),
      editedAt: null,
      title: def.draftTitle(inputs),
    };
  });
}
