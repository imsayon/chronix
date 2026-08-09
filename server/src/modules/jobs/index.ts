import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { success } from '../../common/http/envelope.js'
import { buildRequestContext } from '../../common/auth.guards.js'
import { ValidationError } from '../../common/errors/http-errors.js'
import * as service from './jobs.service.js'

type WorkspaceParams = { workspaceId: string }
type JobParams = WorkspaceParams & { jobId: string }

const createJobSchema = z.object({
	name: z.string().min(1).max(100).trim(),
	description: z.string().max(500).trim().optional().nullable().default(null),
	targetUrl: z.string().url().max(2048),
	httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
	headers: z.record(z.string(), z.string()).default({}),
	bodyTemplate: z.string().max(65536).optional().nullable().default(null),
	timeoutMs: z.coerce.number().int().min(1000).max(300000).default(30000),
})

const updateJobSchema = z.object({
	name: z.string().min(1).max(100).trim().optional(),
	description: z.string().max(500).trim().nullable().optional(),
	targetUrl: z.string().url().max(2048).optional(),
	httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	bodyTemplate: z.string().max(65536).nullable().optional(),
	timeoutMs: z.coerce.number().int().min(1000).max(300000).optional(),
})

const listJobsSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	isEnabled: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
})

export function createJobsRouter(db: PrismaClient): Router {
	const router = Router({ mergeParams: true })

	router.get('/', (req: Request<WorkspaceParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId } = req.params
		const parsed = listJobsSchema.safeParse(req.query)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		service.listJobs(db, ctx, workspaceId, parsed.data as Parameters<typeof service.listJobs>[3]).then(r => res.json(success(res, r))).catch(next)
	})

	router.post('/', (req: Request<WorkspaceParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId } = req.params
		const parsed = createJobSchema.safeParse(req.body)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		service.createJob(db, ctx, workspaceId, parsed.data).then(r => res.status(201).json(success(res, r))).catch(next)
	})

	router.get('/:jobId', (req: Request<JobParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, jobId } = req.params
		service.getJob(db, ctx, workspaceId, jobId).then(r => res.json(success(res, r))).catch(next)
	})

	router.patch('/:jobId', (req: Request<JobParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, jobId } = req.params
		const parsed = updateJobSchema.safeParse(req.body)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		service.updateJob(db, ctx, workspaceId, jobId, parsed.data as Parameters<typeof service.updateJob>[4]).then(r => res.json(success(res, r))).catch(next)
	})

	router.post('/:jobId/enable', (req: Request<JobParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, jobId } = req.params
		service.enableJob(db, ctx, workspaceId, jobId).then(r => res.json(success(res, r))).catch(next)
	})

	router.post('/:jobId/disable', (req: Request<JobParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, jobId } = req.params
		service.disableJob(db, ctx, workspaceId, jobId).then(r => res.json(success(res, r))).catch(next)
	})

	router.delete('/:jobId', (req: Request<JobParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, jobId } = req.params
		service.deleteJob(db, ctx, workspaceId, jobId).then(() => res.status(204).end()).catch(next)
	})

	return router
}
