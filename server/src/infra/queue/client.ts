import { Queue } from "bullmq"
import { Redis } from "ioredis"
import type { Config } from "../../common/config/index.js"

export interface ExecutionQueueJob {
	executionId: string
	requestId?: string
	traceId?: string
}
export function createRedisConnection(config: Config): Redis {
	return new Redis(config.REDIS_URL, {
		enableReadyCheck: false,
		maxRetriesPerRequest: null,
	})
}
export function createExecutionQueue(config: Config): Queue<ExecutionQueueJob> {
	return new Queue<ExecutionQueueJob>("executions", {
		connection: { url: config.REDIS_URL },
	})
}
