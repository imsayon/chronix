import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Config } from "../../common/config/index.js";
import type { RequestContext, ApiKeyScope } from "../../common/auth.types.js";
import { requireWorkspaceRole, requireDashboardAuth, requireWorkspaceAccess } from "../../common/auth.guards.js";
import { hashApiKey, randomBase64Url } from "../../common/crypto.js";
import { writeAuditEvent } from "../../common/audit.js";
import { insertApiKey, findApiKeysByWorkspace, revokeApiKey } from "./api-keys.repository.js";
import type { ApiKey } from "./api-keys.repository.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_KEY_BYTES = 32;
const API_KEY_PREFIX_LIVE = "chx_live_";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRawApiKey(): { raw: string; prefix: string } {
  const random = randomBase64Url(API_KEY_BYTES);
  const raw = `${API_KEY_PREFIX_LIVE}${random}`;
  const prefix = raw.slice(0, API_KEY_PREFIX_LIVE.length + 8);
  return { raw, prefix };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: Date | undefined;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  rawKey: string; // returned ONCE — never stored in plaintext
}

export async function createApiKey(
  db: PrismaClient,
  config: Config,
  ctx: RequestContext,
  workspaceId: string,
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  // API keys can only be created via interactive (JWT) auth
  requireDashboardAuth(ctx);
  requireWorkspaceAccess(ctx, workspaceId);
  requireWorkspaceRole(ctx, "admin");

  const { raw, prefix } = generateRawApiKey();
  const keyHash = hashApiKey(raw, config.API_KEY_HMAC_SECRET);

  const apiKey = await insertApiKey(db, {
    workspaceId,
    name: input.name,
    keyHash,
    keyPrefix: prefix,
    scopes: input.scopes,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  });

  await writeAuditEvent(db, ctx, workspaceId, "api_key.created", { keyId: apiKey.id, name: input.name, scopes: input.scopes });

  return { apiKey, rawKey: raw };
}

export async function listApiKeys(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
): Promise<ApiKey[]> {
  requireWorkspaceAccess(ctx, workspaceId);
  requireWorkspaceRole(ctx, "admin");
  return findApiKeysByWorkspace(db, workspaceId);
}

export async function revokeKey(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
  keyId: string,
): Promise<void> {
  // API keys cannot revoke API keys
  requireDashboardAuth(ctx);
  requireWorkspaceAccess(ctx, workspaceId);
  requireWorkspaceRole(ctx, "admin");
  await revokeApiKey(db, keyId, workspaceId);
  await writeAuditEvent(db, ctx, workspaceId, "api_key.revoked", { keyId });
}
