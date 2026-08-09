import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Queue } from 'bullmq'
import { logger } from '../../infra/telemetry.js'
import * as outboxRepo from './outbox.repository.js'

export async function dispatchPending(
	db: PrismaClient,
	queue: Queue
): Promise<number> {
	let dispatchedCount = 0

	try {
		const records = await outboxRepo.findUnpublishedOutbox(db, { limit: 100 })

		for (const record of records) {
			try {
				await queue.add(
					record.eventType,
					record.payload,
					{
						jobId: record.executionId, // Enforces BullMQ deduplication based on executionId
						attempts: 3,
						backoff: { type: 'exponential', delay: 1000 }
					}
				)

				await outboxRepo.markOutboxPublished(db, record.id)
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
