import type { PrismaClient } from '../../generated/prisma/client.js'
import type { RequestContext } from '../../common/auth.types.js'
import { requireWorkspaceAccess, requireScope } from '../../common/auth.guards.js'
import { NotFoundError } from '../../common/errors/http-errors.js'
import * as repo from './executions.repository.js'
import type { ListExecutionsQuery } from './executions.types.js'

export async function listExecutions(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	query: ListExecutionsQuery
) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'executions:read')
	return repo.findExecutionsByWorkspace(db, workspaceId, query)
}

export async function listScheduleExecutions(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	scheduleId: string,
	query: ListExecutionsQuery
) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'executions:read')
	return repo.findExecutionsBySchedule(db, scheduleId, workspaceId, query)
}

export async function getExecution(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	executionId: string
) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'executions:read')
	const execution = await repo.findExecutionById(db, executionId, workspaceId)
	if (!execution) {
		throw new NotFoundError(`Execution ${executionId} not found`)
	}
	const attempts = await repo.findAttemptsByExecution(db, executionId, workspaceId)
	return { ...execution, attempts }
}

export async function exportExecutions(
	db: PrismaClient,
	ctx: RequestContext,
	workspaceId: string,
	limit: number,
) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'executions:read')
	return repo.findExecutionsByWorkspace(db, workspaceId, { limit: Math.min(limit, 10_000) })
}
