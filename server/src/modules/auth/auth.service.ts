import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Config } from "../../common/config/index.js";
import type {
  RegisterInput,
  LoginInput,
  AuthResult,
  TokenPair,
  RequestContext,
  AuthenticatedAccount,
} from "../../common/auth.types.js";
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
import { NotFoundError } from "../../common/errors/http-errors.js";

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function refreshExpiresAt(): Date {
  const date = new Date();
  date.setDate(date.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return date;
}

function omitPasswordHash(account: AuthenticatedAccount & { passwordHash?: string }): AuthenticatedAccount {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

async function issueTokenPair(
  db: PrismaClient | Prisma.TransactionClient,
  config: Config,
  accountId: string,
  workspaceId: string,
  familyId = newUUIDv7(),
): Promise<TokenPair> {
  const rawToken = randomBase64Url(REFRESH_TOKEN_BYTES);
  const expiresAt = refreshExpiresAt();
  await insertRefreshToken(db, {
    accountId,
    workspaceId,
    tokenHash: sha256Hex(rawToken),
    familyId,
    expiresAt,
  });

  return {
    accessToken: await signAccessToken({ sub: accountId, wid: workspaceId, sid: familyId }, config.JWT_PRIVATE_KEY),
    refreshToken: rawToken,
    refreshExpiresAt: expiresAt,
  };
}

async function findPrimaryWorkspace(db: PrismaClient | Prisma.TransactionClient, accountId: string): Promise<string | null> {
  const membership = await db.workspaceMembership.findFirst({
    where: { accountId, workspace: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

export async function getAccount(db: PrismaClient, accountId: string): Promise<AuthenticatedAccount> {
  const account = await findAccountById(db, accountId);
  if (account === null || !account.isActive) throw new SessionExpiredError();
  return omitPasswordHash(account);
}

export async function register(
  db: PrismaClient,
  config: Config,
  ctx: RequestContext,
  input: RegisterInput,
): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();
  const passwordHash = await hashPassword(input.password);

  try {
    const result = await db.$transaction(async (trx) => {
      const account = await trx.account.create({
        data: { email, passwordHash, displayName: input.displayName.trim() },
      });
      const slug = `${input.displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}-${account.id.slice(-8)}`;
      const workspace = await trx.workspace.create({
        data: { name: `${input.displayName.trim()}'s Workspace`, slug },
      });
      await trx.workspaceMembership.create({
        data: { workspaceId: workspace.id, accountId: account.id, role: "owner" },
      });
      const tokenPair = await issueTokenPair(trx, config, account.id, workspace.id);
      return { account, workspaceId: workspace.id, tokenPair };
    });

    await writeAuditEvent(db, ctx, result.workspaceId, "account.registered", { accountId: result.account.id });
    return { account: omitPasswordHash(result.account), tokenPair: result.tokenPair };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new EmailAlreadyRegisteredError();
    }
    throw error;
  }
}

export async function login(
  db: PrismaClient,
  config: Config,
  ctx: RequestContext,
  input: LoginInput,
): Promise<AuthResult> {
  const account = await findAccountByEmail(db, input.email.toLowerCase().trim());
  if (account === null || !(await verifyPassword(account.passwordHash, input.password))) {
    throw new InvalidCredentialsError();
  }
  if (!account.isActive) throw new InactiveAccountError();

  const workspaceId = await findPrimaryWorkspace(db, account.id);
  if (workspaceId === null) throw new SessionExpiredError();
  await writeAuditEvent(db, ctx, workspaceId, "account.login", { accountId: account.id });
  const tokenPair = await issueTokenPair(db, config, account.id, workspaceId);
  return { account: omitPasswordHash(account), tokenPair };
}

interface LockedRefreshToken {
  id: string;
  accountId: string;
  workspaceId: string | null;
  familyId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

async function lockRefreshToken(
  trx: Prisma.TransactionClient,
  tokenHash: string,
): Promise<LockedRefreshToken | null> {
  const rows = await trx.$queryRaw<LockedRefreshToken[]>(Prisma.sql`
    SELECT id, account_id AS "accountId", workspace_id AS "workspaceId", family_id AS "familyId",
           revoked_at AS "revokedAt", expires_at AS "expiresAt"
    FROM refresh_tokens
    WHERE token_hash = ${tokenHash}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

export async function refreshTokens(
  db: PrismaClient,
  config: Config,
  ctx: RequestContext,
  rawToken: string,
): Promise<AuthResult> {
  const tokenHash = sha256Hex(rawToken);
  const outcome = await db.$transaction(async (trx) => {
    const stored = await lockRefreshToken(trx, tokenHash);
    if (stored === null) return { kind: "missing" as const };

    if (stored.revokedAt !== null) {
      await revokeRefreshTokenFamily(trx, stored.familyId);
      await trx.auditEvent.create({
        data: {
          actorType: "system",
          workspaceId: stored.workspaceId,
          eventType: "auth.refresh_token_reuse",
          metadata: { familyId: stored.familyId },
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
      return { kind: "reuse" as const };
    }

    if (stored.expiresAt <= new Date()) {
      await revokeRefreshToken(trx, stored.id);
      return { kind: "expired" as const };
    }

    const account = await trx.account.findUnique({ where: { id: stored.accountId } });
    if (account === null || !account.isActive) return { kind: "inactive" as const };
    const workspaceId = stored.workspaceId ?? await findPrimaryWorkspace(trx, account.id);
    if (workspaceId === null) return { kind: "missing_workspace" as const };

    await revokeRefreshToken(trx, stored.id);
    const tokenPair = await issueTokenPair(trx, config, account.id, workspaceId, stored.familyId);
    return { kind: "ok" as const, account, tokenPair, workspaceId };
  });

  if (outcome.kind === "reuse") throw new RefreshTokenReuseError();
  if (outcome.kind !== "ok") throw new SessionExpiredError();
  await writeAuditEvent(db, ctx, outcome.workspaceId, "account.refresh", { accountId: outcome.account.id });
  return { account: omitPasswordHash(outcome.account), tokenPair: outcome.tokenPair };
}

export async function logout(db: PrismaClient, ctx: RequestContext, rawToken: string): Promise<void> {
  const stored = await findRefreshTokenByHash(db, sha256Hex(rawToken));
  if (stored === null) return;
  await revokeRefreshTokenFamily(db, stored.familyId);
  if (stored.workspaceId !== null) {
    await writeAuditEvent(db, ctx, stored.workspaceId, "account.logout", { familyId: stored.familyId });
  }
}

export async function switchWorkspace(
  db: PrismaClient,
  config: Config,
  ctx: RequestContext,
  workspaceId: string,
): Promise<string> {
  if (ctx.auth?.type !== "account") throw new NotFoundError("Workspace not found.");
  const membership = await db.workspaceMembership.findFirst({
    where: { accountId: ctx.auth.accountId, workspaceId, workspace: { deletedAt: null } },
    select: { workspaceId: true },
  });
  if (membership === null) throw new NotFoundError("Workspace not found.");
  await db.refreshToken.updateMany({
    where: { familyId: ctx.auth.sessionId, revokedAt: null },
    data: { workspaceId },
  });
  await writeAuditEvent(db, ctx, workspaceId, "account.workspace_switched", { workspaceId });
  return signAccessToken({ sub: ctx.auth.accountId, wid: workspaceId, sid: ctx.auth.sessionId }, config.JWT_PRIVATE_KEY);
}
