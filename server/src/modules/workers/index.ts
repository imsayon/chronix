import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { success } from '../../common/http/envelope.js'
import { buildRequestContext } from '../../common/auth.guards.js'
import * as workersService from './workers.service.js'

type WorkspaceParams = { workspaceId: string }

export function createWorkersRouter(db: PrismaClient): Router {
	const router = Router({ mergeParams: true })

	router.get('/', (req: Request<WorkspaceParams>, res: Response, next: NextFunction) => {
		const ctx = buildRequestContext(req, res)
		const { workspaceId } = req.params

		workersService.listWorkers(db, ctx, workspaceId)
			.then(r => res.json(success(res, r)))
			.catch(next)
	})

	return router
}
