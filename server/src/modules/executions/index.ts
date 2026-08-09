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
	cursor: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	scheduleId: z.string().uuid().optional(),
	jobId: z.string().uuid().optional(),
	status: z.string().optional(),
	triggerType: z.string().optional(),
})
const exportExecutionsSchema = z.object({ limit: z.coerce.number().int().min(1).max(10_000).default(10_000) })

function csv(value: unknown): string {
	const text = value instanceof Date ? value.toISOString() : String(value ?? '')
	return `"${text.replaceAll('"', '""')}"`
}

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

	router.get('/export', (req: Request<WorkspaceParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const parsed = exportExecutionsSchema.safeParse(req.query)
		if (!parsed.success) return void next(new ValidationError(parsed.error.issues))
		executionsService.exportExecutions(db, ctx, req.params.workspaceId, parsed.data.limit)
			.then((result) => {
				res.status(200).type('text/csv')
				res.write('id,job_id,schedule_id,status,trigger_type,attempt_count,created_at,terminal_at\n')
				for (const execution of result.executions) {
					res.write([execution.id, execution.jobId, execution.scheduleId, execution.status, execution.triggerType, execution.attemptCount, execution.createdAt, execution.terminalAt].map(csv).join(',') + '\n')
				}
				res.end()
			})
			.catch(next)
	})

	router.get('/:executionId', (req: Request<ExecutionParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId, executionId } = req.params
		executionsService.getExecution(db, ctx, workspaceId, executionId)
			.then(r => res.json(success(res, r))).catch(next)
	})

	return router
}
