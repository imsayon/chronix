import type { PrismaClient } from '../../generated/prisma/client.js'
import { randomBytes } from 'node:crypto'
import type { RequestContext } from '../../common/auth.types.js'
import { requireWorkspaceAccess, requireScope, requireDashboardAuth, requireWorkspaceRole } from '../../common/auth.guards.js'
import { NotFoundError, VersionConflictError } from '../../common/errors/http-errors.js'
import { writeAuditEvent } from '../../common/audit.js'
import { advisorySsrfCheck } from '../../infra/http-client/ssrf-check.js'
import * as repo from './jobs.repository.js'
import type { CreateJobInput, UpdateJobInput, ListJobsQuery, Job } from './jobs.types.js'
import { JobNotFoundError, JobHasActiveSchedulesError } from './jobs.errors.js'

export type CreatedJob = { job: Job; signingSecret: string }

export function redactJob(job: Job): Job {
	return { ...job, headers: Object.fromEntries(Object.keys(job.headers).map((name) => [name, '[REDACTED]'])), bodyTemplate: null }
}

export async function createJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, input: CreateJobInput, encryptionKey: string): Promise<CreatedJob> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	await advisorySsrfCheck(input.targetUrl)
	const signingSecret = randomBytes(32).toString('base64url')
	const job = await repo.insertJob(db, {
		workspaceId,
		...input,
		signingSecret,
	}, encryptionKey)
	await writeAuditEvent(db, ctx, workspaceId, 'job.created', { jobId: job.id, name: job.name })
	return { job, signingSecret }
}

export async function listJobs(db: PrismaClient, ctx: RequestContext, workspaceId: string, query: ListJobsQuery, encryptionKey: string) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:read')
	const result = await repo.findJobsByWorkspace(db, workspaceId, query, encryptionKey)
	return { ...result, jobs: result.jobs.map(redactJob) }
}

export async function getJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string, encryptionKey?: string): Promise<Job> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:read')
	const job = await repo.findJobById(db, jobId, workspaceId, encryptionKey)
	if (!job) {
		throw new JobNotFoundError(jobId)
	}
	return redactJob(job)
}

export async function updateJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string, input: UpdateJobInput, encryptionKey: string): Promise<Job> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	if (input.targetUrl) {
		await advisorySsrfCheck(input.targetUrl)
	}
	const job = await repo.updateJobProperly(db, jobId, workspaceId, input, encryptionKey)
	if (!job) {
		if (input.version !== undefined) throw new VersionConflictError()
		throw new NotFoundError(`Job ${jobId} not found.`)
	}
	await writeAuditEvent(db, ctx, workspaceId, 'job.updated', { jobId: job.id, updates: Object.keys(input) })
	return redactJob(job)
}

export async function enableJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string): Promise<Job> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	const job = await repo.updateJobProperly(db, jobId, workspaceId, { isEnabled: true })
	if (!job) {
		throw new NotFoundError(`Job ${jobId} not found.`)
	}
	await writeAuditEvent(db, ctx, workspaceId, 'job.enabled', { jobId: job.id })
	return job
}

export async function disableJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string): Promise<Job> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	const job = await repo.updateJobProperly(db, jobId, workspaceId, { isEnabled: false })
	if (!job) {
		throw new NotFoundError(`Job ${jobId} not found.`)
	}
	await writeAuditEvent(db, ctx, workspaceId, 'job.disabled', { jobId: job.id })
	return job
}

export async function deleteJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string): Promise<void> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	await getJob(db, ctx, workspaceId, jobId)

	const count = await repo.countActiveSchedulesForJob(db, jobId)
	if (count > 0) {
		throw new JobHasActiveSchedulesError(jobId)
	}

	await repo.softDeleteJob(db, jobId, workspaceId)
	await writeAuditEvent(db, ctx, workspaceId, 'job.deleted', { jobId })
}

export async function rotateSigningSecret(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string, encryptionKey: string): Promise<{ job: Job; signingSecret: string }> {
	requireDashboardAuth(ctx)
	requireWorkspaceAccess(ctx, workspaceId)
	requireWorkspaceRole(ctx, 'admin')
	const job = await repo.findJobById(db, jobId, workspaceId, encryptionKey)
	if (!job) throw new JobNotFoundError(jobId)
	const signingSecret = randomBytes(32).toString('base64url')
	const rotated = await repo.rotateSigningSecret(db, jobId, workspaceId, signingSecret, encryptionKey)
	if (!rotated) throw new JobNotFoundError(jobId)
	await writeAuditEvent(db, ctx, workspaceId, 'job.signing_secret_rotated', { jobId })
	return { job: redactJob(job), signingSecret }
}
