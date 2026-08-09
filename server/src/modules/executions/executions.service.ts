import type { PrismaClient } from '../../generated/prisma/client.js'
import type { RequestContext } from '../../common/auth.types.js'
import { requireAuth } from '../../common/auth.guards.js'
import { NotFoundError } from '../../common/errors/http-errors.js'
import * as repo from './executions.repository.js'
import type { ListExecutionsQuery } from './executions.types.js'

export async function listExecutions(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	query: ListExecutionsQuery
) {
	requireAuth(ctx)
	return repo.findExecutionsByWorkspace(db, workspaceId, query)
}

export async function listScheduleExecutions(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	scheduleId: string,
	query: ListExecutionsQuery
) {
	requireAuth(ctx)
	return repo.findExecutionsBySchedule(db, scheduleId, workspaceId, query)
}

export async function getExecution(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	executionId: string
) {
	requireAuth(ctx)
	const execution = await repo.findExecutionById(db, executionId, workspaceId)
	if (!execution) {
		throw new NotFoundError(`Execution ${executionId} not found`)
	}
	const attempts = await repo.findAttemptsByExecution(db, executionId, workspaceId)
	return { ...execution, attempts }
}
