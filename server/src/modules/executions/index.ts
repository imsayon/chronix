import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { success } from '../../common/http/envelope.js'
import { buildRequestContext } from '../../common/auth.guards.js'
import { ValidationError } from '../../common/errors/http-errors.js'
import * as executionsService from './executions.service.js'

type WorkspaceParams = { workspaceId: string }
type ExecutionParams = WorkspaceParams & { executionId: string }

const listExecutionsSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	scheduleId: z.string().uuid().optional(),
	jobId: z.string().uuid().optional(),
	status: z.string().optional(),
	triggerType: z.string().optional(),
})

export function createExecutionsRouter(db: PrismaClient): Router {
	const router = Router({ mergeParams: true })

	router.get('/', (req: Request<WorkspaceParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId } = req.params
		const parsed = listExecutionsSchema.safeParse(req.query)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		executionsService.listExecutions(db, ctx, workspaceId, parsed.data as Parameters<typeof executionsService.listExecutions>[3])
			.then(r => res.json(success(res, r))).catch(next)
	})

	router.get('/:executionId', (req: Request<ExecutionParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, executionId } = req.params
		executionsService.getExecution(db, ctx, workspaceId, executionId)
			.then(r => res.json(success(res, r))).catch(next)
	})

	return router
}
