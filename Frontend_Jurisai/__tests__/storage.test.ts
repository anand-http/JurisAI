/// <reference types="node" />
import AsyncStorage from '@react-native-async-storage/async-storage';

import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';
import { utf8Decode, utf8Encode } from '../src/lib/utf8';
import { getEncrypted, setEncrypted } from '../src/storage/encryptedStore';
import { clearSecrets } from '../src/storage/secureStore';

describe('encrypted store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearSecrets();
  });

  it('round-trips values and never stores plaintext', async () => {
    const draft = {
      title: 'Bail application — Ravi Kumar',
      text: 'FIR No. 245/2026',
    };
    await setEncrypted('draft:1', draft);

    const raw = await AsyncStorage.getItem('enc:draft:1');
    expect(raw).toMatch(/^v1:/);
    expect(raw).not.toContain('Ravi');
    expect(await getEncrypted('draft:1')).toEqual(draft);
  });

  it('refuses a ciphertext moved to another key', async () => {
    await setEncrypted('draft:1', { secret: true });
    await AsyncStorage.setItem(
      'enc:draft:2',
      (await AsyncStorage.getItem('enc:draft:1'))!,
    );
    expect(await getEncrypted('draft:2')).toBeNull();
  });

  it('cannot read data once the key is wiped (sign-out)', async () => {
    await setEncrypted('draft:1', { secret: true });
    await clearSecrets();
    expect(await getEncrypted('draft:1')).toBeNull();
  });
});

describe('base64', () => {
  it('round-trips arbitrary bytes of every padding length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 1000]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      const encoded = bytesToBase64(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
    }
  });
});

describe('data key', () => {
  it('creates a single key when many writes race on first use', async () => {
    await AsyncStorage.clear();
    await clearSecrets();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => setEncrypted(`k${i}`, { i })),
    );
    for (let i = 0; i < 8; i++) {
      expect(await getEncrypted(`k${i}`)).toEqual({ i });
    }
  });
});

describe('without TextEncoder/TextDecoder (Hermes)', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { TextEncoder: g.TextEncoder, TextDecoder: g.TextDecoder };
  beforeAll(() => {
    delete g.TextEncoder;
    delete g.TextDecoder;
  });
  afterAll(() => Object.assign(g, saved));

  it('still encrypts and decrypts Unicode case data', async () => {
    await AsyncStorage.clear();
    await clearSecrets();
    const value = { text: 'याचिका ₹4,50,000 — “Ravi” 👩‍⚖️', n: 1 };
    await setEncrypted('draft:u', value);
    expect(await getEncrypted('draft:u')).toEqual(value);
  });

  it('utf8 helpers match Node for mixed scripts', () => {
    const text = 'Section 138 — धारा १३८ — ₹ — 𝕏 — 👩‍⚖️';
    const bytes = utf8Encode(text);
    expect(Buffer.from(bytes).toString('utf8')).toBe(text);
    expect(utf8Decode(Uint8Array.from(Buffer.from(text, 'utf8')))).toBe(text);
  });
});
