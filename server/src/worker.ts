import { loadConfig } from "./common/config/index.js"
import { SystemClock } from "./infra/clock.js"
import { createDatabaseClient } from "./infra/database/client.js"
import { createExecutionQueue, createRedisConnection } from "./infra/queue/client.js"
import { startExecutor } from "./infra/background/executor.js"
import { startScheduler } from "./infra/background/scheduler.js"
import { initOpenTelemetry, logger, shutdownOpenTelemetry } from "./infra/telemetry.js"

async function main(): Promise<void> {
	const config = loadConfig()
	await initOpenTelemetry(config.OTEL_EXPORTER_OTLP_ENDPOINT)

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

	let shuttingDown = false
	const shutdown = async (): Promise<void> => {
		if (shuttingDown) return
		shuttingDown = true
		await role.stop()
		await database.$disconnect()
		redis.disconnect()
		await queue.close()
		await shutdownOpenTelemetry()
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
