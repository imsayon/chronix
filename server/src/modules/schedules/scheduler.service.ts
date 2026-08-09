import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Config } from '../../common/config/index.js'
import { logger, registry } from '../../infra/telemetry.js'
import { Counter, Histogram } from 'prom-client'

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
const schedulerLag = new Histogram({ name: 'chronix_scheduler_lag_seconds', help: 'Time between scheduled and observed claim', labelNames: ['status'], registers: [registry] })

export async function processDueSchedules(
	db: PrismaClient,
	config: Config,
	schedulerId: string,
	now: Date
): Promise<number> {
	const batchSize = Math.min(config.SCHEDULER_BATCH_SIZE, 100)
	let claimedCount = 0

	// Select and process each candidate inside the same transaction. This keeps
	// FOR UPDATE SKIP LOCKED effective across competing scheduler processes.
	for (let index = 0; index < batchSize; index += 1) {
		try {
			const result = await db.$transaction(async (trx) => {
				const candidate = (await scheduleRepo.findDueSchedules(trx, { now, batchSize: 1 }))[0]
				if (!candidate) return { found: false, claimed: 0 }
				schedulerLag.labels('observed').observe(Math.max(0, now.getTime() - candidate.nextRunAt.getTime()) / 1_000)

				const toleranceMs = config.SCHEDULER_TICK_MS * 2
				const effectiveMisfirePolicy = now.getTime() - candidate.nextRunAt.getTime() <= toleranceMs ? 'coalesce' : candidate.misfirePolicy
				const misfireResult = applyMisfirePolicy({
					scheduleType: candidate.scheduleType,
					cronExpression: candidate.cronExpression,
					timezone: candidate.timezone,
					misfirePolicy: effectiveMisfirePolicy,
					nextRunAt: candidate.nextRunAt,
				}, now)
				const newStatus = candidate.scheduleType === 'one_time' ? 'completed' : 'active'
				const leaseExpiresAt = new Date(now.getTime() + config.LEASE_DURATION_MS)
				const occurrences = misfireResult.catchUpOccurrences ?? (misfireResult.nominalRunAt === null ? [] : [misfireResult.nominalRunAt])

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
					return { found: true, claimed: 0 }
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
					claimTotal.labels('claimed').inc()
				}
				return { found: true, claimed: occurrences.length }
			})
			if (!result.found) break
			claimedCount += result.claimed
		} catch (err: unknown) {
			logger.error({ err }, 'Error processing schedule claim')
			claimTotal.labels('error').inc()
		}
	}

	return claimedCount
}
