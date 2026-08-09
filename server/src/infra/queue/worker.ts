import { Worker } from "bullmq"
import type { Job } from "bullmq"
import type { ExecutionQueueJob } from "./client.js"
import type { Config } from "../../common/config/index.js"

export function createExecutionWorker(
	config: Config,
	processor: (job: Job<ExecutionQueueJob>) => Promise<void>,
): Worker<ExecutionQueueJob> {
	return new Worker<ExecutionQueueJob>("executions", processor, {
		connection: { url: config.REDIS_URL, maxRetriesPerRequest: null },
		concurrency: config.WORKER_CONCURRENCY,
	})
}
