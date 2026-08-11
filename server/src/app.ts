import { createServer } from "node:http"
import { loadConfig } from "./common/config/index.js"
import { SystemClock } from "./infra/clock.js"
import { startExecutor } from "./infra/background/executor.js"
import { startScheduler, type Stoppable } from "./infra/background/scheduler.js"
import { createDatabaseClient } from "./infra/database/client.js"
import { createHttpServer } from "./infra/http/server.js"
import { createExecutionQueue, createRedisConnection } from "./infra/queue/client.js"
import { initOpenTelemetry, logger, shutdownOpenTelemetry } from "./infra/telemetry.js"

async function main(): Promise<void> {
	const config = loadConfig()
	await initOpenTelemetry(config.OTEL_EXPORTER_OTLP_ENDPOINT)
	const database = createDatabaseClient(config)
	const redis = createRedisConnection(config)
	const backgroundRoles: Stoppable[] = []
	const queue = config.EMBEDDED_WORKERS ? createExecutionQueue(config) : undefined
	if (queue !== undefined) {
		backgroundRoles.push(
			startScheduler(config, new SystemClock(), database, queue),
			startExecutor(config, database),
		)
		logger.info("Chronix demo-mode background roles started in the API process.")
	}
	const server = createServer(createHttpServer(database, redis, config))
	server.headersTimeout = 15_000
	server.requestTimeout = 30_000
	server.keepAliveTimeout = 5_000
	await new Promise<void>((resolve) =>
		server.listen(config.API_PORT, resolve),
	)
	logger.info({ port: config.API_PORT }, "Chronix API listening.")
	let shuttingDown = false
	const shutdown = async (): Promise<void> => {
		if (shuttingDown) return
		shuttingDown = true
		await new Promise<void>((resolve, reject) =>
			server.close((exception) =>
				exception === undefined ? resolve() : reject(exception),
			),
		)
		await Promise.all(backgroundRoles.map((role) => role.stop()))
		await queue?.close()
		await Promise.all([database.$disconnect(), redis.quit()])
		await shutdownOpenTelemetry()
		logger.info("Chronix API shut down gracefully.")
	}
	process.once("SIGTERM", () => {
		void shutdown()
	})
	process.once("SIGINT", () => {
		void shutdown()
	})
}
void main().catch((exception: unknown) => {
	logger.fatal({ err: exception }, "API startup failed.")
	process.exitCode = 1
})
