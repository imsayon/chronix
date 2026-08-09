import { randomUUID } from "node:crypto"
import type { Config } from "../../common/config/index.js"
import type { Clock } from "../clock.js"
import type { PrismaClient } from "../../generated/prisma/client.js"
import type { Queue } from "bullmq"
import type { ExecutionQueueJob } from "../queue/client.js"
import { logger } from "../telemetry.js"
import { processDueSchedules } from "../../modules/schedules/scheduler.service.js"
import { dispatchPending } from "../../modules/executions/outbox-dispatcher.service.js"
import { findStaleLeases, recoverStaleLease } from "../../modules/executions/executions.repository.js"
import { pruneExpiredExecutions } from "../../modules/executions/retention.service.js"

export interface Stoppable {
	stop(): Promise<void>
}

export function startScheduler(
	config: Config,
	clock: Clock,
	db: PrismaClient,
	queue: Queue<ExecutionQueueJob>,
): Stoppable {
	// Stable ID for this scheduler instance (survives tick-to-tick)
	const schedulerId = `scheduler-${randomUUID()}`
	logger.info({ schedulerId }, "Scheduler starting.")

	const claimLoop = setInterval(() => {
		const now = clock.now()
		processDueSchedules(db, config, schedulerId, now).catch((err: unknown) => {
			logger.error({ err }, "Scheduler claim loop error.")
		})
	}, config.SCHEDULER_TICK_MS)

	const outboxLoop = setInterval(() => {
		dispatchPending(db, queue).catch((err: unknown) => {
			logger.error({ err }, "Outbox dispatcher error.")
		})
	}, Math.max(1_000, Math.floor(config.SCHEDULER_TICK_MS / 2)))

	const staleLeaseLoop = setInterval(() => {
		const now = clock.now()
		findStaleLeases(db, { now, limit: 100 })
			.then(async (stales) => {
				for (const stale of stales) {
					try {
						await recoverStaleLease(db, stale.id)
						logger.info({ executionId: stale.id }, "Recovered stale execution lease.")
					} catch (err) {
						logger.error({ err, executionId: stale.id }, "Failed to recover stale lease.")
					}
				}
			})
			.catch((err) => logger.error({ err }, "Stale lease recovery error."))
	}, 60_000)
	const retentionLoop = setInterval(() => {
		pruneExpiredExecutions(db, clock.now(), config.RETENTION_PRUNE_BATCH_SIZE)
			.then((deleted) => { if (deleted > 0) logger.info({ deleted }, "Pruned expired execution history.") })
			.catch((err: unknown) => logger.error({ err }, "Execution retention prune failed."))
	}, config.RETENTION_PRUNE_INTERVAL_MS)

	return {
		async stop(): Promise<void> {
			clearInterval(claimLoop)
			clearInterval(outboxLoop)
			clearInterval(staleLeaseLoop)
			clearInterval(retentionLoop)
			logger.info({ schedulerId }, "Scheduler stopped.")
		},
	}
}
