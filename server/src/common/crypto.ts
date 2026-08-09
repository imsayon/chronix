import { argon2id, hash as argon2Hash, verify as argon2Verify } from "argon2";
import { createHmac, randomBytes } from "node:crypto";

// ─── Argon2id — passwords only ────────────────────────────────────────────────

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2Hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  return argon2Verify(hash, plaintext);
}

// ─── SHA-256 HMAC — API key hashing ──────────────────────────────────────────
// API keys are 256-bit random — no stretching needed.
// A static server-side secret (API_KEY_HMAC_SECRET) acts as a pepper:
// a leaked DB alone cannot verify keys without the pepper.

export function hashApiKey(rawKey: string, secret: string): string {
  return createHmac("sha256", secret).update(rawKey).digest("hex");
}

// ─── Random bytes ─────────────────────────────────────────────────────────────

export function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

// ─── SHA-256 (generic, e.g. refresh token hashing) ───────────────────────────

export function sha256Hex(value: string): string {
  return createHmac("sha256", "chronix-rt").update(value).digest("hex");
}
