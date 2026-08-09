import { describe, expect, it, vi } from 'vitest'
import type { request } from 'undici'
import { createDeliveryClient } from './client.js'

const context = {
	executionId: 'execution-1',
	attemptNumber: 1,
	scheduleId: 'schedule-1',
	jobId: 'job-1',
	workspaceId: 'workspace-1',
}

function bodyOf(text: string) {
	return {
		async *[Symbol.asyncIterator]() {
			yield Buffer.from(text)
		},
		destroy: vi.fn(),
	}
}

describe('secure delivery client', () => {
	it('rejects blocked DNS results before making a request', async () => {
		const requestFn = vi.fn()
		const client = createDeliveryClient({
			resolve: async () => [{ address: '127.0.0.1', family: 4 }],
			requestFn: requestFn as unknown as typeof request,
		})

		const response = await client.deliver({ url: 'https://internal.example/webhook', method: 'POST', headers: {}, body: '{}', timeoutMs: 5_000, chronixHeaders: context })
		expect(response.outcome).toBe('ssrf_blocked')
		expect(requestFn).not.toHaveBeenCalled()
	})

	it('revalidates redirect destinations instead of following unsafe redirects', async () => {
		const requestFn = vi.fn().mockResolvedValue({ statusCode: 302, headers: { location: 'http://internal.example/' }, body: bodyOf('redirect') })
		const client = createDeliveryClient({
			resolve: async (hostname) => hostname === 'public.example' ? [{ address: '8.8.8.8', family: 4 }] : [{ address: '10.0.0.1', family: 4 }],
			requestFn: requestFn as unknown as typeof request,
		})

		const response = await client.deliver({ url: 'https://public.example/webhook', method: 'POST', headers: {}, body: '{}', timeoutMs: 5_000, chronixHeaders: context })
		expect(response.outcome).toBe('ssrf_blocked')
		expect(requestFn).toHaveBeenCalledTimes(1)
	})

	it('bounds response capture while preserving the truncation marker', async () => {
		const requestFn = vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: bodyOf('x'.repeat(70_000)) })
		const client = createDeliveryClient({
			resolve: async () => [{ address: '8.8.8.8', family: 4 }],
			requestFn: requestFn as unknown as typeof request,
		})

		const response = await client.deliver({ url: 'https://public.example/webhook', method: 'POST', headers: {}, body: '{}', timeoutMs: 5_000, chronixHeaders: context })
		expect(response.outcome).toBe('success')
		expect(response.responseBodySample).toContain('…[truncated]')
		expect(response.responseBodySample!.length).toBeLessThan(66_000)
	})
})
