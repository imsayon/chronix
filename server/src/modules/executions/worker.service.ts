import type { PrismaClient } from '../../generated/prisma/client.js'
import * as repo from './executions.repository.js'
import * as jobsRepo from '../jobs/jobs.repository.js'
import { executeWebhook } from '../../infra/http-client/client.js'
import { logger } from '../../infra/telemetry.js'

export async function processExecution(
	db: PrismaClient,
	workerId: string,
	executionId: string,
	workspaceId: string
): Promise<void> {
	// 1. Claim the execution (leases it to this worker for 60 seconds)
	const execution = await repo.claimExecution(db, executionId, workerId, 60_000)

	if (!execution) {
		logger.info({ executionId, workerId }, 'Execution is no longer pending or could not be claimed')
		return
	}

	logger.info({ executionId, workerId }, 'Claimed execution')

	try {
		// 2. Fetch the target job
		const job = await jobsRepo.findJobById(db, execution.jobId, workspaceId)
		if (!job) {
			logger.error({ executionId, jobId: execution.jobId }, 'Job no longer exists')
			await repo.promoteToDlq(db, executionId, execution.leaseGeneration)
			return
		}

		if (!job.isEnabled) {
			logger.info({ executionId, jobId: job.id }, 'Job is disabled, marking execution as failed')
			await repo.recordOutcome(db, executionId, execution.leaseGeneration, 'failed')
			return
		}

		// 3. Perform the actual HTTP webhook call
		const attemptStartedAt = new Date()
		const response = await executeWebhook(
			job.targetUrl,
			job.httpMethod,
			job.headers,
			job.bodyTemplate,
			job.timeoutMs,
			{
				executionId: execution.id,
				attemptNumber: execution.attemptCount + 1,
				scheduleId: execution.scheduleId,
				jobId: execution.jobId,
				workspaceId: execution.workspaceId,
			}
		)
		const attemptFinishedAt = new Date()

		// 4. Record the attempt in the database
		const idempotencyKey = `${execution.idempotencyKey}-attempt-${execution.attemptCount + 1}`

		await repo.insertAttempt(db, {
			executionId: execution.id,
			workspaceId: execution.workspaceId,
			attemptNumber: execution.attemptCount + 1,
			workerId,
			startedAt: attemptStartedAt,
			finishedAt: attemptFinishedAt,
			outcome: response.outcome,
			httpStatusCode: response.statusCode,
			durationMs: response.durationMs,
			responseBodySample: response.responseBodySample,
			errorMessage: response.errorMessage,
			idempotencyKey,
			requestHeadersSent: {
				...job.headers,
				'X-Chronix-Execution-Id': execution.id,
				'X-Chronix-Attempt-Number': (execution.attemptCount + 1).toString(),
			}
		})

		// 5. Evaluate the outcome
		if (response.outcome === 'success') {
			await repo.recordOutcome(db, executionId, execution.leaseGeneration, 'succeeded')
			logger.info({ executionId }, 'Execution succeeded')
			return
		}

		// If we failed, check if we can retry
		const maxRetries = execution.maxRetries
		const attemptCount = execution.attemptCount + 1

		if (attemptCount <= maxRetries && response.outcome !== 'ssrf_blocked') {
			// Schedule a retry using exponential backoff
			const backoffMs = execution.retryBackoffBaseMs * Math.pow(2, attemptCount - 1)
			const nextRetryAt = new Date(Date.now() + backoffMs)

			await repo.scheduleRetry(db, executionId, execution.leaseGeneration, nextRetryAt)
			logger.info({ executionId, nextRetryAt }, 'Execution failed, scheduled retry')
		} else {
			// Out of retries or SSRF blocked — terminal failure
			await repo.recordOutcome(db, executionId, execution.leaseGeneration, 'failed')
			logger.warn({ executionId, outcome: response.outcome }, 'Execution failed terminally')
		}

	} catch (error) {
		// Unexpected catastrophic failure (e.g., DB connection died midway)
		logger.error({ executionId, error }, 'Unexpected error processing execution')
		// The stale lease recovery loop will pick this up if the worker process crashes.
		// If we are still alive, try to gracefully fail it.
		try {
			await repo.recordOutcome(db, executionId, execution.leaseGeneration, 'failed')
		} catch (innerError) {
			logger.error({ executionId, innerError }, 'Failed to record terminal failure during unexpected error fallback')
		}
	}
}
