import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import { pinoHttp } from "pino-http"
import type { PrismaClient } from "../../generated/prisma/client.js"
import type { Config } from "../../common/config/index.js"
import {
	globalErrorHandler,
	notFoundHandler,
} from "../../common/http/middleware/error-handler.js"
import { requestIdMiddleware } from "../../common/http/middleware/request-id.js"
import { createAuthMiddleware } from "../../common/http/middleware/auth.js"
import { logger } from "../telemetry.js"
import { createHealthRouter, metricsHandler } from "./health.js"
import type { Redis } from "ioredis"
import { createAuthRouter } from "../../modules/auth/index.js"
import { createWorkspacesRouter } from "../../modules/workspaces/index.js"
import { createApiKeysRouter } from "../../modules/api-keys/index.js"
import { createJobsRouter } from "../../modules/jobs/index.js"
import { createSchedulesRouter } from "../../modules/schedules/index.js"
import { createExecutionsRouter } from "../../modules/executions/index.js"
import { createWorkersRouter } from "../../modules/workers/index.js"

export function createHttpServer(
	database: PrismaClient,
	redis: Redis,
	config: Config,
): express.Express {
	const app = express()
	app.disable("x-powered-by")
	app.use(pinoHttp({ logger }))
	app.use(requestIdMiddleware)
	app.use(helmet())
	app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }))
	app.use(express.json({ limit: "256kb" }))
	app.use(cookieParser())

	// Auth middleware — populates res.locals.auth; never rejects itself
	app.use(createAuthMiddleware(database, config))

	// Infrastructure routes
	app.use("/health", createHealthRouter(database, redis))
	app.get("/metrics", async (_request, response, next) => {
		try {
			const metrics = await metricsHandler()
			response.set("Content-Type", metrics.contentType).send(metrics.body)
		} catch (exception: unknown) {
			next(exception)
		}
	})

	// API v1 routes
	app.use("/api/v1/auth", createAuthRouter(database, config, redis))
	app.use("/api/v1/workspaces", createWorkspacesRouter(database))
	app.use(
		"/api/v1/workspaces/:workspaceId/api-keys",
		createApiKeysRouter(database, config),
	)
	app.use(
		"/api/v1/workspaces/:workspaceId/jobs",
		createJobsRouter(database),
	)
	app.use(
		"/api/v1/workspaces/:workspaceId/schedules",
		createSchedulesRouter(database),
	)
	app.use(
		"/api/v1/workspaces/:workspaceId/executions",
		createExecutionsRouter(database),
	)
	app.use(
		"/api/v1/workspaces/:workspaceId/workers",
		createWorkersRouter(database),
	)

	app.use(notFoundHandler)
	app.use(globalErrorHandler)
	return app
}
