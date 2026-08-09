import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";
import type { CryptoKey } from "jose";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;      // account UUID
  wid: string;      // primary workspace UUID
  sid: string;      // refresh token family UUID (session ID)
  iat: number;
  exp: number;
  iss: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ISSUER = "chronix";
const ALGORITHM = "ES256" as const;
const ACCESS_TOKEN_TTL = 900; // 15 minutes in seconds

// ─── Key loaders (cached per PEM value) ──────────────────────────────────────
// Cache is keyed on the PEM string so distinct keys produce distinct objects.
// This prevents the module-singleton anti-pattern where a second different PEM
// is silently ignored because the first import was cached.

const privateKeyCache = new Map<string, CryptoKey>();
const publicKeyCache = new Map<string, CryptoKey>();

export async function getPrivateKey(pem: string): Promise<CryptoKey> {
  const cached = privateKeyCache.get(pem);
  if (cached !== undefined) return cached;
  const imported = await importPKCS8(pem, ALGORITHM);
  privateKeyCache.set(pem, imported);
  return imported;
}

export async function getPublicKey(pem: string): Promise<CryptoKey> {
  const cached = publicKeyCache.get(pem);
  if (cached !== undefined) return cached;
  const imported = await importSPKI(pem, ALGORITHM);
  publicKeyCache.set(pem, imported);
  return imported;
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, "iat" | "exp" | "iss">,
  privateKeyPem: string,
): Promise<string> {
  const key = await getPrivateKey(privateKeyPem);
  return new SignJWT({ wid: payload.wid, sid: payload.sid })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .sign(key);
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export async function verifyAccessToken(
  token: string,
  publicKeyPem: string,
): Promise<AccessTokenPayload> {
  const key = await getPublicKey(publicKeyPem);
  const { payload } = await jwtVerify(token, key, {
    issuer: ISSUER,
    algorithms: [ALGORITHM], // explicit — prevents algorithm-confusion attacks
  });
  if (
    typeof payload.sub !== "string" ||
    typeof payload["wid"] !== "string" ||
    typeof payload["sid"] !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.iss !== ISSUER
  ) {
    throw new Error("Access token payload is incomplete.");
  }
  return {
    sub: payload.sub,
    wid: payload["wid"],
    sid: payload["sid"],
    iat: payload.iat,
    exp: payload.exp,
    iss: payload.iss,
  };
}
