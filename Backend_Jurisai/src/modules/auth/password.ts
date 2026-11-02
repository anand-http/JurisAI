import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

/**
 * scrypt with N=2^15, r=8, p=3 (32 MiB per hash), one of OWASP's recommended settings.
 * Parameters are stored in the hash so they can be raised later without breaking old hashes.
 * Format: scrypt$N$r$p$saltB64$hashB64
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
const maxmem = (N: number, r: number) => 256 * N * r; // 2x the 128*N*r scrypt needs

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p } = PARAMS;
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: maxmem(N, r) });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const N = Number(n);
  const R = Number(r);
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N,
    r: R,
    p: Number(p),
    maxmem: maxmem(N, R),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spend the same time on unknown accounts as on real ones, so response time doesn't reveal which emails exist. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equaliser");
  await verifyPassword(password, await dummyHash);
}
