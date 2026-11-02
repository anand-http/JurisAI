import * as Keychain from 'react-native-keychain';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/ciphers/utils.js';

/**
 * Secrets live in the iOS Keychain / Android Keystore, never AsyncStorage:
 *  - the API session token
 *  - the AES key that encrypts cached case data (see encryptedStore.ts)
 */

const TOKEN_SERVICE = 'com.jurisai.session';
const DATA_KEY_SERVICE = 'com.jurisai.datakey';

const baseOptions = {
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function getToken(): Promise<string | null> {
  const result = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
  return result ? result.password : null;
}

export async function setToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('session', token, {
    ...baseOptions,
    service: TOKEN_SERVICE,
  });
}

let dataKeyPromise: Promise<Uint8Array> | null = null;

/**
 * Returns the 256-bit data key, creating it on first use. Concurrent callers
 * share one promise; otherwise two could each create and store a different
 * key, leaving data encrypted under the losing key unreadable.
 */
export function getDataKey(): Promise<Uint8Array> {
  if (!dataKeyPromise) {
    dataKeyPromise = loadOrCreateDataKey().catch(error => {
      dataKeyPromise = null;
      throw error;
    });
  }
  return dataKeyPromise;
}

async function loadOrCreateDataKey(): Promise<Uint8Array> {
  const existing = await Keychain.getGenericPassword({
    service: DATA_KEY_SERVICE,
  });
  if (existing) {
    return hexToBytes(existing.password);
  }
  const key = randomBytes(32);
  await Keychain.setGenericPassword('datakey', bytesToHex(key), {
    ...baseOptions,
    service: DATA_KEY_SERVICE,
  });
  return key;
}

/**
 * Removes the token and the data key. Without the key, anything left in the
 * encrypted cache is unreadable, so this is also the "wipe" on sign-out.
 */
export async function clearSecrets(): Promise<void> {
  dataKeyPromise = null;
  await Promise.all([
    Keychain.resetGenericPassword({ service: TOKEN_SERVICE }),
    Keychain.resetGenericPassword({ service: DATA_KEY_SERVICE }),
  ]);
}
