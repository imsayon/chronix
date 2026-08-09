import type { PrismaClient } from '../../generated/prisma/client.js'
import type { RequestContext } from '../../common/auth.types.js'
import { requireWorkspaceAccess, requireScope } from '../../common/auth.guards.js'
import { NotFoundError } from '../../common/errors/http-errors.js'
import { writeAuditEvent } from '../../common/audit.js'
import { advisorySsrfCheck } from '../../infra/http-client/ssrf-check.js'
import * as repo from './jobs.repository.js'
import type { CreateJobInput, UpdateJobInput, ListJobsQuery, Job } from './jobs.types.js'
import { JobNotFoundError, JobHasActiveSchedulesError } from './jobs.errors.js'

export async function createJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, input: CreateJobInput): Promise<Job> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	await advisorySsrfCheck(input.targetUrl)
	const job = await repo.insertJob(db, {
		workspaceId,
		...input
	})
	await writeAuditEvent(db, ctx, workspaceId, 'job.created', { jobId: job.id, name: job.name })
	return job
}

export async function listJobs(db: PrismaClient, ctx: RequestContext, workspaceId: string, query: ListJobsQuery) {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:read')
	return repo.findJobsByWorkspace(db, workspaceId, query)
}

export async function getJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string): Promise<Job> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:read')
	const job = await repo.findJobById(db, jobId, workspaceId)
	if (!job) {
		throw new JobNotFoundError(jobId)
	}
	return job
}

export async function updateJob(db: PrismaClient, ctx: RequestContext, workspaceId: string, jobId: string, input: UpdateJobInput): Promise<Job> {
	requireWorkspaceAccess(ctx, workspaceId)
	requireScope(ctx, 'schedules:write')
	if (input.targetUrl) {
		await advisorySsrfCheck(input.targetUrl)
	}
	const job = await repo.updateJobProperly(db, jobId, workspaceId, input)
	if (!job) {
		throw new NotFoundError(`Job ${jobId} not found.`)
	}
	await writeAuditEvent(db, ctx, workspaceId, 'job.updated', { jobId: job.id, updates: Object.keys(input) })
	return job
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
