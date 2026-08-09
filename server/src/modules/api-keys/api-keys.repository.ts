import type { PrismaClient, ApiKeyScope as PrismaApiKeyScope } from "../../generated/prisma/client.js";
import type { ApiKeyScope } from "../../common/auth.types.js";
// Types
// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertApiKeyData {
  workspaceId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  expiresAt?: Date;
}

// ─── Scope mapping ────────────────────────────────────────────────────────────

// Prisma enum uses underscores; domain type uses colons.
function toPrismaScope(s: ApiKeyScope): PrismaApiKeyScope {
  return s.replace(":", "_") as PrismaApiKeyScope;
}

function toDomainScope(s: PrismaApiKeyScope): ApiKeyScope {
  return s.replace("_", ":") as ApiKeyScope;
}

// ─── Repository ───────────────────────────────────────────────────────────────

export async function insertApiKey(
  db: PrismaClient,
  data: InsertApiKeyData,
): Promise<ApiKey> {
  const row = await db.apiKey.create({
    data: {
      workspaceId: data.workspaceId,
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      scopes: data.scopes.map(toPrismaScope),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
    },
  });
  return mapApiKey(row);
}

export async function findApiKeysByWorkspace(
  db: PrismaClient,
  workspaceId: string,
): Promise<ApiKey[]> {
  const rows = await db.apiKey.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(mapApiKey);
}

export async function revokeApiKey(
  db: PrismaClient,
  id: string,
  workspaceId: string,
): Promise<boolean> {
  const result = await db.apiKey.updateMany({
    where: { id, workspaceId },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapApiKey(row: {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  scopes: PrismaApiKeyScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ApiKey {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes.map(toDomainScope),
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
