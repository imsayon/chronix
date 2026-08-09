import type { PrismaClient, Prisma, HttpMethod } from '../../generated/prisma/client.js'
import type { Job, ListJobsQuery } from './jobs.types.js'
import { JobNameTakenError } from './jobs.errors.js'
import { encodeCursor, decodeCursor } from '../../common/pagination.js'

function mapJob(row: {
	id: string
	workspaceId: string
	name: string
	description: string | null
	targetUrl: string
	httpMethod: HttpMethod
	headers: unknown
	bodyTemplate: string | null
	timeoutMs: number
	isEnabled: boolean
	version: number
	deletedAt: Date | null
	createdAt: Date
	updatedAt: Date
}): Job {
	return {
		id: row.id,
		workspaceId: row.workspaceId,
		name: row.name,
		description: row.description,
		targetUrl: row.targetUrl,
		httpMethod: row.httpMethod as Job['httpMethod'],
		headers: (row.headers as Record<string, string>) ?? {},
		bodyTemplate: row.bodyTemplate,
		timeoutMs: row.timeoutMs,
		isEnabled: row.isEnabled,
		version: row.version,
		deletedAt: row.deletedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export async function findJobById(db: PrismaClient, id: string, workspaceId: string): Promise<Job | null> {
	const job = await db.job.findFirst({
		where: { id, workspaceId, deletedAt: null },
	})
	if (!job) return null
	return mapJob(job)
}

export async function findJobsByWorkspace(
	db: PrismaClient,
	workspaceId: string,
	query: ListJobsQuery
): Promise<{ jobs: Job[]; nextCursor: string | null; hasMore: boolean }> {
	const limit = Math.min(query.limit ?? 20, 100)

	const where: Prisma.JobWhereInput = {
		workspaceId,
		deletedAt: null,
	}
	if (query.isEnabled !== undefined) where.isEnabled = query.isEnabled

	const cursorObj = query.cursor ? { id: decodeCursor(query.cursor) } : undefined

	const rows = await db.job.findMany({
		where,
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		take: limit + 1,
		...(cursorObj !== undefined ? { cursor: cursorObj, skip: 1 } : {}),
	})

	const hasMore = rows.length > limit
	const items = hasMore ? rows.slice(0, limit) : rows
	const jobs = items.map(mapJob)

	const lastJob = jobs.at(-1)
	const nextCursor = hasMore && lastJob ? encodeCursor(lastJob.id) : null

	return { jobs, nextCursor, hasMore }
}

export async function insertJob(
	db: PrismaClient,
	data: {
		workspaceId: string
		name: string
		description?: string | null
		targetUrl: string
		httpMethod: string
		headers?: Record<string, string>
		bodyTemplate?: string | null
		timeoutMs?: number
	}
): Promise<Job> {
	try {
		const job = await db.job.create({
			data: {
				workspaceId: data.workspaceId,
				name: data.name,
				description: data.description ?? null,
				targetUrl: data.targetUrl,
				httpMethod: data.httpMethod as HttpMethod,
				headers: data.headers ?? {},
				bodyTemplate: data.bodyTemplate ?? null,
				timeoutMs: data.timeoutMs ?? 30000,
			},
		})
		return mapJob(job)
	} catch (error: unknown) {
		if ((error as { code?: string }).code === 'P2002') {
			throw new JobNameTakenError(data.name)
		}
		throw error
	}
}

export async function updateJobProperly(
	db: PrismaClient,
	id: string,
	workspaceId: string,
	data: Partial<{
		version: number
		name: string
		description: string | null
		targetUrl: string
		httpMethod: string
		headers: Record<string, string>
		bodyTemplate: string | null
		timeoutMs: number
		isEnabled: boolean
	}>
): Promise<Job | null> {
	// Ensure workspace scoping + not deleted before updating
	const existing = await db.job.findFirst({ where: { id, workspaceId, deletedAt: null } })
	if (!existing) return null

	try {
		const updates = {
				...(data.name !== undefined ? { name: data.name } : {}),
				...(data.description !== undefined ? { description: data.description } : {}),
				...(data.targetUrl !== undefined ? { targetUrl: data.targetUrl } : {}),
				...(data.httpMethod !== undefined ? { httpMethod: data.httpMethod as HttpMethod } : {}),
				...(data.headers !== undefined ? { headers: data.headers } : {}),
				...(data.bodyTemplate !== undefined ? { bodyTemplate: data.bodyTemplate } : {}),
				...(data.timeoutMs !== undefined ? { timeoutMs: data.timeoutMs } : {}),
				...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
				version: { increment: 1 },
		}
		if (data.version !== undefined) {
			const result = await db.job.updateMany({
				where: { id, workspaceId, deletedAt: null, version: data.version },
				data: updates,
			})
			if (result.count === 0) return null
		} else {
			await db.job.update({ where: { id }, data: updates })
		}
		const updated = await db.job.findFirst({ where: { id, workspaceId, deletedAt: null } })
		return updated ? mapJob(updated) : null
	} catch (error: unknown) {
		if ((error as { code?: string }).code === 'P2002') {
			throw new JobNameTakenError(data.name ?? 'unknown')
		}
		throw error
	}
}

export async function softDeleteJob(db: PrismaClient, id: string, workspaceId: string): Promise<boolean> {
	const result = await db.job.updateMany({
		where: { id, workspaceId, deletedAt: null },
		data: { deletedAt: new Date() },
	})
	return result.count > 0
}

export async function countActiveSchedulesForJob(db: PrismaClient, jobId: string): Promise<number> {
	return db.schedule.count({
		where: {
			jobId,
			status: { in: ['active', 'paused'] },
			deletedAt: null,
		},
	})
}
