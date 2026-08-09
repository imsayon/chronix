import type { PrismaClient } from "../generated/prisma/client.js"
import type { RequestContext } from "../common/auth.types.js"
import { logger } from "../infra/telemetry.js"

/**
 * Writes an audit event row within the current Prisma client (or transaction).
 * workspaceId is passed explicitly so callers in workspace-scoped routes can
 * audit events even when auth.workspaceId may be absent (e.g. system ops).
 */
export async function writeAuditEvent(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	eventType: string,
	metadata?: Record<string, unknown>,
): Promise<void> {
	try {
		const actorType =
			ctx.auth === null
				? "system"
				: ctx.auth.type === "account"
					? "account"
					: "api_key"
		const actorId =
			ctx.auth === null
				? undefined
				: ctx.auth.type === "account"
					? ctx.auth.accountId
					: ctx.auth.keyId

		await db.auditEvent.create({
			data: {
				actorType,
				...(actorId !== undefined ? { actorId } : {}),
				workspaceId,
				eventType,
				metadata: (metadata as object) ?? {},
				ipAddress: ctx.ip,
				userAgent: ctx.userAgent,
			},
		})
	} catch (err: unknown) {
		// Audit write failure must not fail the primary operation — log and continue.
		logger.error({ err, eventType }, "Failed to write audit event.")
	}
}
