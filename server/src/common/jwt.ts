import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";

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

const privateKeyCache = new Map<string, any>();
const publicKeyCache = new Map<string, any>();

export async function getPrivateKey(pem: string): Promise<any> {
  if (!privateKeyCache.has(pem)) {
    privateKeyCache.set(pem, await importPKCS8(pem, ALGORITHM));
  }
  return privateKeyCache.get(pem);
}

export async function getPublicKey(pem: string): Promise<any> {
  if (!publicKeyCache.has(pem)) {
    publicKeyCache.set(pem, await importSPKI(pem, ALGORITHM));
  }
  return publicKeyCache.get(pem);
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
  const { payload } = await jwtVerify<AccessTokenPayload>(token, key, {
    issuer: ISSUER,
    algorithms: [ALGORITHM], // explicit — prevents algorithm-confusion attacks
  });
  return payload as AccessTokenPayload;
}
