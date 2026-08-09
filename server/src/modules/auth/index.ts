import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { Config } from "../../common/config/index.js";
import type { Redis } from "ioredis";
import { success } from "../../common/http/envelope.js";
import { buildRequestContext, requireDashboardAuth } from "../../common/auth.guards.js";
import { ValidationError } from "../../common/errors/http-errors.js";
import { SessionExpiredError } from "../../common/auth.errors.js";
import { authLoginRateLimit, authRegisterRateLimit, authRefreshRateLimit } from "../../common/http/middleware/rate-limit.js";
import * as authService from "./auth.service.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).trim(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const REFRESH_COOKIE = "chronix_rt";
function cookieOptions(config: Config) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: config.NODE_ENV === "production",
    path: "/api/v1/auth",
  };
}

// ─── Router factory ───────────────────────────────────────────────────────────

export function createAuthRouter(db: PrismaClient, config: Config, redis: Redis): Router {
  const router = Router();

  // POST /api/v1/auth/register
  router.post(
    "/register",
    authRegisterRateLimit(redis),
    async (req, res, next) => {
      try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError(parsed.error.issues);

        const ctx = buildRequestContext(req, res);
        const result = await authService.register(db, config, ctx, parsed.data);

        res
          .cookie(REFRESH_COOKIE, result.tokenPair.refreshToken, {
            ...cookieOptions(config),
            expires: result.tokenPair.refreshExpiresAt,
          })
          .status(201)
          .json(success(res, {
            accessToken: result.tokenPair.accessToken,
            account: result.account,
          }));
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/auth/login
  router.post(
    "/login",
    authLoginRateLimit(redis),
    async (req, res, next) => {
      try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError(parsed.error.issues);

        const ctx = buildRequestContext(req, res);
        const result = await authService.login(db, config, ctx, parsed.data);

        res
          .cookie(REFRESH_COOKIE, result.tokenPair.refreshToken, {
            ...cookieOptions(config),
            expires: result.tokenPair.refreshExpiresAt,
          })
          .status(200)
          .json(success(res, {
            accessToken: result.tokenPair.accessToken,
            account: result.account,
          }));
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/auth/refresh
  router.post(
    "/refresh",
    authRefreshRateLimit(redis),
    async (req, res, next) => {
      try {
        const rawToken: unknown = (req.cookies as Record<string, unknown>)[REFRESH_COOKIE];
        if (typeof rawToken !== "string" || rawToken.length === 0) {
          throw new SessionExpiredError();
        }

        const ctx = buildRequestContext(req, res);
        const result = await authService.refreshTokens(db, config, ctx, rawToken);

        res
          .cookie(REFRESH_COOKIE, result.tokenPair.refreshToken, {
            ...cookieOptions(config),
            expires: result.tokenPair.refreshExpiresAt,
          })
          .status(200)
          .json(success(res, { accessToken: result.tokenPair.accessToken }));
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/auth/logout
  router.post("/logout", async (req, res, next) => {
    try {
      const rawToken: unknown = (req.cookies as Record<string, unknown>)[REFRESH_COOKIE];
      const ctx = buildRequestContext(req, res);
      if (typeof rawToken === "string" && rawToken.length > 0) {
        await authService.logout(db, ctx, rawToken);
      }
      res.clearCookie(REFRESH_COOKIE, cookieOptions(config)).status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/auth/me
  router.get("/me", async (req, res, next) => {
    try {
      const ctx = buildRequestContext(req, res);
      const auth = requireDashboardAuth(ctx);
      const account = await authService.getAccount(db, auth.accountId);
      res.status(200).json(success(res, { account }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/workspace", async (req, res, next) => {
    try {
      const parsed = z.object({ workspaceId: z.string().uuid() }).safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues);
      const ctx = buildRequestContext(req, res);
      const accessToken = await authService.switchWorkspace(db, config, ctx, parsed.data.workspaceId);
      res.status(200).json(success(res, { accessToken }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
