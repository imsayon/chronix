import type { PrismaClient } from '../../generated/prisma/client.js'
import * as repo from './executions.repository.js'
import * as jobsRepo from '../jobs/jobs.repository.js'
import { executeWebhook } from '../../infra/http-client/client.js'
import type { DeliveryClient } from '../../infra/http-client/client.js'
import { logger } from '../../infra/telemetry.js'
import { Counter } from 'prom-client'
import { registry } from '../../infra/telemetry.js'
import { createHmac } from 'node:crypto'

const defaultDeliver: DeliveryClient['deliver'] = (input) => executeWebhook(
	input.url,
	input.method,
	input.headers,
	input.body,
	input.timeoutMs,
	input.chronixHeaders,
)
const executionOutcomeTotal = new Counter({ name: 'chronix_execution_outcome_total', help: 'Execution outcomes by delivery classification', labelNames: ['outcome'], registers: [registry] })

export async function processExecution(
	db: PrismaClient,
	workerId: string,
	executionId: string,
	workspaceId: string,
	deliver: DeliveryClient['deliver'] = defaultDeliver,
	leaseMs = 60_000,
): Promise<void> {
	// 1. Claim the execution with a fenced lease owned by this worker.
	const execution = await repo.claimExecution(db, executionId, workerId, leaseMs)

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
		const response = await deliver({
			url: job.targetUrl,
			method: job.httpMethod,
			headers: {
				...job.headers,
				'X-Chronix-Idempotency-Key': execution.idempotencyKey,
				...(job.signingSecret ? { 'X-Chronix-Signature': `sha256=${createHmac('sha256', job.signingSecret).update(job.bodyTemplate ?? '').digest('hex')}` } : {}),
			},
			body: job.bodyTemplate,
			timeoutMs: job.timeoutMs,
			chronixHeaders: {
				executionId: execution.id,
				attemptNumber: execution.attemptCount + 1,
				scheduleId: execution.scheduleId,
				jobId: execution.jobId,
				workspaceId: execution.workspaceId,
			},
		})
		executionOutcomeTotal.labels(response.outcome).inc()
		const attemptFinishedAt = new Date()

		// 4. Record the attempt in the database
		const idempotencyKey = `${execution.idempotencyKey}-attempt-${execution.attemptCount + 1}`
		const requestHeadersSent = {
			...Object.fromEntries(Object.keys(job.headers).map((name) => [name, '[REDACTED]'])),
			'X-Chronix-Execution-Id': execution.id,
			'X-Chronix-Attempt-Number': (execution.attemptCount + 1).toString(),
			'X-Chronix-Idempotency-Key': execution.idempotencyKey,
			...(job.signingSecret ? { 'X-Chronix-Signature': '[REDACTED]' } : {}),
		}

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
			requestHeadersSent,
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

		const retryable = response.outcome === 'server_error' || response.outcome === 'timeout' || response.outcome === 'network_error' || response.statusCode === 429
		if (attemptCount <= maxRetries && retryable) {
			// Schedule a retry using exponential backoff
			const backoffMs = Math.min(execution.retryBackoffBaseMs * Math.pow(2, attemptCount - 1), 24 * 60 * 60 * 1000)
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
