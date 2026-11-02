/**
 * Drives the real API layer (axios client + wire mappers) against the mock
 * backend, which speaks Backend_Jurisai's wire format.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { setAuthToken } from '../src/api/client';
import { authApi, billingApi, draftsApi } from '../src/api/endpoints';
import { ApiError } from '../src/api/errors';
import { resetMockDb, setMockLatencyScale } from '../src/api/mock/mockAdapter';
import { findUnlinkedReferences } from '../src/lib/citations';
import { clearSecrets } from '../src/storage/secureStore';

const bailInputs = {
  bailType: 'regular',
  courtName: 'Sessions Judge, Saket Courts, New Delhi',
  firNumber: '245/2026',
  policeStation: 'Malviya Nagar',
  offenceSections: 'Sections 318(4) and 316(2) BNS',
  accusedName: 'Ravi Kumar',
  parentName: 'Suresh Kumar',
  age: '34',
  accusedAddress: 'New Delhi',
  arrestDate: '2026-09-01',
  facts: 'the complainant alleges non-return of an advance',
  grounds: 'the dispute is civil in nature',
};

const EMAIL = 'adv.sharma@chambers.in';

async function signIn() {
  await authApi.requestOtp(EMAIL);
  const { token, user } = await authApi.verifyOtp(EMAIL, '123456');
  setAuthToken(token);
  return user;
}

describe('API layer against the mock backend', () => {
  beforeAll(() => setMockLatencyScale(0));

  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearSecrets();
    resetMockDb();
    setAuthToken(null);
  });

  it('rejects a wrong OTP with the server message', async () => {
    await expect(authApi.verifyOtp(EMAIL, '000000')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'That code is incorrect. Please try again.',
    });
  });

  it('rejects an invalid email before sending a code', async () => {
    await expect(authApi.requestOtp('not-an-email')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Enter a valid email address',
    });
  });

  it('signs in with an email code, sets a password, then signs in with it', async () => {
    const user = await signIn();
    expect(user).toMatchObject({ email: EMAIL, hasPassword: false });

    await expect(
      authApi.loginWithPassword(EMAIL, 'Nyaya-2026-secure'),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      serverCode: 'invalid_credentials',
      message: 'Incorrect email or password',
    });

    const updated = await authApi.setPassword('Nyaya-2026-secure');
    expect(updated.hasPassword).toBe(true);

    setAuthToken(null);
    const session = await authApi.loginWithPassword(EMAIL, 'Nyaya-2026-secure');
    expect(session.token).toEqual(expect.any(String));
    expect(session.user).toMatchObject({ email: EMAIL, hasPassword: true });
  });

  it('requires a token for draft routes', async () => {
    await expect(draftsApi.list(1)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('generates a draft whose citations all appear in the text', async () => {
    const user = await signIn();
    expect(user.profile).toBeNull();

    const draft = await draftsApi.generate('bail_application', bailInputs);
    expect(draft.title).toBe('Bail application — Ravi Kumar');
    expect(draft.citations.length).toBeGreaterThan(0);
    for (const c of draft.citations) {
      expect(draft.text.toLowerCase()).toContain(c.text.toLowerCase());
    }
    expect(draft.unlinkedMentions).toEqual([
      'Section 437 of the Code of Criminal Procedure, 1973',
    ]);
    // The client-side detector agrees with the server about the unlinked mention.
    expect(
      findUnlinkedReferences(draft.text).some(
        r =>
          draft.text.slice(r.start, r.end) ===
          'Section 437 of the Code of Criminal Procedure, 1973',
      ),
    ).toBe(true);

    // The server stores the tuned backend type; the client maps it back.
    const fetched = await draftsApi.get(draft.id);
    expect(fetched.docType).toBe('bail_application');
  });

  it('lists, edits and fetches citation sources', async () => {
    await signIn();
    const page = await draftsApi.list(1);
    expect(page.items).toHaveLength(2); // seeded samples
    const notice = page.items.find(i => i.docType === 'legal_notice')!;
    expect(notice.verifiedCitationCount).toBe(2);
    expect(notice.citationCount).toBe(3);

    const draft = await draftsApi.get(notice.id);
    const updated = await draftsApi.update(
      draft.id,
      `${draft.text}\n\nAdded paragraph.`,
    );
    expect(updated.status).toBe('edited');
    expect(updated.text.endsWith('Added paragraph.')).toBe(true);

    const verified = draft.citations.find(c => c.verified)!;
    const source = await draftsApi.citationSource(
      draft.id,
      verified.source_id!,
    );
    expect(source).toMatchObject({
      kind: 'statute',
      title: 'The Negotiable Instruments Act, 1881',
      verified: true,
    });
    expect(source.reference).toMatch(/^Section 1\d\d$/);

    const unverified = draft.citations.find(c => !c.verified)!;
    const error = await draftsApi
      .citationSource(draft.id, unverified.source_id!)
      .catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      serverCode: 'source_not_found',
    });
  });

  it('enforces the free quota with a 402', async () => {
    await signIn();
    for (let i = 0; i < 3; i++) {
      await draftsApi.generate('bail_application', bailInputs);
    }
    expect(await billingApi.subscription()).toMatchObject({
      tier: 'free',
      draftsUsedThisPeriod: 3,
      draftLimit: 3,
    });
    await expect(
      draftsApi.generate('bail_application', bailInputs),
    ).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      serverCode: 'quota_exceeded',
    });
  });

  it('exports a DOCX by default and a PDF when asked', async () => {
    await signIn();
    const { items } = await draftsApi.list(1);
    const docx = await draftsApi.export(items[0].id, 'docx', 'A4');
    expect(docx.format).toBe('docx');
    expect(docx.url).toMatch(/^data:application\/vnd\.openxmlformats/);
    const pdf = await draftsApi.export(items[0].id, 'pdf', 'LEGAL');
    expect(pdf.format).toBe('pdf');
  });
});
