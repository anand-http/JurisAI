import { create } from 'zustand';

import { billingApi } from '../api/endpoints';
import type { Subscription } from '../api/types';

interface SubscriptionState {
  subscription: Subscription | null;
  refresh: () => Promise<Subscription | null>;
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  refresh: async () => {
    try {
      const subscription = await billingApi.subscription();
      set({ subscription });
      return subscription;
    } catch {
      // Keep the last known value; the backend enforces limits anyway.
      return get().subscription;
    }
  },
  clear: () => set({ subscription: null }),
}));

/** Free drafts left this month, or null on Pro (fair-use cap is server-side). */
export function draftsRemaining(
  subscription: Subscription | null,
): number | null {
  if (!subscription || subscription.tier === 'pro') {
    return null;
  }
  return Math.max(
    subscription.draftLimit - subscription.draftsUsedThisPeriod,
    0,
  );
}
