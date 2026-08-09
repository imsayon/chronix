import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import * as workerService from './worker.service.js'
import * as jobsRepo from '../jobs/jobs.repository.js'
import * as schedulesRepo from '../schedules/schedules.repository.js'
import * as executionsRepo from './executions.repository.js'
import { randomUUID } from 'node:crypto'
import { MockAgent, setGlobalDispatcher } from 'undici'
import * as ssrf from '../../infra/http-client/ssrf-check.js'

import { createDatabaseClient } from '../../infra/database/client.js'
import { config } from '../../common/config/index.js'

const db = createDatabaseClient(config)
const workspaceId = randomUUID()
const workerId = 'test-worker-1'

// Mock SSRF globally for tests so it doesn't block localhost/mocked IPs,
// except when we explicitly want it to.
vi.spyOn(ssrf, 'isIpBlocked').mockImplementation((ip: string) => {
	if (ip === '10.0.0.1') return true // block this one explicitly for tests
	return false
})

describe('Worker Service Integration', () => {
	const mockAgent = new MockAgent()
	mockAgent.disableNetConnect()
	setGlobalDispatcher(mockAgent)

	beforeEach(async () => {
		// Clean up database for the workspace
		await db.executionAttempt.deleteMany()
		await db.execution.deleteMany()
		await db.schedule.deleteMany()
		await db.job.deleteMany()
	})

	it('should process a successful execution', async () => {
		const job = await jobsRepo.insertJob(db, {
			workspaceId,
			name: 'Test Job',
			targetUrl: 'https://api.example.com/webhook',
			httpMethod: 'POST',
			headers: { 'Authorization': 'Bearer test' },
			bodyTemplate: '{"hello":"world"}',
			timeoutMs: 5000,
		})

		const schedule = await schedulesRepo.insertSchedule(db, {
			workspaceId,
			jobId: job.id,
			name: 'Test Schedule',
			scheduleType: 'one_time',
			timezone: 'UTC',
			runAt: new Date(),
			maxRetries: 3,
			retryBackoffBaseMs: 1000,
		})

		const execution = await db.execution.create({
			data: {
				id: randomUUID(),
				workspaceId,
				scheduleId: schedule.id,
				jobId: job.id,
				triggerType: 'scheduled',
				nominalRunAt: new Date(),
				idempotencyKey: 'test-exec-1',
				status: 'pending',
				attemptCount: 0,
				maxRetries: 3,
				retryBackoffBaseMs: 1000,
			}
		})

		// Mock the HTTP request
		const pool = mockAgent.get('https://api.example.com')
		pool.intercept({
			path: '/webhook',
			method: 'POST',
			body: '{"hello":"world"}',
		}).reply(200, 'OK')

		await workerService.processExecution(db, workerId, execution.id, workspaceId)

		// Verify state transitions
		const updatedExecution = await db.execution.findUniqueOrThrow({ where: { id: execution.id } })
		expect(updatedExecution.status).toBe('succeeded')
		expect(updatedExecution.attemptCount).toBe(1)
		expect(updatedExecution.terminalAt).not.toBeNull()

		// Verify attempts
		const attempts = await db.executionAttempt.findMany({ where: { executionId: execution.id } })
		expect(attempts).toHaveLength(1)
		expect(attempts[0].outcome).toBe('success')
		expect(attempts[0].httpStatusCode).toBe(200)
	})

	it('should retry a failed execution (500 Server Error)', async () => {
		const job = await jobsRepo.insertJob(db, {
			workspaceId,
			name: 'Test Job',
			targetUrl: 'https://api.error.com/webhook',
			httpMethod: 'POST',
			headers: {},
			timeoutMs: 5000,
		})

		const execution = await db.execution.create({
			data: {
				id: randomUUID(),
				workspaceId,
				scheduleId: null, // manual trigger
				jobId: job.id,
				triggerType: 'manual',
				nominalRunAt: new Date(),
				idempotencyKey: 'test-exec-2',
				status: 'pending',
				attemptCount: 0,
				maxRetries: 2,
				retryBackoffBaseMs: 1000,
			}
		})

		const pool = mockAgent.get('https://api.error.com')
		pool.intercept({
			path: '/webhook',
			method: 'POST',
		}).reply(500, 'Internal Server Error')

		await workerService.processExecution(db, workerId, execution.id, workspaceId)

		// Verify it scheduled a retry
		const updatedExecution = await db.execution.findUniqueOrThrow({ where: { id: execution.id } })
		expect(updatedExecution.status).toBe('pending') // Because claim + scheduleRetry goes back to pending/ready
		expect(updatedExecution.attemptCount).toBe(1)
		expect(updatedExecution.nextRetryAt).not.toBeNull()
		expect(updatedExecution.terminalAt).toBeNull()

		const attempts = await db.executionAttempt.findMany({ where: { executionId: execution.id } })
		expect(attempts).toHaveLength(1)
		expect(attempts[0].outcome).toBe('server_error')
		expect(attempts[0].httpStatusCode).toBe(500)
	})

	it('should fail terminally after exceeding max retries', async () => {
		const job = await jobsRepo.insertJob(db, {
			workspaceId,
			name: 'Test Job',
			targetUrl: 'https://api.error.com/webhook',
			httpMethod: 'POST',
			headers: {},
			timeoutMs: 5000,
		})

		const execution = await db.execution.create({
			data: {
				id: randomUUID(),
				workspaceId,
				scheduleId: null,
				jobId: job.id,
				triggerType: 'manual',
				nominalRunAt: new Date(),
				idempotencyKey: 'test-exec-3',
				status: 'pending',
				attemptCount: 1, // Currently on attempt 1
				maxRetries: 1,   // Max retries 1, so next attempt is the final one
				retryBackoffBaseMs: 1000,
			}
		})

		const pool = mockAgent.get('https://api.error.com')
		pool.intercept({
			path: '/webhook',
			method: 'POST',
		}).reply(503, 'Service Unavailable')

		await workerService.processExecution(db, workerId, execution.id, workspaceId)

		// Verify it failed terminally
		const updatedExecution = await db.execution.findUniqueOrThrow({ where: { id: execution.id } })
		expect(updatedExecution.status).toBe('failed')
		expect(updatedExecution.attemptCount).toBe(2)
		expect(updatedExecution.nextRetryAt).toBeNull()
		expect(updatedExecution.terminalAt).not.toBeNull()

		const attempts = await db.executionAttempt.findMany({ where: { executionId: execution.id } })
		expect(attempts).toHaveLength(1)
		expect(attempts[0].outcome).toBe('server_error')
		expect(attempts[0].attemptNumber).toBe(2)
	})
})
