import { randomUUID } from "node:crypto"
import * as os from "node:os"
import type { Config } from "../../common/config/index.js"
import { createExecutionWorker } from "../queue/worker.js"
import { logger } from "../telemetry.js"
import type { Stoppable } from "./scheduler.js"
import type { PrismaClient } from "../../generated/prisma/client.js"
import { processExecution } from "../../modules/executions/worker.service.js"
import { upsertWorker, deregisterWorker } from "../../modules/workers/workers.repository.js"

export function startExecutor(config: Config, db: PrismaClient): Stoppable {
	const workerId = `worker-${randomUUID()}`
	const hostname = os.hostname()
	const version = process.env['npm_package_version'] ?? "unknown"

	logger.info({ workerId, hostname }, "Starting execution worker.")

	const register = () => {
		upsertWorker(db, workerId, {
			hostname,
			version,
			processId: process.pid,
			queueName: 'executions',
			concurrency: 10
		})
			.catch(err => logger.error({ err }, "Failed to upsert worker registration."))
	}
	register()
	const heartbeatInterval = setInterval(register, 30_000)

	// 2. Stale lease recovery loop (every 60s)
	// We run this in the executor so that active executors are actively recovering dead executors' work.
	// We could also run it in the scheduler, but since executors are the ones consuming the recovered jobs,
	// running it here is perfectly fine. The plan says "add interval loop for recoverStaleLease".
	// The implementation plan actually says:
	// - executor.ts: Starts Worker, processExecution, registration loop.
	// - scheduler.ts: Add a new interval loop for recoverStaleLeases.
	// I'll put the stale lease recovery in the scheduler.ts to respect the plan.

	// 3. Start BullMQ Worker
	const worker = createExecutionWorker(config, async (job) => {
		const { executionId } = job.data
		try {
			// Find the execution first to get the workspaceId (it's required by processExecution)
			const execution = await db.execution.findUnique({ where: { id: executionId }, select: { workspaceId: true } })
			if (execution) {
				await processExecution(db, workerId, executionId, execution.workspaceId)
			}
		} catch (error) {
			logger.error({ err: error, executionId }, "Unhandled error in processExecution")
			throw error // Let BullMQ handle the failure (it will retry or fail)
		}
	})

	worker.on("error", (exception: Error) =>
		logger.error({ err: exception }, "BullMQ worker error."),
	)

	return {
		async stop(): Promise<void> {
			clearInterval(heartbeatInterval)
			await worker.close()
			await deregisterWorker(db, workerId)
			logger.info({ workerId }, "Execution worker stopped and deregistered.")
		},
	}
}
