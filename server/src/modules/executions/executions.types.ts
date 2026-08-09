export type Execution = {
	id: string
	workspaceId: string
	scheduleId: string
	jobId: string
	triggerType: 'scheduled' | 'manual'
	triggeredBy: string | null
	nominalRunAt: Date
	idempotencyKey: string
	status: 'pending' | 'claimed' | 'running' | 'succeeded' | 'failed' | 'dead_lettered'
	attemptCount: number
	maxRetries: number
	retryBackoffBaseMs: number
	nextRetryAt: Date | null
	leaseHolderId: string | null
	leaseExpiresAt: Date | null
	leaseGeneration: number
	terminalAt: Date | null
	version: number
	createdAt: Date
	updatedAt: Date
	scheduleName?: string
	jobName?: string
}

export type ExecutionAttempt = {
	id: string
	executionId: string
	workspaceId: string
	attemptNumber: number
	workerId: string
	startedAt: Date
	finishedAt: Date | null
	outcome: string | null
	httpStatusCode: number | null
	durationMs: number | null
	responseBodySample: string | null
	errorMessage: string | null
	idempotencyKey: string
	requestHeadersSent: Record<string, string>
	createdAt: Date
}

export type ListExecutionsQuery = {
	cursor?: string
	limit?: number
	scheduleId?: string
	jobId?: string
	status?: string
	triggerType?: string
	[key: string]: unknown
}
