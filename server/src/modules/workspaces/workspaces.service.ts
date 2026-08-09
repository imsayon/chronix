import type { PrismaClient } from "../../generated/prisma/client.js";
import type { RequestContext, WorkspaceRole } from "../../common/auth.types.js";
import { requireAuth, requireWorkspaceRole, requireDashboardAuth } from "../../common/auth.guards.js";
import { NotFoundError, AccountNotFoundError, LastOwnerError } from "../../common/errors/http-errors.js";
import { writeAuditEvent } from "../../common/audit.js";
import * as repo from "./workspaces.repository.js";
import type { Workspace, WorkspaceMembership } from "./workspaces.repository.js";

// ─── Workspace CRUD ───────────────────────────────────────────────────────────

export async function createWorkspace(
  db: PrismaClient,
  ctx: RequestContext,
  input: { name: string; slug: string },
): Promise<Workspace> {
  const auth = requireDashboardAuth(ctx);
  const workspace = await repo.insertWorkspace(db, { name: input.name, slug: input.slug });
  await repo.addMember(db, workspace.id, auth.accountId, "owner");
  await writeAuditEvent(db, ctx, workspace.id, "workspace.created", { workspaceId: workspace.id });
  return workspace;
}

export async function listWorkspaces(
  db: PrismaClient,
  ctx: RequestContext,
): Promise<Workspace[]> {
  const auth = requireAuth(ctx);
  if (auth.type === "api_key") return repo.findWorkspaceListForApiKey(db, auth.workspaceId);
  return repo.findWorkspacesByMembership(db, auth.accountId);
}

export async function getWorkspace(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
): Promise<Workspace> {
  const auth = requireAuth(ctx);
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  const workspace = await repo.findWorkspaceById(db, workspaceId);
  if (workspace === null) throw new NotFoundError("Workspace not found.");
  return workspace;
}

export async function updateWorkspace(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
	input: Partial<{ name: string; slug: string; retentionDays: number }>,
): Promise<Workspace> {
  const auth = requireAuth(ctx);
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  requireWorkspaceRole(ctx, "admin");
  const workspace = await repo.findWorkspaceById(db, workspaceId);
  if (workspace === null) throw new NotFoundError("Workspace not found.");
  const updated = await repo.updateWorkspace(db, workspaceId, input);
  await writeAuditEvent(db, ctx, workspaceId, "workspace.updated", input as Record<string, unknown>);
  return updated;
}

export async function deleteWorkspace(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
): Promise<void> {
  const auth = requireAuth(ctx);
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  requireWorkspaceRole(ctx, "owner");
  await repo.softDeleteWorkspace(db, workspaceId);
  await writeAuditEvent(db, ctx, workspaceId, "workspace.deleted");
}

// ─── Membership management ────────────────────────────────────────────────────

export async function listMembers(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
): Promise<WorkspaceMembership[]> {
  const auth = requireAuth(ctx);
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  requireWorkspaceRole(ctx, "viewer");
  return repo.listMembers(db, workspaceId);
}

export async function addMember(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
	input: { accountId?: string; email?: string; role: WorkspaceRole },
): Promise<WorkspaceMembership> {
  const auth = requireAuth(ctx);
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  requireWorkspaceRole(ctx, "admin");
  if (input.role === "owner") requireWorkspaceRole(ctx, "owner");
	const account = input.accountId !== undefined
		? await db.account.findUnique({ where: { id: input.accountId }, select: { id: true, isActive: true } })
		: await db.account.findUnique({ where: { email: input.email?.toLowerCase().trim() ?? "" }, select: { id: true, isActive: true } });
	if (account === null || !account.isActive) throw new AccountNotFoundError();
	const membership = await repo.addMember(db, workspaceId, account.id, input.role);
	await writeAuditEvent(db, ctx, workspaceId, "workspace.member_added", { membershipId: membership.id, targetAccountId: membership.accountId, role: input.role });
  return membership;
}

export async function removeMember(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
  targetAccountId: string,
): Promise<void> {
  const auth = requireAuth(ctx);
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  requireWorkspaceRole(ctx, "admin");

	const target = await repo.findMembership(db, workspaceId, targetAccountId);
	if (target === null) throw new NotFoundError("Member not found.");
	if (target.role === "owner") requireWorkspaceRole(ctx, "owner");
	const result = await repo.removeMember(db, workspaceId, targetAccountId);
	if (result === "last_owner") throw new LastOwnerError();
	if (result === "missing") throw new NotFoundError("Member not found.");
	await writeAuditEvent(db, ctx, workspaceId, "workspace.member_removed", { membershipId: target.id, targetAccountId });
}

export async function updateMemberRole(
  db: PrismaClient,
  ctx: RequestContext,
  workspaceId: string,
  targetAccountId: string,
  role: WorkspaceRole,
): Promise<WorkspaceMembership> {
  const auth = requireAuth(ctx);
  requireWorkspaceRole(ctx, "admin");
  if (auth.workspaceId !== workspaceId) throw new NotFoundError("Workspace not found.");
  if (role === "owner") requireWorkspaceRole(ctx, "owner");

  const current = await repo.findMembership(db, workspaceId, targetAccountId);
  if (current === null) throw new NotFoundError("Member not found.");
  if (current.role === "owner" && role !== "owner" && (await repo.countOwners(db, workspaceId)) <= 1) {
    throw new LastOwnerError();
  }

  const membership = await repo.updateMemberRole(db, workspaceId, targetAccountId, role);
  await writeAuditEvent(db, ctx, workspaceId, "workspace.member_role_updated", { membershipId: membership.id, targetAccountId, role });
  return membership;
}
