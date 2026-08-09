import { Router } from "express"
import { z } from "zod"
import type { PrismaClient } from "../../generated/prisma/client.js"
import { success } from "../../common/http/envelope.js"
import { buildRequestContext } from "../../common/auth.guards.js"
import { ValidationError } from "../../common/errors/http-errors.js"
import type { WorkspaceRole } from "../../common/auth.types.js"
import * as workspacesService from "./workspaces.service.js"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function param(
	req: { params: Record<string, string | undefined> },
	key: string,
): string {
	return req.params[key] ?? ""
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const createWorkspaceSchema = z.object({
	name: z.string().min(1).max(100).trim(),
	slug: z
		.string()
		.min(1)
		.max(63)
		.regex(/^[a-z0-9-]+$/)
		.trim(),
})

const updateWorkspaceSchema = z.object({
	name: z.string().min(1).max(100).trim().optional(),
})

const addMemberSchema = z.object({
	accountId: z.string().uuid().optional(),
	email: z.string().email().optional(),
	role: z.enum(["owner", "admin", "member", "viewer"]),
}).refine((value) => value.accountId !== undefined || value.email !== undefined, "An accountId or email is required.")

const updateMemberRoleSchema = z.object({
	role: z.enum(["owner", "admin", "member", "viewer"]),
})

// ─── Router ───────────────────────────────────────────────────────────────────

export function createWorkspacesRouter(db: PrismaClient): Router {
	const router = Router()

	// GET /api/v1/workspaces
	router.get("/", async (req, res, next) => {
		try {
			const ctx = buildRequestContext(req, res)
			const workspaces = await workspacesService.listWorkspaces(db, ctx)
			res.json(success(res, { workspaces }))
		} catch (err) {
			next(err)
		}
	})

	// POST /api/v1/workspaces
	router.post("/", async (req, res, next) => {
		try {
			const parsed = createWorkspaceSchema.safeParse(req.body)
			if (!parsed.success) throw new ValidationError(parsed.error.issues)
			const ctx = buildRequestContext(req, res)
			const workspace = await workspacesService.createWorkspace(
				db,
				ctx,
				parsed.data,
			)
			res.status(201).json(success(res, { workspace }))
		} catch (err) {
			next(err)
		}
	})

	// GET /api/v1/workspaces/:workspaceId
	router.get("/:workspaceId", async (req, res, next) => {
		try {
			const ctx = buildRequestContext(req, res)
			const workspace = await workspacesService.getWorkspace(
				db,
				ctx,
				param(req, "workspaceId"),
			)
			res.json(success(res, { workspace }))
		} catch (err) {
			next(err)
		}
	})

	// PATCH /api/v1/workspaces/:workspaceId
	router.patch("/:workspaceId", async (req, res, next) => {
		try {
			const parsed = updateWorkspaceSchema.safeParse(req.body)
			if (!parsed.success) throw new ValidationError(parsed.error.issues)
			const ctx = buildRequestContext(req, res)
			// Build update object only with defined fields (exactOptionalPropertyTypes)
			const update: Partial<{ name: string }> = {}
			if (parsed.data.name !== undefined) update.name = parsed.data.name
			const workspace = await workspacesService.updateWorkspace(
				db,
				ctx,
				param(req, "workspaceId"),
				update,
			)
			res.json(success(res, { workspace }))
		} catch (err) {
			next(err)
		}
	})

	// DELETE /api/v1/workspaces/:workspaceId
	router.delete("/:workspaceId", async (req, res, next) => {
		try {
			const ctx = buildRequestContext(req, res)
			await workspacesService.deleteWorkspace(
				db,
				ctx,
				param(req, "workspaceId"),
			)
			res.status(204).send()
		} catch (err) {
			next(err)
		}
	})

	// GET /api/v1/workspaces/:workspaceId/members
	router.get("/:workspaceId/members", async (req, res, next) => {
		try {
			const ctx = buildRequestContext(req, res)
			const members = await workspacesService.listMembers(
				db,
				ctx,
				param(req, "workspaceId"),
			)
			res.json(success(res, { members }))
		} catch (err) {
			next(err)
		}
	})

	// POST /api/v1/workspaces/:workspaceId/members
	router.post("/:workspaceId/members", async (req, res, next) => {
		try {
			const parsed = addMemberSchema.safeParse(req.body)
			if (!parsed.success) throw new ValidationError(parsed.error.issues)
			const ctx = buildRequestContext(req, res)
			const membership = await workspacesService.addMember(
				db,
				ctx,
				param(req, "workspaceId"),
				{
					...(parsed.data.accountId !== undefined ? { accountId: parsed.data.accountId } : {}),
					...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
					role: parsed.data.role as WorkspaceRole,
				},
			)
			res.status(201).json(success(res, { membership }))
		} catch (err) {
			next(err)
		}
	})

	// PATCH /api/v1/workspaces/:workspaceId/members/:accountId
	router.patch("/:workspaceId/members/:accountId", async (req, res, next) => {
		try {
			const parsed = updateMemberRoleSchema.safeParse(req.body)
			if (!parsed.success) throw new ValidationError(parsed.error.issues)
			const ctx = buildRequestContext(req, res)
			const membership = await workspacesService.updateMemberRole(
				db,
				ctx,
				param(req, "workspaceId"),
				param(req, "accountId"),
				parsed.data.role as WorkspaceRole,
			)
			res.json(success(res, { membership }))
		} catch (err) {
			next(err)
		}
	})

	// DELETE /api/v1/workspaces/:workspaceId/members/:accountId
	router.delete(
		"/:workspaceId/members/:accountId",
		async (req, res, next) => {
			try {
				const ctx = buildRequestContext(req, res)
				await workspacesService.removeMember(
					db,
					ctx,
					param(req, "workspaceId"),
					param(req, "accountId"),
				)
				res.status(204).send()
			} catch (err) {
				next(err)
			}
		},
	)

	return router
}
