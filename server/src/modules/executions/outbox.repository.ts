import type { PrismaClient } from '../../generated/prisma/client.js'

type DbClient = PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export interface OutboxRecord {
	id: string
	executionId: string
	eventType: string
	eventVersion: number
	payload: unknown
	publishedAt: Date | null
	attempts: number
	createdAt: Date
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

export async function findUnpublishedOutbox(
	db: PrismaClient,
	opts: { limit: number }
): Promise<OutboxRecord[]> {
	return await db.executionOutbox.findMany({
		where: { publishedAt: null },
		orderBy: { createdAt: 'asc' },
		take: opts.limit,
	})
}

export async function markOutboxPublished(
	db: PrismaClient,
	id: string
): Promise<void> {
	await db.executionOutbox.update({
		where: { id },
		data: { publishedAt: new Date() },
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
