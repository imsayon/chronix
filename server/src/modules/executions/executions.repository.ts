import type { PrismaClient, Prisma, TriggerType, ExecutionStatus } from '../../generated/prisma/client.js'
import type { Execution, ListExecutionsQuery } from './executions.types.js'
import { encodeCursor, decodeCursor } from '../../common/pagination.js'

type DbClient = PrismaClient | Prisma.TransactionClient

export async function insertExecution(
	db: DbClient,
	data: {
		workspaceId: string
		scheduleId: string
		jobId: string
		triggerType: string
		triggeredBy?: string | null
		nominalRunAt: Date
		idempotencyKey: string
		status?: string
		maxRetries: number
		retryBackoffBaseMs: number
	}
): Promise<Execution> {
	const result = await db.execution.create({
		data: {
			workspaceId: data.workspaceId,
			scheduleId: data.scheduleId,
			jobId: data.jobId,
			triggerType: data.triggerType as TriggerType,
			triggeredBy: data.triggeredBy ?? null,
			nominalRunAt: data.nominalRunAt,
			idempotencyKey: data.idempotencyKey,
			status: (data.status ?? 'pending') as ExecutionStatus,
			maxRetries: data.maxRetries,
			retryBackoffBaseMs: data.retryBackoffBaseMs,
		},
	})
	return result as unknown as Execution
}

export async function findExecutionsByWorkspace(
	db: PrismaClient,
	workspaceId: string,
	query: ListExecutionsQuery
): Promise<{ executions: Execution[]; nextCursor: string | null; hasMore: boolean }> {
	const limit = query.limit ?? 20

	const where: Prisma.ExecutionWhereInput = {
		workspaceId,
	}
	if (query.scheduleId) where.scheduleId = query.scheduleId
	if (query.jobId) where.jobId = query.jobId
	if (query.status) where.status = query.status as ExecutionStatus
	if (query.triggerType) where.triggerType = query.triggerType as TriggerType

	const cursorObj = query.cursor ? { id: decodeCursor(query.cursor) } : undefined

	const results = await db.execution.findMany({
		where,
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		take: limit + 1,
		...(cursorObj !== undefined ? { cursor: cursorObj, skip: 1 } : {}),
	})

	const hasMore = results.length > limit
	const items = hasMore ? results.slice(0, limit) : results
	const lastItem = items.at(-1)
	const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.id) : null

	const executions: Execution[] = items.map((item) => ({
		...item,
		triggerType: item.triggerType as Execution['triggerType'],
		status: item.status as Execution['status'],
	} satisfies Execution))

	return { executions, nextCursor, hasMore }
}

export async function findExecutionsBySchedule(
	db: PrismaClient,
	scheduleId: string,
	workspaceId: string,
	query: ListExecutionsQuery
): Promise<{ executions: Execution[]; nextCursor: string | null; hasMore: boolean }> {
	return findExecutionsByWorkspace(db, workspaceId, { ...query, scheduleId })
}

export async function findExecutionById(
	db: PrismaClient,
	id: string,
	workspaceId: string
): Promise<Execution | null> {
	const result = await db.execution.findFirst({
		where: { id, workspaceId },
	})

	if (!result) return null

	return {
		...result,
		triggerType: result.triggerType as Execution['triggerType'],
		status: result.status as Execution['status'],
	}
}

export async function findExecutionByIdempotencyKey(
	db: DbClient,
	workspaceId: string,
	idempotencyKey: string
): Promise<Execution | null> {
	const result = await db.execution.findFirst({ where: { workspaceId, idempotencyKey } })
	if (!result) return null
	return {
		...result,
		triggerType: result.triggerType as Execution['triggerType'],
		status: result.status as Execution['status'],
	}
}

export async function claimExecution(
	db: DbClient,
	executionId: string,
	workerId: string,
	leaseMs: number
): Promise<Execution | null> {
	const leaseExpiresAt = new Date(Date.now() + leaseMs)
	const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
		UPDATE executions
		SET status = 'claimed',
		    lease_holder_id = ${workerId},
		    lease_expires_at = ${leaseExpiresAt},
		    lease_generation = lease_generation + 1,
		    version = version + 1
		WHERE id = ${executionId}::uuid
		  AND status = 'pending'
		RETURNING *
	`
	if (!rows[0]) return null
	const r = rows[0]
	return {
		id: r['id'] as string,
		workspaceId: r['workspace_id'] as string,
		scheduleId: r['schedule_id'] as string,
		jobId: r['job_id'] as string,
		triggerType: r['trigger_type'] as Execution['triggerType'],
		triggeredBy: r['triggered_by'] as string | null,
		nominalRunAt: r['nominal_run_at'] as Date,
		idempotencyKey: r['idempotency_key'] as string,
		status: r['status'] as Execution['status'],
		attemptCount: r['attempt_count'] as number,
		maxRetries: r['max_retries'] as number,
		retryBackoffBaseMs: r['retry_backoff_base_ms'] as number,
		nextRetryAt: r['next_retry_at'] as Date | null,
		leaseHolderId: r['lease_holder_id'] as string | null,
		leaseExpiresAt: r['lease_expires_at'] as Date | null,
		leaseGeneration: r['lease_generation'] as number,
		terminalAt: r['terminal_at'] as Date | null,
		version: r['version'] as number,
		createdAt: r['created_at'] as Date,
		updatedAt: r['updated_at'] as Date,
	}
}

export async function recordOutcome(
	db: DbClient,
	executionId: string,
	leaseGeneration: number,
	status: 'succeeded' | 'failed'
): Promise<boolean> {
	const rows = await db.$queryRaw<Array<{ id: string }>>`
		UPDATE executions
		SET status = ${status}::"ExecutionStatus",
		    terminal_at = NOW(),
		    attempt_count = attempt_count + 1,
		    version = version + 1
		WHERE id = ${executionId}::uuid
		  AND lease_generation = ${leaseGeneration}
		RETURNING id
	`
	return rows.length > 0
}

export async function scheduleRetry(
	db: DbClient,
	executionId: string,
	leaseGeneration: number,
	nextRetryAt: Date
): Promise<boolean> {
	const rows = await db.$queryRaw<Array<{ id: string }>>`
		WITH updated AS (
			UPDATE executions
			SET status = 'pending',
			    next_retry_at = ${nextRetryAt},
			    attempt_count = attempt_count + 1,
			    lease_holder_id = NULL,
			    lease_expires_at = NULL,
			    lease_generation = lease_generation + 1,
			    version = version + 1
			WHERE id = ${executionId}::uuid
			  AND lease_generation = ${leaseGeneration}
			RETURNING id
		), reset_outbox AS (
			UPDATE execution_outbox
			SET published_at = NULL
			WHERE execution_id IN (SELECT id FROM updated)
		)
		SELECT id FROM updated
	`
	return rows.length > 0
}

export async function promoteToDlq(
	db: DbClient,
	executionId: string,
	leaseGeneration: number
): Promise<boolean> {
	const rows = await db.$queryRaw<Array<{ id: string }>>`
		UPDATE executions
		SET status = 'dead_lettered',
		    terminal_at = NOW(),
		    attempt_count = attempt_count + 1,
		    version = version + 1
		WHERE id = ${executionId}::uuid
		  AND lease_generation = ${leaseGeneration}
		RETURNING id
	`
	return rows.length > 0
}

export async function findStaleLeases(
	db: PrismaClient,
	opts: { now: Date; limit: number }
): Promise<Execution[]> {
	const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
		SELECT * FROM executions
		WHERE status IN ('claimed', 'running')
		  AND lease_expires_at < ${opts.now}
		LIMIT ${opts.limit}
	`
	return rows.map((r) => ({
		id: r['id'] as string,
		workspaceId: r['workspace_id'] as string,
		scheduleId: r['schedule_id'] as string,
		jobId: r['job_id'] as string,
		triggerType: r['trigger_type'] as Execution['triggerType'],
		triggeredBy: r['triggered_by'] as string | null,
		nominalRunAt: r['nominal_run_at'] as Date,
		idempotencyKey: r['idempotency_key'] as string,
		status: r['status'] as Execution['status'],
		attemptCount: r['attempt_count'] as number,
		maxRetries: r['max_retries'] as number,
		retryBackoffBaseMs: r['retry_backoff_base_ms'] as number,
		nextRetryAt: r['next_retry_at'] as Date | null,
		leaseHolderId: r['lease_holder_id'] as string | null,
		leaseExpiresAt: r['lease_expires_at'] as Date | null,
		leaseGeneration: r['lease_generation'] as number,
		terminalAt: r['terminal_at'] as Date | null,
		version: r['version'] as number,
		createdAt: r['created_at'] as Date,
		updatedAt: r['updated_at'] as Date,
	}))
}

export async function recoverStaleLease(
	db: DbClient,
	executionId: string
): Promise<boolean> {
	const rows = await db.$queryRaw<Array<{ id: string }>>`
		WITH updated AS (
			UPDATE executions
			SET status = 'pending',
			    lease_holder_id = NULL,
			    lease_expires_at = NULL,
			    next_retry_at = NULL,
			    lease_generation = lease_generation + 1,
			    version = version + 1
			WHERE id = ${executionId}::uuid
			  AND status IN ('claimed', 'running')
			RETURNING id
		), reset_outbox AS (
			UPDATE execution_outbox
			SET published_at = NULL
			WHERE execution_id IN (SELECT id FROM updated)
		)
		SELECT id FROM updated
	`
	return rows.length > 0
}

export async function insertAttempt(
	db: DbClient,
	data: {
		executionId: string
		workspaceId: string
		attemptNumber: number
		workerId: string
		startedAt: Date
		finishedAt: Date
		outcome: string
		httpStatusCode?: number | null
		durationMs: number
		responseBodySample?: string | null
		errorMessage?: string | null
		idempotencyKey: string
		requestHeadersSent: Record<string, string>
	}
): Promise<void> {
	await db.executionAttempt.create({
		data: {
			executionId: data.executionId,
			workspaceId: data.workspaceId,
			attemptNumber: data.attemptNumber,
			workerId: data.workerId,
			startedAt: data.startedAt,
			finishedAt: data.finishedAt,
			outcome: data.outcome as import('../../generated/prisma/client.js').AttemptOutcome,
			httpStatusCode: data.httpStatusCode ?? null,
			durationMs: data.durationMs,
			responseBodySample: data.responseBodySample ?? null,
			errorMessage: data.errorMessage ?? null,
			idempotencyKey: data.idempotencyKey,
			requestHeadersSent: data.requestHeadersSent,
		},
	})
}

export async function findAttemptsByExecution(
	db: PrismaClient,
	executionId: string,
	workspaceId: string
): Promise<import('./executions.types.js').ExecutionAttempt[]> {
	const rows = await db.executionAttempt.findMany({
		where: { executionId, workspaceId },
		orderBy: { attemptNumber: 'asc' },
	})
	return rows.map((row) => ({
		id: row.id,
		executionId: row.executionId,
		workspaceId: row.workspaceId,
		attemptNumber: row.attemptNumber,
		workerId: row.workerId,
		startedAt: row.startedAt,
		finishedAt: row.finishedAt,
		outcome: row.outcome,
		httpStatusCode: row.httpStatusCode,
		durationMs: row.durationMs,
		responseBodySample: row.responseBodySample,
		errorMessage: row.errorMessage,
		idempotencyKey: row.idempotencyKey,
		requestHeadersSent: (row.requestHeadersSent as Record<string, string>) ?? {},
		createdAt: row.createdAt,
	}))
}
