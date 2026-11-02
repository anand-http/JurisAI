import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-draft review progress: whether the AI disclaimer has been shown and
 * which citations the lawyer has checked against their source. Holds only
 * ids and citation keys (statute/case references), no case facts.
 */
export interface ReviewState {
  disclaimerSeen: boolean;
  checkedCitations: string[];
}

const key = (draftId: string) => `review:${draftId}`;
const EMPTY: ReviewState = { disclaimerSeen: false, checkedCitations: [] };

export async function getReviewState(draftId: string): Promise<ReviewState> {
  const raw = await AsyncStorage.getItem(key(draftId));
  if (!raw) {
    return EMPTY;
  }
  try {
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<ReviewState>) };
  } catch {
    return EMPTY;
  }
}

export async function updateReviewState(
  draftId: string,
  patch: Partial<ReviewState>,
): Promise<ReviewState> {
  const next = { ...(await getReviewState(draftId)), ...patch };
  await AsyncStorage.setItem(key(draftId), JSON.stringify(next));
  return next;
}
