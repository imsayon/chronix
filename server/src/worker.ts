import { config } from "./common/config/index.js"
import { SystemClock } from "./infra/clock.js"
import { createDatabaseClient } from "./infra/database/client.js"
import { migrateToLatest } from "./infra/database/migrate.js"
import { createExecutionQueue, createRedisConnection } from "./infra/queue/client.js"
import { startExecutor } from "./infra/background/executor.js"
import { startScheduler } from "./infra/background/scheduler.js"
import { initOpenTelemetry, logger } from "./infra/telemetry.js"

async function main(): Promise<void> {
	await initOpenTelemetry()
	await migrateToLatest()

	const database = createDatabaseClient(config)
	const redis = createRedisConnection(config)
	const queue = createExecutionQueue(config)

	const role =
		config.WORKER_ROLE === "scheduler"
			? startScheduler(config, new SystemClock(), database, queue)
			: startExecutor(config, database)

	logger.info(
		{ workerRole: config.WORKER_ROLE },
		"Chronix background role started.",
	)

	const shutdown = async (): Promise<void> => {
		await role.stop()
		await database.$disconnect()
		redis.disconnect()
		await queue.close()
		logger.info("Worker shut down gracefully.")
	}
	process.once("SIGTERM", () => {
		void shutdown()
	})
	process.once("SIGINT", () => {
		void shutdown()
	})
}
void main().catch((exception: unknown) => {
	logger.fatal({ err: exception }, "Worker startup failed.")
	process.exitCode = 1
})
