import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Config } from "../../common/config/index.js";
import type { ApiKeyScope } from "../../common/auth.types.js";
import { success } from "../../common/http/envelope.js";
import { buildRequestContext } from "../../common/auth.guards.js";
import { ValidationError } from "../../common/errors/http-errors.js";
import * as apiKeysService from "./api-keys.service.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const API_KEY_SCOPES = ["schedules:read", "schedules:write", "executions:read", "executions:trigger", "admin"] as const;

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).refine((scopes) => new Set(scopes).size === scopes.length, "Scopes must be unique."),
  expiresAt: z.string().datetime().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export function createApiKeysRouter(db: PrismaClient, config: Config): Router {
  // mergeParams required so :workspaceId from parent router is accessible
  const router = Router({ mergeParams: true });

  // GET /api/v1/workspaces/:workspaceId/api-keys
  router.get("/", async (req, res, next) => {
    try {
      const ctx = buildRequestContext(req, res);
      const workspaceId = (req.params as Record<string, string>)["workspaceId"] ?? "";
      const keys = await apiKeysService.listApiKeys(db, ctx, workspaceId);
      res.json(success(res, { apiKeys: keys }));
    } catch (err) { next(err); }
  });

  // POST /api/v1/workspaces/:workspaceId/api-keys
  router.post("/", async (req, res, next) => {
    try {
      const parsed = createApiKeySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues);
      const ctx = buildRequestContext(req, res);
      const workspaceId = (req.params as Record<string, string>)["workspaceId"] ?? "";
      const input: apiKeysService.CreateApiKeyInput = {
        name: parsed.data.name,
        scopes: parsed.data.scopes as ApiKeyScope[],
        ...(parsed.data.expiresAt !== undefined
          ? { expiresAt: new Date(parsed.data.expiresAt) }
          : {}),
      };
      const result = await apiKeysService.createApiKey(db, config, ctx, workspaceId, input);
      res.status(201).json(success(res, { apiKey: result.apiKey, key: result.rawKey }));
    } catch (err) { next(err); }
  });

  // DELETE /api/v1/workspaces/:workspaceId/api-keys/:keyId
  router.delete("/:keyId", async (req, res, next) => {
    try {
      const ctx = buildRequestContext(req, res);
      const params = req.params as Record<string, string>;
      const workspaceId = params["workspaceId"] ?? "";
      const keyId = params["keyId"] ?? "";
      await apiKeysService.revokeKey(db, ctx, workspaceId, keyId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
