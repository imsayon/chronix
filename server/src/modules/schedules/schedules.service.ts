import type { PrismaClient } from '../../generated/prisma/client.js'
import type { RequestContext } from '../../common/auth.types.js'
import { requireAuth } from '../../common/auth.guards.js'
import { writeAuditEvent } from '../../common/audit.js'
import { DateTime } from 'luxon'

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
	JobDisabledError
} from './schedules.errors.js'
import { JobNotFoundError } from '../jobs/jobs.errors.js'

import { computeNextOccurrence, deriveIdempotencyKey } from './schedule.semantics.js'

function validateTimezone(timezone: string) {
	if (!DateTime.local().setZone(timezone).isValid) {
		throw new InvalidTimezoneError(timezone)
	}
}

export async function createSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, input: CreateScheduleInput): Promise<Schedule> {
	requireAuth(ctx)

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
		if (!input.cronExpression) throw new Error('cronExpression is required for cron schedules')
		computedNextRunAt = computeNextOccurrence({
			scheduleType: 'cron',
			cronExpression: input.cronExpression,
			timezone
		}, now)
	} else if (input.scheduleType === 'one_time') {
		if (!input.runAt) {
			throw new Error('runAt is required for one_time schedules')
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
	requireAuth(ctx)
	return repo.findSchedulesByWorkspace(db, workspaceId, query)
}

export async function getSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string): Promise<Schedule> {
	requireAuth(ctx)
	const schedule = await repo.findScheduleById(db, scheduleId, workspaceId)
	if (!schedule) {
		throw new ScheduleNotFoundError(scheduleId)
	}
	return schedule
}

export async function updateSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string, input: UpdateScheduleInput): Promise<Schedule> {
	requireAuth(ctx)
	const schedule = await getSchedule(db, ctx, workspaceId, scheduleId)

	const updates: Parameters<typeof repo.updateSchedule>[3] = { ...input }

	// Recompute nextRunAt if cronExpression or timezone changes, and schedule is active cron
	if ((input.cronExpression !== undefined || input.timezone !== undefined) && schedule.status === 'active' && schedule.scheduleType === 'cron') {
		const newCron = (input.cronExpression !== undefined ? input.cronExpression : schedule.cronExpression) ?? ''
		const newTz = input.timezone !== undefined ? input.timezone : schedule.timezone

		if (newTz) {
			validateTimezone(newTz)
		}

		if (newCron) {
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
		throw new ScheduleNotFoundError(scheduleId)
	}

	await writeAuditEvent(db, ctx, workspaceId, 'schedule.updated', { scheduleId, updates: Object.keys(input) })
	return updated
}

export async function pauseSchedule(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string): Promise<Schedule> {
	requireAuth(ctx)
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
	requireAuth(ctx)
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
	requireAuth(ctx)
	const deleted = await repo.softDeleteSchedule(db, scheduleId, workspaceId)
	if (!deleted) {
		throw new ScheduleNotFoundError(scheduleId)
	}
	await writeAuditEvent(db, ctx, workspaceId, 'schedule.deleted', { scheduleId })
}

export async function triggerManual(db: PrismaClient, ctx: RequestContext, workspaceId: string, scheduleId: string) {
	requireAuth(ctx)
	const schedule = await getSchedule(db, ctx, workspaceId, scheduleId)

	const job = await jobRepo.findJobById(db, schedule.jobId, workspaceId)
	if (!job || !job.isEnabled) {
		throw new JobDisabledError(schedule.jobId)
	}

	const now = new Date()
	const idempotencyKey = deriveIdempotencyKey(schedule.id, now)

	let executionId!: string

	const triggeredBy = ctx.auth?.type === 'account' ? ctx.auth.accountId : null

	await db.$transaction(async (trx) => {
		const exec = await executionRepo.insertExecution(trx as PrismaClient, {
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

		await outboxRepo.insertOutbox(trx as PrismaClient, {
			executionId,
			payload: { executionId }
		})
	})

	await writeAuditEvent(db, ctx, workspaceId, 'schedule.triggered_manual', { scheduleId, executionId })
	return { executionId }
}
