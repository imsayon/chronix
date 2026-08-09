import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Config } from "../../common/config/index.js";
import type { RegisterInput, LoginInput, AuthResult, TokenPair, RequestContext } from "../../common/auth.types.js";
import {
  InvalidCredentialsError,
  EmailAlreadyRegisteredError,
  SessionExpiredError,
  RefreshTokenReuseError,
  InactiveAccountError,
} from "../../common/auth.errors.js";
import { hashPassword, verifyPassword, randomBase64Url, sha256Hex } from "../../common/crypto.js";
import { signAccessToken } from "../../common/jwt.js";
import { writeAuditEvent } from "../../common/audit.js";
import {
  findAccountByEmail,
  findAccountById,
  insertRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
} from "./auth.repository.js";
import { newUUIDv7 } from "../../common/ids.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function refreshExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return d;
}

async function issueTokenPair(
  db: PrismaClient,
  config: Config,
  accountId: string,
  workspaceId: string,
  familyId?: string,
): Promise<TokenPair> {
  const rawToken = randomBase64Url(REFRESH_TOKEN_BYTES);
  const tokenHash = sha256Hex(rawToken);
  const sessionId = familyId ?? newUUIDv7();
  const expiresAt = refreshExpiresAt();

  await insertRefreshToken(db, { accountId, tokenHash, familyId: sessionId, expiresAt });

  const accessToken = await signAccessToken(
    { sub: accountId, wid: workspaceId, sid: sessionId },
    config.JWT_PRIVATE_KEY,
  );

  return { accessToken, refreshToken: rawToken, refreshExpiresAt: expiresAt };
}

function omitPasswordHash(account: { id: string; email: string; passwordHash: string; displayName: string; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(
  db: PrismaClient,
  config: Config,
  ctx: RequestContext,
  input: RegisterInput,
): Promise<AuthResult> {
  // Check uniqueness before hashing (cheap fast path)
  const existing = await findAccountByEmail(db, input.email.toLowerCase().trim());
  if (existing !== null) throw new EmailAlreadyRegisteredError();

  const passwordHash = await hashPassword(input.password);

  // Transactional: account + workspace + membership + audit
  const { account, workspaceId } = await db.$transaction(async (trx) => {
    const acc = await trx.account.create({
      data: {
        email: input.email.toLowerCase().trim(),
        passwordHash,
        displayName: input.displayName.trim(),
      },
    });

    // Derive workspace slug from display name
    const slug = input.displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      + "-" + acc.id.slice(-8);

    const workspace = await trx.workspace.create({
      data: { name: `${input.displayName.trim()}'s Workspace`, slug },
    });

    await trx.workspaceMembership.create({
      data: { workspaceId: workspace.id, accountId: acc.id, role: "owner" },
    });

    return { account: acc, workspaceId: workspace.id };
  });

  // Audit outside the transaction (fail-safe)
  await writeAuditEvent(db, ctx, workspaceId, "account.registered", { accountId: account.id });

  const tokenPair = await issueTokenPair(db, config, account.id, workspaceId);

  return {
    account: omitPasswordHash(account),
    tokenPair,
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(
  db: PrismaClient,
  config: Config,
  ctx: RequestContext,
  input: LoginInput,
): Promise<AuthResult> {
  const account = await findAccountByEmail(db, input.email.toLowerCase().trim());
  if (account === null) throw new InvalidCredentialsError();
  if (!account.isActive) throw new InactiveAccountError();

  const valid = await verifyPassword(account.passwordHash, input.password);
  if (!valid) throw new InvalidCredentialsError();

  // Find the account's primary workspace (first owned workspace)
  const membership = await db.workspaceMembership.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });

  const workspaceId = membership?.workspaceId ?? newUUIDv7(); // fallback shouldn't happen post-register

  await writeAuditEvent(db, ctx, workspaceId, "account.login", { accountId: account.id });

  const tokenPair = await issueTokenPair(db, config, account.id, workspaceId);

  return {
    account: omitPasswordHash(account),
    tokenPair,
  };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshTokens(
  db: PrismaClient,
  config: Config,
  rawToken: string,
): Promise<AuthResult> {
  const tokenHash = sha256Hex(rawToken);
  const stored = await findRefreshTokenByHash(db, tokenHash);

  if (stored === null) throw new SessionExpiredError();

  // Reuse detection — token was already revoked: nuke the entire family
  if (stored.revokedAt !== null) {
    await revokeRefreshTokenFamily(db, stored.familyId);
    throw new RefreshTokenReuseError();
  }

  if (stored.expiresAt < new Date()) {
    await revokeRefreshToken(db, stored.id);
    throw new SessionExpiredError();
  }

  // Revoke the presented token before issuing a new one (rotation)
  await revokeRefreshToken(db, stored.id);

  const account = await findAccountById(db, stored.accountId);
  if (account === null) throw new SessionExpiredError();
  if (!account.isActive) throw new InactiveAccountError();

  // Find primary workspace
  const membership = await db.workspaceMembership.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  const workspaceId = membership?.workspaceId ?? newUUIDv7();

  // Issue new token pair in the same family (session continues)
  const tokenPair = await issueTokenPair(db, config, account.id, workspaceId, stored.familyId);

  return {
    account: omitPasswordHash(account),
    tokenPair,
  };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(db: PrismaClient, rawToken: string): Promise<void> {
  const tokenHash = sha256Hex(rawToken);
  const stored = await findRefreshTokenByHash(db, tokenHash);
  if (stored === null || stored.revokedAt !== null) return; // already gone — idempotent
  await revokeRefreshToken(db, stored.id);
}
