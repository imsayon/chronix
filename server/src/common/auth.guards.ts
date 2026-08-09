import type { WorkspaceRole, ApiKeyScope, RequestContext } from "./auth.types.js";
import { roleAtLeast } from "./auth.types.js";
import { UnauthorizedError, ForbiddenError, NotFoundError } from "./errors/http-errors.js";
import type { Request, Response } from "express";

type Auth = NonNullable<RequestContext["auth"]>;
type AccountAuth = Extract<Auth, { type: "account" }>;

// ─── Require authenticated request ───────────────────────────────────────────

export function requireAuth(ctx: RequestContext): Auth {
  if (ctx.auth === null) throw new UnauthorizedError();
  return ctx.auth;
}

/** Enforce the route tenant boundary without disclosing another workspace. */
export function requireWorkspaceAccess(ctx: RequestContext, workspaceId: string): Auth {
  const auth = requireAuth(ctx);
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  return auth;
}

// ─── Require minimum workspace role ──────────────────────────────────────────

export function requireWorkspaceRole(ctx: RequestContext, minimum: WorkspaceRole): void {
  const auth = requireAuth(ctx);
  if (!roleAtLeast(auth.role, minimum)) {
    throw new ForbiddenError(`Requires at least '${minimum}' role in this workspace.`);
  }
}

// ─── Require specific API key scope ──────────────────────────────────────────

export function requireScope(ctx: RequestContext, scope: ApiKeyScope): void {
  const auth = requireAuth(ctx);
  if (auth.type === "api_key" && !auth.scopes.includes(scope) && !auth.scopes.includes("admin")) {
    throw new ForbiddenError(`API key does not have the '${scope}' scope.`);
  }
}

// ─── Require dashboard (JWT, not API key) auth ───────────────────────────────
// Some operations (creating/revoking API keys) must not be callable with an API key.

export function requireDashboardAuth(ctx: RequestContext): AccountAuth {
  const auth = requireAuth(ctx);
  if (auth.type !== "account") {
    throw new ForbiddenError(
      "This action requires interactive authentication. API keys cannot perform this operation.",
    );
  }
  return auth as AccountAuth;
}

// ─── Build RequestContext from Express locals ─────────────────────────────────

export function buildRequestContext(req: Request, res: Response): RequestContext {
  return {
    auth: (res.locals["auth"] as RequestContext["auth"]) ?? null,
    requestId: (res.locals["requestId"] as string) ?? "unknown",
    ip: req.ip ?? "unknown",
    userAgent: req.headers["user-agent"] ?? "unknown",
  };
}
