import type { PrismaClient } from '../../generated/prisma/client.js'

export type WorkerRegistration = {
	id: string
	workerId: string
	hostname: string
	processId: number
	version: string
	queueName: string
	concurrency: number
	lastHeartbeat: Date
	registeredAt: Date
	deregisteredAt: Date | null
	createdAt: Date
	updatedAt: Date
}

export async function upsertWorker(
	db: PrismaClient,
	workerId: string,
	data: { hostname: string; version: string; processId: number; queueName: string; concurrency: number }
): Promise<WorkerRegistration> {
	const now = new Date()
	const result = await db.workerRegistration.upsert({
		where: { workerId },
		create: {
			workerId,
			hostname: data.hostname,
			version: data.version,
			processId: data.processId,
			queueName: data.queueName,
			concurrency: data.concurrency,
			registeredAt: now,
			lastHeartbeat: now,
		},
		update: {
			lastHeartbeat: now,
			deregisteredAt: null, // Revive if previously dead
		},
	})
	return result
}

export async function recordHeartbeat(
	db: PrismaClient,
	workerId: string
): Promise<boolean> {
	const result = await db.workerRegistration.updateMany({
		where: { workerId },
		data: { lastHeartbeat: new Date() },
	})
	return result.count > 0
}

export async function deregisterWorker(
	db: PrismaClient,
	workerId: string
): Promise<boolean> {
	const result = await db.workerRegistration.updateMany({
		where: { workerId, deregisteredAt: null },
		data: { deregisteredAt: new Date() },
	})
	return result.count > 0
}

export async function listActiveWorkers(
	db: PrismaClient,
	staleThreshold: Date
): Promise<WorkerRegistration[]> {
	const results = await db.workerRegistration.findMany({
		where: {
			deregisteredAt: null,
			lastHeartbeat: { gte: staleThreshold },
		},
		orderBy: { lastHeartbeat: 'desc' },
	})
	return results
}
