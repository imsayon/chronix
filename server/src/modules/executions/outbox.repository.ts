import type { PrismaClient, Prisma } from '../../generated/prisma/client.js'

type DbClient = PrismaClient | Prisma.TransactionClient

export interface OutboxRecord {
	id: string
	executionId: string
	eventType: string
	eventVersion: number
	payload: unknown
	publishedAt: Date | null
	attempts: number
	createdAt: Date
	attemptCount: number
}

export async function insertOutbox(
	db: DbClient,
	data: { executionId: string; payload: Record<string, unknown> }
): Promise<void> {
	await db.executionOutbox.create({
		data: {
			executionId: data.executionId,
			payload: data.payload as object,
			eventType: 'execution.created',
			eventVersion: 1,
		},
	})
}

export async function findDispatchableOutbox(
	db: PrismaClient,
	opts: { limit: number; now: Date; republishAfterMs: number }
): Promise<OutboxRecord[]> {
	const republishBefore = new Date(opts.now.getTime() - opts.republishAfterMs)
	const records = await db.executionOutbox.findMany({
		where: {
			execution: {
				status: 'pending',
				OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: opts.now } }],
			},
			OR: [{ publishedAt: null }, { publishedAt: { lte: republishBefore } }],
		},
		orderBy: { createdAt: 'asc' },
		take: opts.limit,
		include: { execution: { select: { attemptCount: true } } },
	})
	return records.map(({ execution, ...record }) => ({
		...record,
		attemptCount: execution.attemptCount,
	}))
}

export async function markOutboxPublished(
	db: PrismaClient,
	id: string,
	publishedAt: Date,
): Promise<void> {
	await db.executionOutbox.update({
		where: { id },
		data: { publishedAt },
	})
}

export async function incrementOutboxAttempt(
	db: PrismaClient,
	id: string
): Promise<void> {
	await db.executionOutbox.update({
		where: { id },
		data: { attempts: { increment: 1 } },
	})
}
