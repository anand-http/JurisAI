import { create } from 'zustand';

import { draftsApi } from '../api/endpoints';
import { ApiError, toApiError } from '../api/errors';
import type { Draft, DraftSummary } from '../api/types';
import {
  cacheDraft,
  getCachedDraft,
  getCachedDraftIds,
  getCachedSummaries,
  setCachedSummaries,
  toSummary,
  upsertSummary,
} from '../storage/draftCache';

type ListStatus = 'idle' | 'loading' | 'refreshing' | 'loadingMore' | 'error';

interface DraftsState {
  summaries: DraftSummary[];
  page: number;
  totalPages: number;
  listStatus: ListStatus;
  listError: string | null;
  /** True when the list shown is the offline copy. */
  showingCached: boolean;
  /** Drafts whose full text is in the encrypted offline cache. */
  offlineIds: string[];
  drafts: Record<string, Draft>;

  loadList: (opts?: { refresh?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  loadDraft: (id: string) => Promise<{ draft: Draft; fromCache: boolean }>;
  generate: (
    docType: string,
    inputs: Record<string, string>,
    signal?: AbortSignal,
  ) => Promise<Draft>;
  saveText: (id: string, text: string) => Promise<Draft>;
  reset: () => void;
}

const INITIAL = {
  summaries: [] as DraftSummary[],
  page: 0,
  totalPages: 0,
  listStatus: 'idle' as ListStatus,
  listError: null,
  showingCached: false,
  offlineIds: [] as string[],
  drafts: {} as Record<string, Draft>,
};

/**
 * The list endpoint does not return titles yet, so fill them in from any
 * copy we already hold (in memory or in the encrypted cache).
 */
function withKnownTitles(
  items: DraftSummary[],
  known: DraftSummary[],
): DraftSummary[] {
  const titles = new Map(known.filter(k => k.title).map(k => [k.id, k.title]));
  return items.map(i =>
    i.title ? i : { ...i, title: titles.get(i.id) ?? null },
  );
}

export const useDraftsStore = create<DraftsState>((set, get) => {
  const remember = async (draft: Draft) => {
    set(state => ({
      drafts: { ...state.drafts, [draft.id]: draft },
      summaries: upsertSummary(state.summaries, toSummary(draft)),
      offlineIds: state.offlineIds.includes(draft.id)
        ? state.offlineIds
        : [draft.id, ...state.offlineIds],
    }));
    await cacheDraft(draft).catch(() => undefined);
  };

  return {
    ...INITIAL,

    loadList: async ({ refresh = false } = {}) => {
      set({ listStatus: refresh ? 'refreshing' : 'loading', listError: null });
      const cached = await getCachedSummaries();
      try {
        const first = await draftsApi.list(1);
        const summaries = withKnownTitles(first.items, [
          ...get().summaries,
          ...cached,
        ]);
        set({
          summaries,
          page: first.page,
          totalPages: first.totalPages,
          listStatus: 'idle',
          showingCached: false,
          offlineIds: await getCachedDraftIds(),
        });
        await setCachedSummaries(summaries);
      } catch (error) {
        const apiError = toApiError(error);
        set({
          summaries: cached,
          page: 0,
          totalPages: 0,
          listStatus: apiError.isOffline ? 'idle' : 'error',
          listError: apiError.isOffline ? null : apiError.message,
          showingCached: true,
          offlineIds: await getCachedDraftIds(),
        });
      }
    },

    loadMore: async () => {
      const { page, totalPages, listStatus, showingCached } = get();
      if (showingCached || listStatus !== 'idle' || page >= totalPages) {
        return;
      }
      set({ listStatus: 'loadingMore' });
      try {
        const next = await draftsApi.list(page + 1);
        const cached = await getCachedSummaries();
        set(state => ({
          summaries: [
            ...state.summaries,
            ...withKnownTitles(next.items, cached).filter(
              i => !state.summaries.some(s => s.id === i.id),
            ),
          ],
          page: next.page,
          totalPages: next.totalPages,
          listStatus: 'idle',
        }));
      } catch {
        set({ listStatus: 'idle' });
      }
    },

    loadDraft: async id => {
      try {
        const draft = await draftsApi.get(id);
        await remember(draft);
        return { draft, fromCache: false };
      } catch (error) {
        const apiError = toApiError(error);
        const cached = get().drafts[id] ?? (await getCachedDraft(id));
        if (cached && (apiError.isOffline || apiError.code === 'SERVER')) {
          set(state => ({ drafts: { ...state.drafts, [id]: cached } }));
          return { draft: cached, fromCache: true };
        }
        if (apiError.isOffline) {
          throw new ApiError(
            'NETWORK',
            'This draft is not saved on this device. Connect to the internet to open it.',
            null,
          );
        }
        throw apiError;
      }
    },

    generate: async (docType, inputs, signal) => {
      const draft = await draftsApi.generate(docType, inputs, signal);
      await remember(draft);
      return draft;
    },

    saveText: async (id, text) => {
      const draft = await draftsApi.update(id, text);
      // Keep the local title: the server copy may not carry one.
      const previous = get().drafts[id];
      await remember(previous ? { ...draft, title: previous.title } : draft);
      return get().drafts[id];
    },

    reset: () => set(INITIAL),
  };
});
