// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  accountId: string;
  workspaceId: string | null;
  tokenHash: string;
  familyId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Input / Output types ─────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string; // raw (not hashed) — returned to caller; also set as cookie
  refreshExpiresAt: Date;
}

export interface AuthResult {
  account: Omit<Account, "passwordHash">;
  tokenPair: TokenPair;
}

export interface RequestContext {
  auth: AuthContext | null;
  requestId: string;
  ip: string;
  userAgent: string;
}

export interface AuthenticatedAccount {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Auth context (populated by auth middleware) ──────────────────────────────

export type AuthContext =
  | {
      type: "account";
      accountId: string;
      workspaceId: string;
      role: WorkspaceRole;
      sessionId: string; // refresh token family UUID
    }
  | {
      type: "api_key";
      keyId: string;
      workspaceId: string;
      role: WorkspaceRole;
      scopes: ApiKeyScope[];
    };

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type ApiKeyScope =
  | "schedules:read"
  | "schedules:write"
  | "executions:read"
  | "executions:trigger"
  | "admin";

// Role ordering for ≥ checks
const ROLE_ORDER: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export function roleAtLeast(actual: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_ORDER[actual] >= ROLE_ORDER[minimum];
}
