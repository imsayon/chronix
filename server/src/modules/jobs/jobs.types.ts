export type Job = {
	id: string
	workspaceId: string
	name: string
	description: string | null
	targetUrl: string
	httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	headers: Record<string, string>
	bodyTemplate: string | null
	signingSecret: string | null
	timeoutMs: number
	isEnabled: boolean
	version: number
	deletedAt: Date | null
	createdAt: Date
	updatedAt: Date
}

export type CreateJobInput = {
	name: string
	description?: string | null
	targetUrl: string
	httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	headers?: Record<string, string>
	bodyTemplate?: string | null
	timeoutMs?: number
}

export type UpdateJobInput = Partial<CreateJobInput> & { version?: number }

export type ListJobsQuery = {
	cursor?: string
	limit?: number
	isEnabled?: boolean
}
