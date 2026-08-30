import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Queue } from 'bullmq'
import { logger } from '../../infra/telemetry.js'
import { Gauge } from 'prom-client'
import { registry } from '../../infra/telemetry.js'
import * as outboxRepo from './outbox.repository.js'

const outboxBacklog = new Gauge({ name: 'chronix_execution_outbox_unpublished', help: 'Unpublished execution outbox records', registers: [registry] })
const REPUBLISH_AFTER_MS = 30_000

export async function dispatchPending(
	db: PrismaClient,
	queue: Queue,
	now = new Date(),
): Promise<number> {
	let dispatchedCount = 0

	try {
		const records = await outboxRepo.findDispatchableOutbox(db, {
			limit: 100,
			now,
			republishAfterMs: REPUBLISH_AFTER_MS,
		})
		outboxBacklog.set(records.filter((record) => record.publishedAt === null).length)

		for (const record of records) {
			try {
				await queue.add(
					record.eventType,
					record.payload,
					{
						jobId: `${record.executionId}-${record.attemptCount}`,
						attempts: 3,
						backoff: { type: 'exponential', delay: 1000 }
					}
				)

				await outboxRepo.markOutboxPublished(db, record.id, now)
				dispatchedCount++
			} catch (err: unknown) {
				logger.error({ err, outboxId: record.id }, 'Failed to dispatch outbox record to BullMQ')
				await outboxRepo.incrementOutboxAttempt(db, record.id)
			}
		}
	} catch (err: unknown) {
		logger.error({ err }, 'Error in outbox dispatch loop')
	}

	return dispatchedCount
}
