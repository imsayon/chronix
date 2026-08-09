import { createServer } from "node:http"
import { config } from "./common/config/index.js"
import { createDatabaseClient } from "./infra/database/client.js"
import { migrateToLatest } from "./infra/database/migrate.js"
import { createHttpServer } from "./infra/http/server.js"
import { createRedisConnection } from "./infra/queue/client.js"
import { initOpenTelemetry, logger } from "./infra/telemetry.js"

async function main(): Promise<void> {
	await initOpenTelemetry()
	await migrateToLatest()
	const database = createDatabaseClient(config)
	const redis = createRedisConnection(config)
	const server = createServer(createHttpServer(database, redis))
	await new Promise<void>((resolve) =>
		server.listen(config.API_PORT, resolve),
	)
	logger.info({ port: config.API_PORT }, "Chronix API listening.")
	const shutdown = async (): Promise<void> => {
		await new Promise<void>((resolve, reject) =>
			server.close((exception) =>
				exception === undefined ? resolve() : reject(exception),
			),
		)
		await Promise.all([database.$disconnect(), redis.quit()])
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
