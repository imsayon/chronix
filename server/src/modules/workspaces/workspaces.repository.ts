import type { PrismaClient } from "../../generated/prisma/client.js"
import type { WorkspaceRole } from "../../common/auth.types.js"
import { MemberAlreadyExistsError, WorkspaceSlugTakenError } from "../../common/errors/http-errors.js"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
	id: string
	name: string
	slug: string
	deletedAt: Date | null
	createdAt: Date
	updatedAt: Date
	retentionDays: number
}

export interface WorkspaceMembership {
	id: string
	workspaceId: string
	accountId: string
	role: WorkspaceRole
	createdAt: Date
	updatedAt: Date
}

export interface InsertWorkspaceData {
	name: string
	slug: string
	retentionDays?: number
}

// ─── Workspace queries ────────────────────────────────────────────────────────

export async function findWorkspaceById(
	db: PrismaClient,
	id: string,
): Promise<Workspace | null> {
	const row = await db.workspace.findFirst({ where: { id, deletedAt: null } })
	return row ? mapWorkspace(row) : null
}

export async function findWorkspacesByMembership(
	db: PrismaClient,
	accountId: string,
): Promise<Workspace[]> {
	const memberships = await db.workspaceMembership.findMany({
		where: { accountId },
		include: { workspace: true },
		orderBy: { createdAt: "asc" },
	})
	return memberships
		.filter((m) => m.workspace.deletedAt === null)
		.map((m) => mapWorkspace(m.workspace))
}

export async function findWorkspaceListForApiKey(
  db: PrismaClient,
  workspaceId: string,
): Promise<Workspace[]> {
  const row = await db.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
  return row === null ? [] : [mapWorkspace(row)];
}

export async function insertWorkspace(
	db: PrismaClient,
	data: InsertWorkspaceData,
): Promise<Workspace> {
	try {
		const row = await db.workspace.create({ data })
		return mapWorkspace(row)
	} catch {
		throw new WorkspaceSlugTakenError()
	}
}

export async function updateWorkspace(
	db: PrismaClient,
	id: string,
	data: Partial<{ name: string; slug: string; retentionDays: number }>,
): Promise<Workspace> {
	const row = await db.workspace.update({ where: { id }, data })
	return mapWorkspace(row)
}

export async function softDeleteWorkspace(
	db: PrismaClient,
	id: string,
): Promise<void> {
	await db.workspace.update({
		where: { id },
		data: { deletedAt: new Date() },
	})
}

// ─── Membership queries ───────────────────────────────────────────────────────

export async function findMembership(
	db: PrismaClient,
	workspaceId: string,
	accountId: string,
): Promise<WorkspaceMembership | null> {
	const row = await db.workspaceMembership.findUnique({
		where: { workspaceId_accountId: { workspaceId, accountId } },
	})
	return row ? mapMembership(row) : null
}

export async function listMembers(
	db: PrismaClient,
	workspaceId: string,
): Promise<WorkspaceMembership[]> {
	const rows = await db.workspaceMembership.findMany({
		where: { workspaceId },
		orderBy: { createdAt: "asc" },
		take: 100,
	})
	return rows.map(mapMembership)
}

export async function addMember(
	db: PrismaClient,
	workspaceId: string,
	accountId: string,
	role: WorkspaceRole,
): Promise<WorkspaceMembership> {
	try {
		const row = await db.workspaceMembership.create({
			data: { workspaceId, accountId, role },
		})
		return mapMembership(row)
  } catch {
    throw new MemberAlreadyExistsError()
	}
}

export async function removeMember(
	db: PrismaClient,
	workspaceId: string,
	accountId: string,
): Promise<"removed" | "missing" | "last_owner"> {
	return db.$transaction(async (trx) => {
		const member = await trx.workspaceMembership.findUnique({
			where: { workspaceId_accountId: { workspaceId, accountId } },
			select: { role: true },
		})
		if (member === null) return "missing"
		if (member.role === "owner") {
			// Serialize concurrent owner removals by locking the complete owner set.
			const owners = await trx.$queryRaw<Array<{ id: string }>>`
				SELECT id FROM workspace_memberships
				WHERE workspace_id = ${workspaceId}::uuid AND role = 'owner'::"WorkspaceRole"
				FOR UPDATE
			`
			if (owners.length <= 1) return "last_owner"
		}
		await trx.workspaceMembership.delete({ where: { workspaceId_accountId: { workspaceId, accountId } } })
		return "removed"
	})
}

export async function updateMemberRole(
	db: PrismaClient,
	workspaceId: string,
	accountId: string,
	role: WorkspaceRole,
): Promise<WorkspaceMembership> {
	const row = await db.workspaceMembership.update({
		where: { workspaceId_accountId: { workspaceId, accountId } },
		data: { role },
	})
	return mapMembership(row)
}

export async function countOwners(
	db: PrismaClient,
	workspaceId: string,
): Promise<number> {
	return db.workspaceMembership.count({
		where: { workspaceId, role: "owner" },
	})
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapWorkspace(row: {
	id: string
	name: string
	slug: string
	deletedAt: Date | null
	createdAt: Date
	updatedAt: Date
	retentionDays: number
}): Workspace {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		deletedAt: row.deletedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		retentionDays: row.retentionDays,
	}
}

function mapMembership(row: {
	id: string
	workspaceId: string
	accountId: string
	role: string
	createdAt: Date
	updatedAt: Date
}): WorkspaceMembership {
	return {
		id: row.id,
		workspaceId: row.workspaceId,
		accountId: row.accountId,
		role: row.role as WorkspaceRole,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}
