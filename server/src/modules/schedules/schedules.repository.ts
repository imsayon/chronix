import type { PrismaClient, Prisma, ScheduleType, MisfirePolicy, ScheduleStatus } from '../../generated/prisma/client.js'
import type { Schedule, ScheduleClaimCandidate, ListSchedulesQuery } from './schedules.types.js'
import { encodeCursor, decodeCursor } from '../../common/pagination.js'
import { ScheduleNameTakenError } from './schedules.errors.js'

export async function findScheduleById(
	db: PrismaClient,
	id: string,
	workspaceId: string
): Promise<Schedule | null> {
	const result = await db.schedule.findFirst({
		where: { id, workspaceId, deletedAt: null },
	})
	return result as Schedule | null
}

export async function findSchedulesByWorkspace(
	db: PrismaClient,
	workspaceId: string,
	query: ListSchedulesQuery
): Promise<{ schedules: Schedule[]; nextCursor: string | null; hasMore: boolean }> {
	const limit = query.limit ?? 20
	const where: Prisma.ScheduleWhereInput = {
		workspaceId,
		deletedAt: null,
	}
	if (query.status) where.status = query.status as ScheduleStatus
	if (query.jobId) where.jobId = query.jobId

	const cursorObj = query.cursor ? { id: decodeCursor(query.cursor) } : undefined

	const results = await db.schedule.findMany({
		where,
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		take: limit + 1,
		...(cursorObj !== undefined ? { cursor: cursorObj, skip: 1 } : {}),
	})

	const hasMore = results.length > limit
	const items = hasMore ? results.slice(0, limit) : results
	const lastItem = items.at(-1)
	const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.id) : null

	return { schedules: items as unknown as Schedule[], nextCursor, hasMore }
}

export async function insertSchedule(
	db: PrismaClient,
	data: {
		workspaceId: string
		jobId: string
		name: string
		description?: string | null
		scheduleType: string
		cronExpression?: string | null
		timezone: string
		runAt?: Date | null
		nextRunAt?: Date | null
		misfirePolicy?: string
		maxRetries?: number
		retryBackoffBaseMs?: number
	}
): Promise<Schedule> {
	try {
		const result = await db.schedule.create({
			data: {
				workspaceId: data.workspaceId,
				jobId: data.jobId,
				name: data.name,
				description: data.description ?? null,
				scheduleType: data.scheduleType as ScheduleType,
				cronExpression: data.cronExpression ?? null,
				timezone: data.timezone,
				runAt: data.runAt ?? null,
				nextRunAt: data.nextRunAt ?? null,
				misfirePolicy: (data.misfirePolicy ?? 'coalesce') as MisfirePolicy,
				maxRetries: data.maxRetries ?? 3,
				retryBackoffBaseMs: data.retryBackoffBaseMs ?? 60000,
				status: 'active' as ScheduleStatus,
			},
		})
		return result as unknown as Schedule
	} catch (err: unknown) {
		if ((err as { code?: string }).code === 'P2002') {
			throw new ScheduleNameTakenError(data.name)
		}
		throw err
	}
}

export async function updateSchedule(
	db: PrismaClient,
	id: string,
	workspaceId: string,
	data: Partial<{
		name: string
		description: string | null
		cronExpression: string | null
		timezone: string
		runAt: Date | null
		nextRunAt: Date | null
		misfirePolicy: string
		maxRetries: number
		retryBackoffBaseMs: number
	}>
): Promise<Schedule | null> {
	try {
		// Use updateMany with both id and workspaceId to avoid needing compound unique
		const result = await db.schedule.updateMany({
			where: { id, workspaceId, deletedAt: null },
			data: {
				...(data.name !== undefined ? { name: data.name } : {}),
				...(data.description !== undefined ? { description: data.description } : {}),
				...(data.cronExpression !== undefined ? { cronExpression: data.cronExpression } : {}),
				...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
				...(data.runAt !== undefined ? { runAt: data.runAt } : {}),
				...(data.nextRunAt !== undefined ? { nextRunAt: data.nextRunAt } : {}),
				...(data.misfirePolicy !== undefined ? { misfirePolicy: data.misfirePolicy as MisfirePolicy } : {}),
				...(data.maxRetries !== undefined ? { maxRetries: data.maxRetries } : {}),
				...(data.retryBackoffBaseMs !== undefined ? { retryBackoffBaseMs: data.retryBackoffBaseMs } : {}),
			},
		})
		if (result.count === 0) return null
		return findScheduleById(db, id, workspaceId)
	} catch (err: unknown) {
		if ((err as { code?: string }).code === 'P2025') return null
		throw err
	}
}

export async function pauseSchedule(
	db: PrismaClient,
	id: string,
	workspaceId: string
): Promise<Schedule | null> {
	const result = await db.schedule.updateMany({
		where: { id, workspaceId, status: 'active', deletedAt: null },
		data: { status: 'paused' as ScheduleStatus },
	})
	if (result.count === 0) return null
	return findScheduleById(db, id, workspaceId)
}

export async function resumeSchedule(
	db: PrismaClient,
	id: string,
	workspaceId: string,
	nextRunAt: Date
): Promise<Schedule | null> {
	const result = await db.schedule.updateMany({
		where: { id, workspaceId, status: 'paused', deletedAt: null },
		data: { status: 'active' as ScheduleStatus, nextRunAt },
	})
	if (result.count === 0) return null
	return findScheduleById(db, id, workspaceId)
}

export async function softDeleteSchedule(
	db: PrismaClient,
	id: string,
	workspaceId: string
): Promise<boolean> {
	const result = await db.schedule.updateMany({
		where: { id, workspaceId, deletedAt: null },
		data: { deletedAt: new Date() },
	})
	return result.count > 0
}

export async function findDueSchedules(
	db: PrismaClient,
	opts: { now: Date; batchSize: number }
): Promise<ScheduleClaimCandidate[]> {
	const rows = await db.$queryRaw<
		Array<{
			id: string
			version: number
			job_id: string
			workspace_id: string
			schedule_type: string
			cron_expression: string | null
			timezone: string
			run_at: Date | null
			next_run_at: Date
			misfire_policy: string
			max_retries: number
			retry_backoff_base_ms: number
		}>
	>`
		SELECT id, version, job_id, workspace_id, schedule_type, cron_expression,
		       timezone, run_at, next_run_at, misfire_policy, max_retries, retry_backoff_base_ms
		FROM schedules
		WHERE status = 'active' AND deleted_at IS NULL AND next_run_at <= ${opts.now}
		ORDER BY next_run_at ASC
		LIMIT ${opts.batchSize}
		FOR UPDATE SKIP LOCKED
	`
	return rows.map((r) => ({
		id: r.id,
		version: Number(r.version),
		jobId: r.job_id,
		workspaceId: r.workspace_id,
		scheduleType: r.schedule_type as 'cron' | 'one_time',
		cronExpression: r.cron_expression,
		timezone: r.timezone,
		runAt: r.run_at,
		nextRunAt: r.next_run_at,
		misfirePolicy: r.misfire_policy as ScheduleClaimCandidate['misfirePolicy'],
		maxRetries: Number(r.max_retries),
		retryBackoffBaseMs: Number(r.retry_backoff_base_ms),
	}))
}

export async function conditionalClaimSchedule(
	db: PrismaClient,
	candidateId: string,
	candidateVersion: number,
	nextRunAt: Date | null,
	newStatus: string,
	schedulerId: string,
	leaseExpiresAt: Date
): Promise<boolean> {
	const result = await db.schedule.updateMany({
		where: {
			id: candidateId,
			version: candidateVersion,
			status: 'active',
			deletedAt: null,
		},
		data: {
			nextRunAt,
			status: newStatus as ScheduleStatus,
			lastClaimedAt: new Date(),
			lastClaimedBy: schedulerId,
			leaseExpiresAt,
			version: { increment: 1 },
		},
	})
	return result.count > 0
}
