import type { PrismaClient } from '../../generated/prisma/client.js'
import type { RequestContext } from '../../common/auth.types.js'
import { requireWorkspaceAccess, requireScope } from '../../common/auth.guards.js'
import { writeAuditEvent } from '../../common/audit.js'
import { DateTime } from 'luxon'
import { CronExpressionParser } from 'cron-parser'

import * as repo from './schedules.repository.js'
import * as jobRepo from '../jobs/jobs.repository.js'
import * as executionRepo from '../executions/executions.repository.js'
import * as outboxRepo from '../executions/outbox.repository.js'

import type { CreateScheduleInput, UpdateScheduleInput, ListSchedulesQuery, Schedule } from './schedules.types.js'
import {
	ScheduleNotFoundError,
	ScheduleAlreadyPausedError,
	ScheduleNotPausedError,
	InvalidTimezoneError,
	OneTimeInPastError,
	JobDisabledError,
	InvalidCronError,
	ScheduleInvariantError
} from './schedules.errors.js'
import { VersionConflictError } from '../../common/errors/http-errors.js'
import { JobNotFoundError } from '../jobs/jobs.errors.js'

import { computeNextOccurrence, deriveManualIdempotencyKey } from './schedule.semantics.js'

function validateTimezone(timezone: string) {
	if (!DateTime.local().setZone(timezone).isValid) {
		throw new InvalidTimezoneError(timezone)
	}
}

export async function createSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, input: CreateScheduleInput): Promise<Schedule> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')

	const job = await jobRepo.findJobById(db, input.jobId, workspaceId)
	if (!job) {
		throw new JobNotFoundError(input.jobId)
	}
	if (!job.isEnabled) {
		throw new JobDisabledError(input.jobId)
	}

	const timezone = input.timezone || 'UTC'
	validateTimezone(timezone)

	const now = new Date()
	let computedNextRunAt: Date | null = null

	if (input.scheduleType === 'cron') {
		if (!input.cronExpression) throw new ScheduleInvariantError('cronExpression is required for cron schedules')
		try { CronExpressionParser.parse(input.cronExpression, { currentDate: now, tz: timezone }) } catch { throw new InvalidCronError() }
		computedNextRunAt = computeNextOccurrence({
			scheduleType: 'cron',
			cronExpression: input.cronExpression,
			timezone
		}, now)
	} else if (input.scheduleType === 'one_time') {
		if (!input.runAt) {
			throw new ScheduleInvariantError('runAt is required for one_time schedules')
		}
		if (input.runAt <= now) {
			throw new OneTimeInPastError()
		}
		computedNextRunAt = input.runAt
	}

	const schedule = await repo.insertSchedule(db, {
		workspaceId,
		jobId: input.jobId,
		name: input.name,
		description: input.description,
		scheduleType: input.scheduleType,
		cronExpression: input.cronExpression,
		timezone,
		runAt: input.runAt,
		nextRunAt: computedNextRunAt,
		misfirePolicy: input.misfirePolicy,
		maxRetries: input.maxRetries,
		retryBackoffBaseMs: input.retryBackoffBaseMs,
	} as Parameters<typeof repo.insertSchedule>[1])

	await writeAuditEvent(db, ctx, workspaceId, 'schedule.created', { scheduleId: schedule.id, name: schedule.name })
	return schedule
}

export async function listSchedules(db: PrismaClient, ctx: RequestContext, workspaceId: string, query: ListSchedulesQuery) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:read')
	return repo.findSchedulesByWorkspace(db, workspaceId, query)
}

export async function getSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string): Promise<Schedule> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:read')
	const schedule = await repo.findScheduleById(db, scheduleId, workspaceId)
	if (!schedule) {
		throw new ScheduleNotFoundError(scheduleId)
	}
	return schedule
}

export async function updateSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string, input: UpdateScheduleInput): Promise<Schedule> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	const schedule = await getSchedule(db, ctx, workspaceId, scheduleId)
	if (schedule.scheduleType === 'cron' && input.runAt !== undefined && input.runAt !== null) {
		throw new ScheduleInvariantError('Cron schedules cannot define runAt.')
	}
	if (schedule.scheduleType === 'cron' && input.cronExpression === null) {
		throw new ScheduleInvariantError('Cron schedules require cronExpression.')
	}
	if (schedule.scheduleType === 'one_time' && input.cronExpression !== undefined && input.cronExpression !== null) {
		throw new ScheduleInvariantError('One-time schedules cannot define cronExpression.')
	}
	if (schedule.scheduleType === 'one_time' && input.runAt !== undefined && input.runAt !== null && input.runAt <= new Date()) {
		throw new OneTimeInPastError()
	}

	const updates: Parameters<typeof repo.updateSchedule>[3] = { ...input }

	// Recompute nextRunAt if cronExpression or timezone changes, and schedule is active cron
	if ((input.cronExpression !== undefined || input.timezone !== undefined) && schedule.status === 'active' && schedule.scheduleType === 'cron') {
		const newCron = (input.cronExpression !== undefined ? input.cronExpression : schedule.cronExpression) ?? ''
		const newTz = input.timezone !== undefined ? input.timezone : schedule.timezone

		if (newTz) {
			validateTimezone(newTz)
		}

		if (newCron) {
			try { CronExpressionParser.parse(newCron, { currentDate: new Date(), tz: newTz || 'UTC' }) } catch { throw new InvalidCronError() }
			const nextRunAt = computeNextOccurrence({
				scheduleType: 'cron',
				cronExpression: newCron,
				timezone: newTz || 'UTC'
			}, new Date())
			updates.nextRunAt = nextRunAt
		}
	} else if (input.timezone !== undefined) {
		validateTimezone(input.timezone)
	}

	const updated = await repo.updateSchedule(db, scheduleId, workspaceId, updates)
	if (!updated) {
		if (input.version !== undefined) throw new VersionConflictError()
		throw new ScheduleNotFoundError(scheduleId)
	}

	await writeAuditEvent(db, ctx, workspaceId, 'schedule.updated', { scheduleId, updates: Object.keys(input) })
	return updated
}

export async function pauseSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string): Promise<Schedule> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	const schedule = await getSchedule(db, ctx, workspaceId, scheduleId)
	if (schedule.status === 'paused') {
		throw new ScheduleAlreadyPausedError()
	}
	if (schedule.status !== 'active') {
		throw new Error('Can only pause active schedules') // Simplify for now
	}

	const paused = await repo.pauseSchedule(db, scheduleId, workspaceId)
	if (!paused) {
		throw new ScheduleNotFoundError(scheduleId)
	}

	await writeAuditEvent(db, ctx, workspaceId, 'schedule.paused', { scheduleId })
	return paused
}

export async function resumeSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string): Promise<Schedule> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	const schedule = await getSchedule(db, ctx, workspaceId, scheduleId)
	if (schedule.status !== 'paused') {
		throw new ScheduleNotPausedError()
	}

	const now = new Date()
	let computedNextRunAt: Date | null = null

	if (schedule.scheduleType === 'cron') {
		computedNextRunAt = computeNextOccurrence({
			scheduleType: 'cron',
			cronExpression: schedule.cronExpression,
			timezone: schedule.timezone
		}, now)
	} else if (schedule.scheduleType === 'one_time') {
		if (schedule.runAt && schedule.runAt > now) {
			computedNextRunAt = schedule.runAt
		}
		// If runAt <= now, nextRunAt remains null? Or should we trigger immediately?
		// For one_time that missed their run while paused, they become completed.
		// For simplicity, let's just let nextRunAt be null if it's in the past.
	}

	if (!computedNextRunAt && schedule.scheduleType === 'cron') {
		throw new Error('Cannot resume schedule: no future occurrences found')
	}

	const resumed = await repo.resumeSchedule(db, scheduleId, workspaceId, computedNextRunAt || now)
	if (!resumed) {
		throw new ScheduleNotFoundError(scheduleId)
	}

	await writeAuditEvent(db, ctx, workspaceId, 'schedule.resumed', { scheduleId })
	return resumed
}

export async function deleteSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string): Promise<void> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	const deleted = await repo.softDeleteSchedule(db, scheduleId, workspaceId)
	if (!deleted) {
		throw new ScheduleNotFoundError(scheduleId)
	}
	await writeAuditEvent(db, ctx, workspaceId, 'schedule.deleted', { scheduleId })
}

export async function triggerManual(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string, clientIdempotencyKey?: string) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'executions:trigger')
	const schedule = await getSchedule(db, ctx, workspaceId, scheduleId)

	const job = await jobRepo.findJobById(db, schedule.jobId, workspaceId)
	if (!job || !job.isEnabled) {
		throw new JobDisabledError(schedule.jobId)
	}

	const now = new Date()
	const idempotencyKey = deriveManualIdempotencyKey(schedule.id, clientIdempotencyKey)

	let executionId!: string

	const triggeredBy = ctx.auth?.type === 'account' ? ctx.auth.accountId : null

	await db.$transaction(async (trx) => {
		const existing = await executionRepo.findExecutionByIdempotencyKey(trx, workspaceId, idempotencyKey)
		if (existing) {
			executionId = existing.id
			return
		}

		const exec = await executionRepo.insertExecution(trx, {
			workspaceId,
			scheduleId: schedule.id,
			jobId: schedule.jobId,
			triggerType: 'manual',
			triggeredBy,
			nominalRunAt: now,
			idempotencyKey,
			maxRetries: schedule.maxRetries,
			retryBackoffBaseMs: schedule.retryBackoffBaseMs,
		})
		executionId = exec.id

		await outboxRepo.insertOutbox(trx, {
			executionId,
			payload: { executionId }
		})
	})

	await writeAuditEvent(db, ctx, workspaceId, 'schedule.triggered_manual', { scheduleId, executionId })
	return { executionId }
}
