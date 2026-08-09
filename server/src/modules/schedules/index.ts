import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { success } from '../../common/http/envelope.js'
import { buildRequestContext } from '../../common/auth.guards.js'
import { ValidationError } from '../../common/errors/http-errors.js'
import * as schedulesService from './schedules.service.js'
import type { CreateScheduleInput, UpdateScheduleInput } from './schedules.types.js'

type WorkspaceParams = { workspaceId: string }
type ScheduleParams = WorkspaceParams & { scheduleId: string }

const createScheduleSchema = z.object({
	jobId: z.string().uuid(),
	name: z.string().min(1).max(255),
	description: z.string().max(1024).optional().nullable().default(null),
	scheduleType: z.enum(['cron', 'one_time']),
	cronExpression: z.string().optional().nullable(),
	timezone: z.string().optional(),
	runAt: z.coerce.date().optional().nullable(),
	misfirePolicy: z.enum(['coalesce', 'skip', 'catch_up']).optional(),
	maxRetries: z.number().int().min(0).max(10).optional(),
	retryBackoffBaseMs: z.number().int().min(1000).max(86400000).optional()
}).refine((data) => {
	if (data.scheduleType === 'cron' && (!data.cronExpression || data.runAt)) return false
	if (data.scheduleType === 'one_time' && (!data.runAt || data.cronExpression)) return false
	return true
}, { message: "Invalid combination of scheduleType, cronExpression, and runAt" })

const updateScheduleSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(1024).optional().nullable(),
	cronExpression: z.string().optional().nullable(),
	timezone: z.string().optional(),
	runAt: z.coerce.date().optional().nullable(),
	misfirePolicy: z.enum(['coalesce', 'skip', 'catch_up']).optional(),
	maxRetries: z.number().int().min(0).max(10).optional(),
	retryBackoffBaseMs: z.number().int().min(1000).max(86400000).optional()
})

const listSchedulesSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	status: z.enum(['active', 'paused', 'completed', 'error']).optional(),
	jobId: z.string().uuid().optional(),
})

export function createSchedulesRouter(db: PrismaClient): Router {
	const router = Router({ mergeParams: true })

	router.post('/', (req: Request<WorkspaceParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId } = req.params
		const parsed = createScheduleSchema.safeParse(req.body)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		schedulesService.createSchedule(db, ctx, workspaceId, parsed.data as unknown as CreateScheduleInput)
			.then(r => res.status(201).json(success(res, r))).catch(next)
	})

	router.get('/', (req: Request<WorkspaceParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId } = req.params
		const parsed = listSchedulesSchema.safeParse(req.query)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		schedulesService.listSchedules(db, ctx, workspaceId, parsed.data as Parameters<typeof schedulesService.listSchedules>[3])
			.then(r => res.json(success(res, r))).catch(next)
	})

	router.get('/:scheduleId', (req: Request<ScheduleParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, scheduleId } = req.params
		schedulesService.getSchedule(db, ctx, workspaceId, scheduleId)
			.then(r => res.json(success(res, r))).catch(next)
	})

	router.patch('/:scheduleId', (req: Request<ScheduleParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, scheduleId } = req.params
		const parsed = updateScheduleSchema.safeParse(req.body)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		schedulesService.updateSchedule(db, ctx, workspaceId, scheduleId, parsed.data as UpdateScheduleInput)
			.then(r => res.json(success(res, r))).catch(next)
	})

	router.post('/:scheduleId/pause', (req: Request<ScheduleParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, scheduleId } = req.params
		schedulesService.pauseSchedule(db, ctx, workspaceId, scheduleId)
			.then(r => res.json(success(res, r))).catch(next)
	})

	router.post('/:scheduleId/resume', (req: Request<ScheduleParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, scheduleId } = req.params
		schedulesService.resumeSchedule(db, ctx, workspaceId, scheduleId)
			.then(r => res.json(success(res, r))).catch(next)
	})

	router.post('/:scheduleId/trigger', (req: Request<ScheduleParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, scheduleId } = req.params
		schedulesService.triggerManual(db, ctx, workspaceId, scheduleId)
			.then(r => res.status(202).json(success(res, r))).catch(next)
	})

	router.delete('/:scheduleId', (req: Request<ScheduleParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, scheduleId } = req.params
		schedulesService.deleteSchedule(db, ctx, workspaceId, scheduleId)
			.then(() => res.status(204).end()).catch(next)
	})

	return router
}
