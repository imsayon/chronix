import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { createScheduleSchema, listSchedulesSchema, updateScheduleSchema } from '../../modules/schedules/index.js'
import { listJobsSchema } from '../../modules/jobs/index.js'

const responseSchema = z.object({
	data: z.unknown(),
	meta: z.object({ requestId: z.string() }),
})

const errorSchema = z.object({
	error: z.object({ code: z.string(), message: z.string(), details: z.array(z.unknown()).optional() }),
	meta: z.object({ requestId: z.string() }),
})

export function buildOpenApiDocument(): Record<string, unknown> {
	const registry = new OpenAPIRegistry()
	registry.registerComponent('securitySchemes', 'bearerAuth', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
	})

	registry.registerPath({
		method: 'get',
		path: '/api/v1/workspaces/{workspaceId}/jobs',
		tags: ['Jobs'],
		security: [{ bearerAuth: [] }],
		request: { params: z.object({ workspaceId: z.string().uuid() }), query: listJobsSchema },
		responses: { 200: { description: 'Bounded cursor-paginated jobs', content: { 'application/json': { schema: responseSchema } } }, 401: { description: 'Authentication required', content: { 'application/json': { schema: errorSchema } } } },
	})
	registry.registerPath({
		method: 'get',
		path: '/api/v1/workspaces/{workspaceId}/schedules',
		tags: ['Schedules'],
		security: [{ bearerAuth: [] }],
		request: { params: z.object({ workspaceId: z.string().uuid() }), query: listSchedulesSchema },
		responses: { 200: { description: 'Bounded cursor-paginated schedules', content: { 'application/json': { schema: responseSchema } } }, 401: { description: 'Authentication required', content: { 'application/json': { schema: errorSchema } } } },
	})
	registry.registerPath({
		method: 'post',
		path: '/api/v1/workspaces/{workspaceId}/schedules',
		tags: ['Schedules'],
		security: [{ bearerAuth: [] }],
		request: { params: z.object({ workspaceId: z.string().uuid() }), body: { content: { 'application/json': { schema: createScheduleSchema } } } },
		responses: { 201: { description: 'Schedule created', content: { 'application/json': { schema: responseSchema } } }, 400: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } } },
	})
	registry.registerPath({
		method: 'patch',
		path: '/api/v1/workspaces/{workspaceId}/schedules/{scheduleId}',
		tags: ['Schedules'],
		security: [{ bearerAuth: [] }],
		request: { params: z.object({ workspaceId: z.string().uuid(), scheduleId: z.string().uuid() }), body: { content: { 'application/json': { schema: updateScheduleSchema } } } },
		responses: { 200: { description: 'Schedule updated', content: { 'application/json': { schema: responseSchema } } }, 409: { description: 'Version conflict', content: { 'application/json': { schema: errorSchema } } } },
	})
	registry.registerPath({
		method: 'post',
		path: '/api/v1/workspaces/{workspaceId}/schedules/{scheduleId}/trigger',
		tags: ['Executions'],
		security: [{ bearerAuth: [] }],
		request: { params: z.object({ workspaceId: z.string().uuid(), scheduleId: z.string().uuid() }), headers: z.object({ 'Idempotency-Key': z.string().min(1).max(128).optional() }) },
		responses: { 202: { description: 'Execution accepted', content: { 'application/json': { schema: responseSchema } } }, 409: { description: 'Duplicate or conflicting request', content: { 'application/json': { schema: errorSchema } } } },
	})

	return new OpenApiGeneratorV31(registry.definitions).generateDocument({
		openapi: '3.1.0',
		info: { title: 'Chronix API', version: '0.1.0', description: 'Webhook-only, durable multi-tenant scheduler API.' },
		servers: [{ url: '/api/v1' }],
		tags: [{ name: 'Jobs' }, { name: 'Schedules' }, { name: 'Executions' }],
	}) as unknown as Record<string, unknown>
}
