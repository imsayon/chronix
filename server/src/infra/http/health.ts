import { Router } from "express"
import { Prisma } from "../../generated/prisma/client.js"
import type { PrismaClient } from "../../generated/prisma/client.js"
import type { Redis } from "ioredis"
import { success } from "../../common/http/envelope.js"
import { registry } from "../telemetry.js"

async function within<T>(
	operation: Promise<T>,
	milliseconds: number,
): Promise<T> {
	let timeout: NodeJS.Timeout | undefined
	try {
		return await Promise.race([
			operation,
			new Promise<T>((_resolve, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Dependency check timed out.")),
					milliseconds,
				)
			}),
		])
	} finally {
		if (timeout !== undefined) clearTimeout(timeout)
	}
}

export function createHealthRouter(
	database: PrismaClient,
	redis: Redis,
): Router {
	const router = Router()
	router.get("/live", (_request, response) =>
		response.status(200).json(success(response, { status: "live" })),
	)
	router.get("/ready", async (_request, response) => {
		const [databaseCheck, redisCheck] = await Promise.allSettled([
			within(database.$queryRaw(Prisma.sql`SELECT 1`), 1_000),
			within(redis.ping(), 1_000),
		])
		const checks = {
			postgres: databaseCheck.status === "fulfilled" ? "ok" : "error",
			redis: redisCheck.status === "fulfilled" ? "ok" : "error",
		} as const
		const ready = checks.postgres === "ok" && checks.redis === "ok"
		response.status(ready ? 200 : 503).json(
			success(response, {
				status: ready ? "ready" : "degraded",
				checks,
			}),
		)
	})
	return router
}
export async function metricsHandler(): Promise<{
	contentType: string
	body: string
}> {
	return { contentType: registry.contentType, body: await registry.metrics() }
}
