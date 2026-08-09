import type { PrismaClient } from "../../generated/prisma/client.js"
import type { WorkspaceRole } from "../../common/auth.types.js"
import { ConflictError } from "../../common/errors/http-errors.js"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
	id: string
	name: string
	slug: string
	deletedAt: Date | null
	createdAt: Date
	updatedAt: Date
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

export async function insertWorkspace(
	db: PrismaClient,
	data: InsertWorkspaceData,
): Promise<Workspace> {
	const row = await db.workspace.create({ data })
	return mapWorkspace(row)
}

export async function updateWorkspace(
	db: PrismaClient,
	id: string,
	data: Partial<{ name: string; slug: string }>,
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
		throw new ConflictError(
			"Account is already a member of this workspace.",
		)
	}
}

export async function removeMember(
	db: PrismaClient,
	workspaceId: string,
	accountId: string,
): Promise<void> {
	await db.workspaceMembership.delete({
		where: { workspaceId_accountId: { workspaceId, accountId } },
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
}): Workspace {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		deletedAt: row.deletedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
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
