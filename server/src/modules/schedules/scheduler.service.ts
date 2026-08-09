import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Config } from '../../common/config/index.js'
import { logger, registry } from '../../infra/telemetry.js'
import { Counter } from 'prom-client'

import * as scheduleRepo from './schedules.repository.js'
import * as executionRepo from '../executions/executions.repository.js'
import * as outboxRepo from '../executions/outbox.repository.js'
import { applyMisfirePolicy, deriveIdempotencyKey } from './schedule.semantics.js'

const claimTotal = new Counter({
	name: 'chronix_schedule_claim_total',
	help: 'Total number of schedules claimed',
	labelNames: ['status'],
	registers: [registry],
})

export async function processDueSchedules(
	db: PrismaClient,
	config: Config,
	schedulerId: string,
	now: Date
): Promise<number> {
	// 1. Find candidates
	const batchSize = Math.min(config.SCHEDULER_BATCH_SIZE, 100)
	const candidates = await scheduleRepo.findDueSchedules(db, { now, batchSize })

	if (candidates.length === 0) {
		return 0
	}

	let claimedCount = 0

	// 2. Iterate sequentially to respect FOR UPDATE SKIP LOCKED row locks
	for (const candidate of candidates) {
		try {
			// a. Detect misfire & compute next occurrence
			// Check if candidate nextRunAt is significantly in the past (e.g. tick + some tolerance)
			const toleranceMs = config.SCHEDULER_TICK_MS * 2
			let effectiveMisfirePolicy = candidate.misfirePolicy
			if (now.getTime() - candidate.nextRunAt.getTime() <= toleranceMs) {
				// Not a misfire, it's running on time. Coalesce is standard advancement.
				effectiveMisfirePolicy = 'coalesce'
			}

			const state = {
				scheduleType: candidate.scheduleType,
				cronExpression: candidate.cronExpression,
				timezone: candidate.timezone,
				misfirePolicy: effectiveMisfirePolicy,
				nextRunAt: candidate.nextRunAt,
			}

			const misfireResult = applyMisfirePolicy(state, now)

			// b. Prepare claim updates
			// If it's a one_time schedule, the status should become completed, and nextRunAt should be null.
			// Otherwise, status remains active.
			let newStatus = 'active'
			if (candidate.scheduleType === 'one_time') {
				newStatus = 'completed'
			}

			const leaseExpiresAt = new Date(now.getTime() + config.LEASE_DURATION_MS)
			const occurrences = misfireResult.catchUpOccurrences ?? (misfireResult.nominalRunAt === null ? [] : [misfireResult.nominalRunAt])

			// c. Transactional conditional claim + execution + outbox
			await db.$transaction(async (trx) => {
				const claimed = await scheduleRepo.conditionalClaimSchedule(
					trx,
					candidate.id,
					candidate.version,
					misfireResult.nextRunAt,
					newStatus,
					schedulerId,
					leaseExpiresAt
				)

				if (!claimed) {
					// Another scheduler won the race (version changed)
					return
				}

				for (const nominalRunAt of occurrences) {
					const idempotencyKey = deriveIdempotencyKey(candidate.id, nominalRunAt)
					const execution = await executionRepo.insertExecution(trx, {
						workspaceId: candidate.workspaceId,
						scheduleId: candidate.id,
						jobId: candidate.jobId,
						triggerType: 'scheduled',
						nominalRunAt,
						idempotencyKey,
						maxRetries: candidate.maxRetries,
						retryBackoffBaseMs: candidate.retryBackoffBaseMs,
					})
					await outboxRepo.insertOutbox(trx, {
						executionId: execution.id,
						payload: { executionId: execution.id },
					})
					claimedCount++
					claimTotal.labels('claimed').inc()
				}
			})
		} catch (err: unknown) {
			logger.error({ err, scheduleId: candidate.id }, 'Error processing schedule claim')
			claimTotal.labels('error').inc()
		}
	}

	return claimedCount
}
