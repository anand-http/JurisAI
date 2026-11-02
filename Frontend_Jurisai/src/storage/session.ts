import AsyncStorage from '@react-native-async-storage/async-storage';

import type { User } from '../api/types';

/**
 * Non-secret session data in AsyncStorage: the signed-in lawyer's profile.
 * The token itself is in the Keychain (secureStore.ts).
 */

const USER_KEY = 'session:user';
const INSTALL_MARKER_KEY = 'app:installed';

export async function getStoredUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * iOS keeps Keychain items after the app is deleted. AsyncStorage does not,
 * so a missing marker means this is a fresh install and old secrets must go.
 */
export async function isFirstLaunchAfterInstall(): Promise<boolean> {
  const marker = await AsyncStorage.getItem(INSTALL_MARKER_KEY);
  if (marker) {
    return false;
  }
  await AsyncStorage.setItem(INSTALL_MARKER_KEY, new Date().toISOString());
  return true;
}

/** Clears everything except the install marker. */
export async function clearLocalData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.removeMany(keys.filter(k => k !== INSTALL_MARKER_KEY));
}
