/**
 * Phase 1 Auth integration tests.
 *
 * Uses @testcontainers/postgresql for an isolated PostgreSQL container.
 * Runs migrations via Prisma before all tests.
 * Uses supertest to send HTTP requests against the full Express app.
 *
 * All server-module imports are dynamic (inside beforeAll) so that
 * process.env is fully set before config/index.ts evaluates loadConfig().
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { generateKeyPairSync } from "node:crypto";
import { execSync } from "node:child_process";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Redis } from "ioredis";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const { privateKey: JWT_PRIVATE_KEY, publicKey: JWT_PUBLIC_KEY } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const API_KEY_HMAC_SECRET = "test-hmac-secret-that-is-at-least-32-characters";

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: PrismaClient;
let redis: Redis;
let app: ReturnType<typeof supertest>;

beforeAll(async () => {
  // Use local postgres instance
  const databaseUrl = "postgresql://chronix:password@localhost/chronix_test";

  // Set env vars BEFORE any server module is imported
  process.env["NODE_ENV"] = "test";
  process.env["DATABASE_URL"] = databaseUrl;
  process.env["REDIS_URL"] = "redis://localhost:6379";
  process.env["JWT_PRIVATE_KEY"] = JWT_PRIVATE_KEY;
  process.env["JWT_PUBLIC_KEY"] = JWT_PUBLIC_KEY;
  process.env["API_KEY_HMAC_SECRET"] = API_KEY_HMAC_SECRET;
  process.env["CORS_ORIGIN"] = "http://localhost:3001";

  // Run migrations
  execSync("pnpm prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: process.cwd(),
  });

  // Dynamic imports AFTER env is set — prevents config eager-load at import time
  const { config } = await import("../../common/config/index.js");
  const { createDatabaseClient } = await import("../../infra/database/client.js");
  const { createHttpServer } = await import("../../infra/http/server.js");
  const { createRedisConnection } = await import("../../infra/queue/client.js");

  db = createDatabaseClient(config);

  // Redis connection (graceful — auth tests don't require Redis for core logic)
  try {
    redis = createRedisConnection(config);
    await redis.ping();
  } catch {
    // Redis not available in CI — rate limiter fails open, tests still pass
  }

  const httpApp = createHttpServer(db, redis!);
  app = supertest(httpApp);
}, 60_000);

beforeEach(async () => {
  // Clean tables and rate limiter before each test
  if (db) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE workspaces, workspace_memberships, api_keys, accounts CASCADE;`);
  }
  if (redis) {
    await redis.flushall();
  }
});

afterAll(async () => {
  await db?.$executeRawUnsafe(`TRUNCATE TABLE workspaces, workspace_memberships, api_keys, accounts CASCADE;`);
  await db?.$disconnect();
  await redis?.quit();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function registerUser(email: string, password = "Password1!") {
  return app.post("/api/v1/auth/register").send({ email, password, displayName: "Test User" });
}

async function loginUser(email: string, password = "Password1!") {
  return app.post("/api/v1/auth/login").send({ email, password });
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/register", () => {
  it("creates an account and returns 201 with access token", async () => {
    const email = uniqueEmail();
    const res = await registerUser(email);
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.account.email).toBe(email);
    expect(res.body.data.account.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("creates account + workspace + membership atomically", async () => {
    const email = uniqueEmail();
    const res = await registerUser(email);
    expect(res.status).toBe(201);

    const accountId = res.body.data.account.id as string;
    const memberships = await db.workspaceMembership.findMany({ where: { accountId } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");
  });

  it("returns 409 if email is already registered", async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const res2 = await registerUser(email);
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("returns 400 for invalid email", async () => {
    const res = await app
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "Password1!", displayName: "X" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("returns 200 with access token on valid credentials", async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const res = await loginUser(email);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it("returns 401 for wrong password", async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const res = await loginUser(email, "wrongpassword");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 for unknown email", async () => {
    const res = await loginUser("nobody@example.com");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates the refresh token and returns new access token", async () => {
    const email = uniqueEmail();
    const regRes = await registerUser(email);
    const cookie = ((regRes.headers["set-cookie"] as unknown) as string[])[0]!;

    const refreshRes = await app.post("/api/v1/auth/refresh").set("Cookie", cookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    const newCookie = ((refreshRes.headers["set-cookie"] as unknown) as string[])[0]!;
    expect(newCookie).not.toBe(cookie);
  });

  it("detects refresh token reuse — revokes entire family", async () => {
    const email = uniqueEmail();
    const regRes = await registerUser(email);
    const originalCookie = ((regRes.headers["set-cookie"] as unknown) as string[])[0]!;

    // First rotation succeeds
    const rotation1 = await app.post("/api/v1/auth/refresh").set("Cookie", originalCookie);
    expect(rotation1.status).toBe(200);

    // Presenting the original (already rotated) token again triggers reuse detection
    const rotation2 = await app.post("/api/v1/auth/refresh").set("Cookie", originalCookie);
    expect(rotation2.status).toBe(401);
    expect(rotation2.body.error.code).toBe("REFRESH_TOKEN_REUSE");
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears the cookie and returns 204", async () => {
    const email = uniqueEmail();
    const regRes = await registerUser(email);
    const cookie = ((regRes.headers["set-cookie"] as unknown) as string[])[0]!;

    const logoutRes = await app.post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(logoutRes.status).toBe(204);

    // Subsequent refresh should fail
    const refreshRes = await app.post("/api/v1/auth/refresh").set("Cookie", cookie);
    expect(refreshRes.status).toBe(401);
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns auth context for a valid JWT", async () => {
    const email = uniqueEmail();
    const regRes = await registerUser(email);
    const accessToken = regRes.body.data.accessToken as string;

    const meRes = await app
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.auth.type).toBe("account");
  });

  it("returns 401 without auth", async () => {
    const res = await app.get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });
});

// ─── Workspace tests ──────────────────────────────────────────────────────────

describe("Workspace routes", () => {
  it("GET /api/v1/workspaces returns the registered user's workspace", async () => {
    const email = uniqueEmail();
    const regRes = await registerUser(email);
    const accessToken = regRes.body.data.accessToken as string;

    const res = await app
      .get("/api/v1/workspaces")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workspaces).toHaveLength(1);
  });

  it("GET /api/v1/workspaces returns 401 without auth", async () => {
    const res = await app.get("/api/v1/workspaces");
    expect(res.status).toBe(401);
  });
});

// ─── Workspace membership tests ───────────────────────────────────────────────

describe("Workspace membership routes", () => {
  it("addMember → listMembers shows new member", async () => {
    // Register two users
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();

    const ownerReg = await registerUser(ownerEmail);
    const ownerToken = ownerReg.body.data.accessToken as string;

    const memberReg = await registerUser(memberEmail);
    expect(memberReg.status).toBe(201);
    const memberId = memberReg.body.data.account.id as string;

    // Get owner's workspace
    const wsRes = await app
      .get("/api/v1/workspaces")
      .set("Authorization", `Bearer ${ownerToken}`);
    const wsId = wsRes.body.data.workspaces[0].id as string;

    // Add member
    const addRes = await app
      .post(`/api/v1/workspaces/${wsId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ accountId: memberId, role: "member" });
    expect(addRes.status).toBe(201);

    // List members — should have owner + new member
    const listRes = await app
      .get(`/api/v1/workspaces/${wsId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    const memberIds = (listRes.body.data.members as Array<{ accountId: string }>).map(
      (m) => m.accountId,
    );
    expect(memberIds).toContain(memberId);
  });

  it("removeMember removes the member", async () => {
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();

    const ownerReg = await registerUser(ownerEmail);
    const ownerToken = ownerReg.body.data.accessToken as string;

    const memberReg = await registerUser(memberEmail);
    expect(memberReg.status).toBe(201);
    const memberId = memberReg.body.data.account.id as string;

    const wsRes = await app
      .get("/api/v1/workspaces")
      .set("Authorization", `Bearer ${ownerToken}`);
    const wsId = wsRes.body.data.workspaces[0].id as string;

    // Add then remove
    await app
      .post(`/api/v1/workspaces/${wsId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ accountId: memberId, role: "member" });

    const removeRes = await app
      .delete(`/api/v1/workspaces/${wsId}/members/${memberId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(removeRes.status).toBe(204);

    // Member should no longer be listed
    const listRes = await app
      .get(`/api/v1/workspaces/${wsId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const memberIds = (listRes.body.data.members as Array<{ accountId: string }>).map(
      (m) => m.accountId,
    );
    expect(memberIds).not.toContain(memberId);
  });

  it("last-owner guard: removing the only owner returns 400", async () => {
    const ownerEmail = uniqueEmail();
    const ownerReg = await registerUser(ownerEmail);
    const ownerToken = ownerReg.body.data.accessToken as string;
    const ownerId = ownerReg.body.data.account.id as string;

    const wsRes = await app
      .get("/api/v1/workspaces")
      .set("Authorization", `Bearer ${ownerToken}`);
    const wsId = wsRes.body.data.workspaces[0].id as string;

    // Attempt to remove the only owner — must fail
    const removeRes = await app
      .delete(`/api/v1/workspaces/${wsId}/members/${ownerId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(removeRes.status).toBe(400);
  });
});

// ─── API key tests ────────────────────────────────────────────────────────────

describe("API key routes", () => {
  it("creates a key, uses it, then revocation causes 401", async () => {
    const email = uniqueEmail();
    const regRes = await registerUser(email);
    const accessToken = regRes.body.data.accessToken as string;

    // Get workspace ID
    const wsRes = await app
      .get("/api/v1/workspaces")
      .set("Authorization", `Bearer ${accessToken}`);
    const wsId = wsRes.body.data.workspaces[0].id as string;

    // Create key
    const createRes = await app
      .post(`/api/v1/workspaces/${wsId}/api-keys`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Test Key", scopes: ["schedules:read"] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.key).toMatch(/^chx_live_/);
    const rawKey = createRes.body.data.key as string;
    const keyId = createRes.body.data.apiKey.id as string;

    // Use the key
    const meRes = await app
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${rawKey}`);
    expect(meRes.status).toBe(200);

    // Revoke
    const revokeRes = await app
      .delete(`/api/v1/workspaces/${wsId}/api-keys/${keyId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(revokeRes.status).toBe(204);

    // After revocation, key no longer authenticates
    const meRes2 = await app
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${rawKey}`);
    expect(meRes2.status).toBe(401);
  });
});
