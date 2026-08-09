import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Config } from "../../config/index.js";
import type { AuthContext, WorkspaceRole, ApiKeyScope } from "../../auth.types.js";
import { verifyAccessToken } from "../../jwt.js";
import { hashApiKey } from "../../crypto.js";
import { logger } from "../../../infra/telemetry.js";

const API_KEY_PREFIX = /^chx_(live|test)_/;

/**
 * Authentication middleware.
 *
 * - Extracts the Bearer token from the Authorization header.
 * - If it looks like a JWT (no chx_ prefix) → verify as ES256 access token.
 * - If it looks like an API key (chx_live_ / chx_test_ prefix) → hash with SHA-256, look up in DB.
 * - Populates res.locals.auth with AuthContext or null.
 * - Never returns 401 itself — that is the route/service responsibility.
 */
export function createAuthMiddleware(db: PrismaClient, config: Config) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;

    if (header === undefined || !header.startsWith("Bearer ")) {
      res.locals["auth"] = null;
      next();
      return;
    }

    const token = header.slice(7);

    try {
      if (API_KEY_PREFIX.test(token)) {
        res.locals["auth"] = await resolveApiKey(db, config, token);
      } else {
        res.locals["auth"] = await resolveJwt(db, config, token);
      }
    } catch (err: unknown) {
      logger.debug({ err }, "Auth middleware: token verification failed.");
      res.locals["auth"] = null;
    }

    next();
  };
}

// ─── JWT resolution ───────────────────────────────────────────────────────────

async function resolveJwt(
  db: PrismaClient,
  config: Config,
  token: string,
): Promise<AuthContext | null> {
  const payload = await verifyAccessToken(token, config.JWT_PUBLIC_KEY);

  // Look up the membership for the workspace in the token
  const membership = await db.workspaceMembership.findFirst({
    where: { accountId: payload.sub, workspaceId: payload.wid },
    select: { role: true },
  });

  if (membership === null) return null;

  return {
    type: "account",
    accountId: payload.sub,
    workspaceId: payload.wid,
    role: membership.role as WorkspaceRole,
    sessionId: payload.sid,
  };
}

// ─── API key resolution ───────────────────────────────────────────────────────

async function resolveApiKey(
  db: PrismaClient,
  config: Config,
  rawKey: string,
): Promise<AuthContext | null> {
  const keyHash = hashApiKey(rawKey, config.API_KEY_HMAC_SECRET);

  const apiKey = await db.apiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null,
    },
    select: { id: true, workspaceId: true, scopes: true, expiresAt: true },
  });

  if (apiKey === null) return null;
  if (apiKey.expiresAt !== null && apiKey.expiresAt < new Date()) return null;

  // Fetch the workspace to determine owner (API keys get admin role by default
  // unless scopes are narrower — actual scope check happens in service layer)
  const workspace = await db.workspace.findFirst({
    where: { id: apiKey.workspaceId, deletedAt: null },
    select: { id: true },
  });

  if (workspace === null) return null;

  // Update last_used_at asynchronously — never block the request
  void db.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch((err: unknown) => logger.error({ err }, "Failed to update api_key.last_used_at"));

  return {
    type: "api_key",
    keyId: apiKey.id,
    workspaceId: apiKey.workspaceId,
    role: "admin" as WorkspaceRole, // API key role ceiling — scopes narrow further in services
    scopes: apiKey.scopes as ApiKeyScope[],
  };
}
