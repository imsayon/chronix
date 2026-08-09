export type Schedule = {
	id: string
	workspaceId: string
	jobId: string
	name: string
	description: string | null
	scheduleType: 'cron' | 'one_time'
	cronExpression: string | null
	timezone: string
	runAt: Date | null
	nextRunAt: Date | null
	status: 'active' | 'paused' | 'completed' | 'error'
	misfirePolicy: 'coalesce' | 'skip' | 'catch_up'
	maxRetries: number
	retryBackoffBaseMs: number
	lastClaimedAt: Date | null
	lastClaimedBy: string | null
	leaseExpiresAt: Date | null
	version: number
	deletedAt: Date | null
	createdAt: Date
	updatedAt: Date
}

export type ScheduleClaimCandidate = {
	id: string
	version: number
	jobId: string
	workspaceId: string
	scheduleType: 'cron' | 'one_time'
	cronExpression: string | null
	timezone: string
	runAt: Date | null
	nextRunAt: Date
	misfirePolicy: 'coalesce' | 'skip' | 'catch_up'
	maxRetries: number
	retryBackoffBaseMs: number
}

export type CreateScheduleInput = {
	jobId: string
	name: string
	description?: string | null
	scheduleType: 'cron' | 'one_time'
	cronExpression?: string | null
	timezone?: string
	runAt?: Date | null
	misfirePolicy?: 'coalesce' | 'skip' | 'catch_up'
	maxRetries?: number
	retryBackoffBaseMs?: number
}

export type UpdateScheduleInput = {
	version?: number
	name?: string
	description?: string | null
	cronExpression?: string | null
	timezone?: string
	runAt?: Date | null
	misfirePolicy?: 'coalesce' | 'skip' | 'catch_up'
	maxRetries?: number
	retryBackoffBaseMs?: number
}

export type ListSchedulesQuery = {
	cursor?: string
	limit?: number
	status?: 'active' | 'paused' | 'completed' | 'error'
	jobId?: string
}
