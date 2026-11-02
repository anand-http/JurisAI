import AsyncStorage from '@react-native-async-storage/async-storage';
import { gcm } from '@noble/ciphers/aes.js';
import { concatBytes, randomBytes } from '@noble/ciphers/utils.js';

import { base64ToBytes, bytesToBase64 } from '../lib/base64';
import { utf8Decode, utf8Encode } from '../lib/utf8';
import { getDataKey } from './secureStore';

/**
 * AsyncStorage wrapper that encrypts values with AES-256-GCM. Used for all
 * case data kept for offline access (draft text, titles, party names).
 *
 * Format: "v1:" + base64(nonce[12] || ciphertext || tag[16]).
 * The storage key is bound as associated data, so a ciphertext copied to a
 * different key fails authentication instead of decrypting.
 */

const PREFIX = 'enc:';
const VERSION = 'v1:';
const NONCE_BYTES = 12;

export async function setEncrypted(key: string, value: unknown): Promise<void> {
  const dataKey = await getDataKey();
  const nonce = randomBytes(NONCE_BYTES);
  const aad = utf8Encode(key);
  const plaintext = utf8Encode(JSON.stringify(value));
  const sealed = gcm(dataKey, nonce, aad).encrypt(plaintext);
  await AsyncStorage.setItem(
    PREFIX + key,
    VERSION + bytesToBase64(concatBytes(nonce, sealed)),
  );
}

export async function getEncrypted<T>(key: string): Promise<T | null> {
  const stored = await AsyncStorage.getItem(PREFIX + key);
  if (!stored?.startsWith(VERSION)) {
    return null;
  }
  try {
    const dataKey = await getDataKey();
    const bytes = base64ToBytes(stored.slice(VERSION.length));
    const nonce = bytes.subarray(0, NONCE_BYTES);
    const sealed = bytes.subarray(NONCE_BYTES);
    const plaintext = gcm(dataKey, nonce, utf8Encode(key)).decrypt(sealed);
    return JSON.parse(utf8Decode(plaintext)) as T;
  } catch {
    // Wrong key (e.g. keychain was reset) or tampered value: treat as absent.
    await AsyncStorage.removeItem(PREFIX + key);
    return null;
  }
}

export async function removeEncrypted(key: string): Promise<void> {
  await AsyncStorage.removeItem(PREFIX + key);
}

export async function clearEncrypted(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.removeMany(keys.filter(k => k.startsWith(PREFIX)));
}
