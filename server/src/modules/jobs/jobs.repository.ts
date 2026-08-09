import type { PrismaClient, Prisma, HttpMethod } from '../../generated/prisma/client.js'
import type { Job, ListJobsQuery } from './jobs.types.js'
import { JobNameTakenError } from './jobs.errors.js'
import { encodeCursor, decodeCursor } from '../../common/pagination.js'
import { encryptHeaders, encryptValue, decryptHeaders, decryptValue } from './jobs.crypto.js'
import { randomBytes } from 'node:crypto'

function randomSigningSecret(): string {
	return randomBytes(32).toString('base64url')
}

function dbBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(value)
}

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
	headersCiphertext: Uint8Array | null
	headersNonce: Uint8Array | null
	bodyTemplateCiphertext: Uint8Array | null
	bodyTemplateNonce: Uint8Array | null
	signingSecretCiphertext: Uint8Array | null
	signingSecretNonce: Uint8Array | null
}, rawKey?: string): Job {
	const headers = row.headersCiphertext && row.headersNonce ? decryptHeaders(row.headersCiphertext, row.headersNonce, rawKey) : (row.headers as Record<string, string>) ?? {}
	const bodyTemplate = row.bodyTemplateCiphertext && row.bodyTemplateNonce ? decryptValue(row.bodyTemplateCiphertext, row.bodyTemplateNonce, rawKey) : row.bodyTemplate
	const signingSecret = row.signingSecretCiphertext && row.signingSecretNonce ? decryptValue(row.signingSecretCiphertext, row.signingSecretNonce, rawKey) : null
	return {
		id: row.id,
		workspaceId: row.workspaceId,
		name: row.name,
		description: row.description,
		targetUrl: row.targetUrl,
		httpMethod: row.httpMethod as Job['httpMethod'],
		headers,
		bodyTemplate,
		signingSecret,
		timeoutMs: row.timeoutMs,
		isEnabled: row.isEnabled,
		version: row.version,
		deletedAt: row.deletedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export async function findJobById(db: PrismaClient, id: string, workspaceId: string, rawKey?: string): Promise<Job | null> {
	const job = await db.job.findFirst({
		where: { id, workspaceId, deletedAt: null },
	})
	if (!job) return null
	return mapJob(job, rawKey)
}

export async function findJobsByWorkspace(
	db: PrismaClient,
	workspaceId: string,
	query: ListJobsQuery,
	rawKey?: string
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
	const jobs = items.map((item) => mapJob(item, rawKey))

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
		signingSecret?: string
	}, rawKey?: string
): Promise<Job> {
	try {
		const signingSecret = data.signingSecret ?? randomSigningSecret()
		const encryptedHeaders = encryptHeaders(data.headers ?? {}, rawKey)
		const encryptedBody = data.bodyTemplate === undefined || data.bodyTemplate === null ? null : encryptValue(data.bodyTemplate, rawKey)
		const encryptedSigningSecret = encryptValue(signingSecret, rawKey)
		const job = await db.job.create({
			data: {
				workspaceId: data.workspaceId,
				name: data.name,
				description: data.description ?? null,
				targetUrl: data.targetUrl,
				httpMethod: data.httpMethod as HttpMethod,
				headers: {},
				bodyTemplate: null,
				headersCiphertext: dbBytes(encryptedHeaders.ciphertext),
				headersNonce: dbBytes(encryptedHeaders.nonce),
				bodyTemplateCiphertext: encryptedBody ? dbBytes(encryptedBody.ciphertext) : null,
				bodyTemplateNonce: encryptedBody ? dbBytes(encryptedBody.nonce) : null,
				signingSecretCiphertext: dbBytes(encryptedSigningSecret.ciphertext),
				signingSecretNonce: dbBytes(encryptedSigningSecret.nonce),
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
		signingSecret: string
	}>,
	rawKey?: string
): Promise<Job | null> {
	// Ensure workspace scoping + not deleted before updating
	const existing = await db.job.findFirst({ where: { id, workspaceId, deletedAt: null } })
	if (!existing) return null

	try {
		const encryptedHeaders = data.headers === undefined ? null : encryptHeaders(data.headers, rawKey)
		const encryptedBody = data.bodyTemplate === undefined || data.bodyTemplate === null ? (data.bodyTemplate === null ? null : undefined) : encryptValue(data.bodyTemplate, rawKey)
		const headerUpdates = data.headers === undefined ? {} : {
			headers: {},
			headersCiphertext: dbBytes(encryptedHeaders!.ciphertext),
			headersNonce: dbBytes(encryptedHeaders!.nonce),
		}
		const bodyUpdates = data.bodyTemplate === undefined ? {} : {
			bodyTemplate: null,
			bodyTemplateCiphertext: encryptedBody ? dbBytes(encryptedBody.ciphertext) : null,
			bodyTemplateNonce: encryptedBody ? dbBytes(encryptedBody.nonce) : null,
		}
		const updates = {
				...(data.name !== undefined ? { name: data.name } : {}),
				...(data.description !== undefined ? { description: data.description } : {}),
				...(data.targetUrl !== undefined ? { targetUrl: data.targetUrl } : {}),
				...(data.httpMethod !== undefined ? { httpMethod: data.httpMethod as HttpMethod } : {}),
				...headerUpdates,
				...bodyUpdates,
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
		return updated ? mapJob(updated, rawKey) : null
	} catch (error: unknown) {
		if ((error as { code?: string }).code === 'P2002') {
			throw new JobNameTakenError(data.name ?? 'unknown')
		}
		throw error
	}
}

export async function rotateSigningSecret(
	db: PrismaClient,
	id: string,
	workspaceId: string,
	secret: string,
	rawKey: string,
): Promise<boolean> {
	const encrypted = encryptValue(secret, rawKey)
	const result = await db.job.updateMany({
		where: { id, workspaceId, deletedAt: null },
		data: { signingSecretCiphertext: dbBytes(encrypted.ciphertext), signingSecretNonce: dbBytes(encrypted.nonce), encryptionKeyVersion: 1, version: { increment: 1 } },
	})
	return result.count > 0
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
