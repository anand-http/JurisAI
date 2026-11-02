import type { Draft, DraftSummary } from '../api/types';
import { env } from '../config/env';
import { getEncrypted, removeEncrypted, setEncrypted } from './encryptedStore';

/**
 * Offline copies of drafts. Everything here contains case data, so it goes
 * through the encrypted store only.
 */

const SUMMARIES_KEY = 'drafts:summaries';
const CACHED_IDS_KEY = 'drafts:cachedIds';
const draftKey = (id: string) => `draft:${id}`;

export function toSummary(draft: Draft): DraftSummary {
  const { id, title, docType, status, createdAt, updatedAt } = draft;
  return { id, title, docType, status, createdAt, updatedAt };
}

export async function getCachedSummaries(): Promise<DraftSummary[]> {
  return (await getEncrypted<DraftSummary[]>(SUMMARIES_KEY)) ?? [];
}

export async function setCachedSummaries(list: DraftSummary[]): Promise<void> {
  await setEncrypted(SUMMARIES_KEY, list);
}

export async function getCachedDraftIds(): Promise<string[]> {
  return (await getEncrypted<string[]>(CACHED_IDS_KEY)) ?? [];
}

export async function getCachedDraft(id: string): Promise<Draft | null> {
  return getEncrypted<Draft>(draftKey(id));
}

/** Stores a full draft and keeps the most recent N available offline. */
export async function cacheDraft(draft: Draft): Promise<void> {
  await setEncrypted(draftKey(draft.id), draft);

  const ids = [
    draft.id,
    ...(await getCachedDraftIds()).filter(i => i !== draft.id),
  ];
  const evicted = ids.slice(env.offlineDraftLimit);
  await Promise.all(evicted.map(id => removeEncrypted(draftKey(id))));
  await setEncrypted(CACHED_IDS_KEY, ids.slice(0, env.offlineDraftLimit));

  const summaries = await getCachedSummaries();
  await setCachedSummaries(upsertSummary(summaries, toSummary(draft)));
}

export function upsertSummary(
  list: DraftSummary[],
  summary: DraftSummary,
): DraftSummary[] {
  return [summary, ...list.filter(s => s.id !== summary.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
