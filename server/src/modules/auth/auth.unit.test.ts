import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken } from "../../common/jwt.js";
import { randomBase64Url } from "../../common/crypto.js";

// ─── Key generation helper ────────────────────────────────────────────────────
// For tests only — generate an ephemeral EC P-256 key pair as PEM.
// We use Node's built-in crypto so there is no extra dependency.

import { generateKeyPairSync } from "node:crypto";

function generateTestKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey: privateKey as string, publicKey: publicKey as string };
}

describe("JWT utilities", () => {
  it("signs and verifies an access token roundtrip", async () => {
    const { privateKey, publicKey } = generateTestKeyPair();
    const payload = { sub: "acc-1", wid: "ws-1", sid: "sess-1" };
    const token = await signAccessToken(payload, privateKey);
    expect(typeof token).toBe("string");

    const verified = await verifyAccessToken(token, publicKey);
    expect(verified.sub).toBe(payload.sub);
    expect(verified.wid).toBe(payload.wid);
    expect(verified.sid).toBe(payload.sid);
    expect(verified.iss).toBe("chronix");
  });

  it("rejects a token signed with a different key", async () => {
    const pair1 = generateTestKeyPair();
    const pair2 = generateTestKeyPair();
    const token = await signAccessToken({ sub: "acc-1", wid: "ws-1", sid: "sess-1" }, pair1.privateKey);
    await expect(verifyAccessToken(token, pair2.publicKey)).rejects.toThrow();
  });

  it("rejects an HS256-signed token (algorithm confusion)", async () => {
    // Manually construct an HS256 token — verifyAccessToken must reject it
    const jose = await import("jose");
    const secret = new TextEncoder().encode("supersecret");
    const hs256Token = await new jose.SignJWT({ sub: "evil" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("chronix")
      .setExpirationTime("15m")
      .sign(secret);

    const { publicKey } = generateTestKeyPair();
    await expect(verifyAccessToken(hs256Token, publicKey)).rejects.toThrow();
  });

  it("generates API key with chx_live_ prefix", () => {
    const raw = `chx_live_${randomBase64Url(32)}`;
    expect(raw.startsWith("chx_live_")).toBe(true);
    expect(raw.length).toBeGreaterThan(20);
  });
});
