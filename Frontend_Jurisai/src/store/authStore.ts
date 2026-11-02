import { create } from 'zustand';

import { onUnauthorized, setAuthToken } from '../api/client';
import { authApi } from '../api/endpoints';
import { ApiError } from '../api/errors';
import { resetMockDb } from '../api/mock/mockAdapter';
import type { LawyerProfile, User } from '../api/types';
import { deleteAllExports } from '../services/exportFiles';
import { clearEncrypted } from '../storage/encryptedStore';
import { clearSecrets, getToken, setToken } from '../storage/secureStore';
import {
  clearLocalData,
  getStoredUser,
  isFirstLaunchAfterInstall,
  setStoredUser,
} from '../storage/session';
import { useDraftsStore } from './draftsStore';
import { useIntakeStore } from './intakeStore';
import { useSubscriptionStore } from './subscriptionStore';

export type AuthStatus = 'loading' | 'signedOut' | 'needsProfile' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /**
   * When this session was created with an email code (ms), if it was. For 15
   * minutes after that the backend lets the user set a new password without
   * the old one, which is how "forgot password" works.
   */
  emailCodeSignInAt: number | null;
  hydrate: () => Promise<void>;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  setPassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  saveProfile: (profile: LawyerProfile) => Promise<void>;
  signOut: () => Promise<void>;
}

/** Matches FRESH_OTP_SESSION_SECONDS on the backend, minus a minute of clock slack. */
export const FRESH_EMAIL_CODE_MS = 14 * 60 * 1000;

const statusFor = (user: User): AuthStatus =>
  user.profile ? 'signedIn' : 'needsProfile';

/** Server profile wins; fall back to the one saved on this device. */
const mergeProfile = (fresh: User, local: User | null): User => ({
  ...fresh,
  profile: fresh.profile ?? local?.profile ?? null,
});

export const useAuthStore = create<AuthState>((set, get) => {
  const startSession = async (
    token: string,
    user: User,
    emailCodeSignInAt: number | null,
  ) => {
    await setToken(token);
    await setStoredUser(user);
    setAuthToken(token);
    set({ user, status: statusFor(user), emailCodeSignInAt });
  };

  return {
    status: 'loading',
    user: null,
    emailCodeSignInAt: null,

    hydrate: async () => {
      if (await isFirstLaunchAfterInstall()) {
        await clearSecrets();
      }
      const [token, user] = await Promise.all([getToken(), getStoredUser()]);
      if (!token || !user) {
        set({ status: 'signedOut', user: null });
        return;
      }
      setAuthToken(token);
      set({ status: statusFor(user), user });

      // Refresh in the background; offline or an older backend is fine.
      authApi
        .me()
        .then(async fresh => {
          const merged = mergeProfile(fresh, get().user);
          await setStoredUser(merged);
          set({ user: merged, status: statusFor(merged) });
        })
        .catch(() => undefined);
    },

    requestOtp: email => authApi.requestOtp(email),

    verifyOtp: async (email, otp) => {
      const { token, user } = await authApi.verifyOtp(email, otp);
      await startSession(token, user, Date.now());
    },

    loginWithPassword: async (email, password) => {
      const { token, user } = await authApi.loginWithPassword(email, password);
      await startSession(token, user, null);
    },

    setPassword: async (newPassword, currentPassword) => {
      const fresh = await authApi.setPassword(newPassword, currentPassword);
      const user = mergeProfile(fresh, get().user);
      await setStoredUser(user);
      set({ user });
    },

    saveProfile: async profile => {
      const current = get().user;
      if (!current) {
        return;
      }
      let user: User;
      try {
        user = await authApi.updateProfile(profile);
      } catch (error) {
        // Backend_Jurisai has no profile endpoint yet (PROPOSED in
        // docs/API_CONTRACT.md); keep the profile on this device until it does.
        if (!(error instanceof ApiError && error.code === 'NOT_FOUND')) {
          throw error;
        }
        user = { ...current, profile };
      }
      await setStoredUser(user);
      set({ user, status: statusFor(user) });
    },

    signOut: async () => {
      if (get().status === 'signedOut') {
        return;
      }
      setAuthToken(null);
      set({ status: 'signedOut', user: null, emailCodeSignInAt: null });
      useDraftsStore.getState().reset();
      useIntakeStore.getState().reset();
      useSubscriptionStore.getState().clear();
      // Case data must not outlive the session on a shared device.
      await Promise.allSettled([
        clearEncrypted(),
        clearLocalData(),
        deleteAllExports(),
        clearSecrets(),
      ]);
      resetMockDb();
    },
  };
});

onUnauthorized(() => {
  useAuthStore.getState().signOut();
});
