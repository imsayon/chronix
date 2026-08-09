import type { PrismaClient } from '../../generated/prisma/client.js'

export async function pruneExpiredExecutions(db: PrismaClient, now = new Date(), batchSize = 1_000): Promise<number> {
	const workspaces = await db.workspace.findMany({ where: { deletedAt: null }, select: { id: true, retentionDays: true } })
	let deleted = 0
	for (const workspace of workspaces) {
		const cutoff = new Date(now.getTime() - workspace.retentionDays * 86_400_000)
		const candidates = await db.execution.findMany({
			where: { workspaceId: workspace.id, terminalAt: { lt: cutoff } },
			select: { id: true },
			take: batchSize,
			orderBy: { terminalAt: 'asc' },
		})
		if (candidates.length === 0) continue
		const result = await db.execution.deleteMany({ where: { id: { in: candidates.map((candidate) => candidate.id) }, workspaceId: workspace.id, terminalAt: { lt: cutoff } } })
		deleted += result.count
	}
	return deleted
}
