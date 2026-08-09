import type { PrismaClient } from '../../generated/prisma/client.js'
import type { RequestContext } from '../../common/auth.types.js'
import { requireAuth } from '../../common/auth.guards.js'
import * as repo from './workers.repository.js'

export async function listWorkers(
	db: PrismaClient,
	ctx: RequestContext,
	_workspaceId: string // System-wide for now, but signature matches other services
) {
	requireAuth(ctx)
	// Consider a worker stale if no heartbeat in 2 minutes
	const staleThreshold = new Date(Date.now() - 2 * 60 * 1000)
	return repo.listActiveWorkers(db, staleThreshold)
}
