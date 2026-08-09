import type { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import type { Account, RefreshToken } from "../../common/auth.types.js";

// ─── Account ──────────────────────────────────────────────────────────────────

export async function findAccountByEmail(
  db: PrismaClient,
  email: string,
): Promise<Account | null> {
  const row = await db.account.findUnique({ where: { email } });
  return row ? mapAccount(row) : null;
}

export async function findAccountById(
  db: PrismaClient,
  id: string,
): Promise<Account | null> {
  const row = await db.account.findUnique({ where: { id } });
  return row ? mapAccount(row) : null;
}

export async function insertAccount(
  db: PrismaClient,
  data: { email: string; passwordHash: string; displayName: string },
): Promise<Account> {
  const row = await db.account.create({ data });
  return mapAccount(row);
}

// ─── Refresh tokens ───────────────────────────────────────────────────────────

export interface InsertRefreshTokenData {
  accountId: string;
  workspaceId: string | null;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export async function insertRefreshToken(
  db: PrismaClient | Prisma.TransactionClient,
  data: InsertRefreshTokenData,
): Promise<void> {
  await db.refreshToken.create({ data });
}

export async function findRefreshTokenByHash(
  db: PrismaClient | Prisma.TransactionClient,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const row = await db.refreshToken.findUnique({ where: { tokenHash } });
  return row ? mapRefreshToken(row) : null;
}

export async function revokeRefreshToken(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
): Promise<void> {
  await db.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeRefreshTokenFamily(
  db: PrismaClient | Prisma.TransactionClient,
  familyId: string,
): Promise<void> {
  await db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapAccount(row: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Account {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRefreshToken(row: {
  id: string;
  accountId: string;
  workspaceId: string | null;
  tokenHash: string;
  familyId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): RefreshToken {
  return {
    id: row.id,
    accountId: row.accountId,
    workspaceId: row.workspaceId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
