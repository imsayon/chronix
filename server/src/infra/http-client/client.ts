import { request, Agent, setGlobalDispatcher } from 'undici'
import type { Dispatcher } from 'undici'
import * as dns from 'node:dns'
import net from 'node:net'
import { isIpBlocked, SsrfBlockedError } from './ssrf-check.js'
import type { AttemptOutcome } from '../../generated/prisma/client.js'

export type WebhookResponse = {
	outcome: AttemptOutcome
	statusCode: number | null
	durationMs: number
	responseBodySample: string | null
	errorMessage: string | null
}

const resolveV4 = (hostname: string): Promise<string[]> =>
	new Promise((resolve, reject) => {
		dns.resolve4(hostname, (err, addresses) => {
			if (err) return reject(err)
			resolve(addresses)
		})
	})

const resolveV6 = (hostname: string): Promise<string[]> =>
	new Promise((resolve, reject) => {
		dns.resolve6(hostname, (err, addresses) => {
			if (err) return reject(err)
			resolve(addresses)
		})
	})

/**
 * Custom agent that enforces SSRF protection by manually resolving DNS,
 * verifying the IP against the blocklist, and then connecting directly
 * to that verified IP to prevent DNS rebinding attacks.
 */
const ssrfProtectedAgent = new Agent({
	connect: async (opts, callback) => {
		const { hostname, port, protocol } = opts

		try {
			// Fast path: if the hostname is already an IP address, just check it
			let targetIp = hostname
			if (net.isIP(hostname)) {
				if (isIpBlocked(hostname)) {
					return callback(new SsrfBlockedError(`Direct IP connection to blocked address (${hostname}) is not allowed`), null)
				}
			} else {
				// Resolve DNS explicitly
				const ips: string[] = []
				try {
					ips.push(...(await resolveV4(hostname)))
				} catch {
					// Ignore ENOTFOUND
				}
				try {
					ips.push(...(await resolveV6(hostname)))
				} catch {
					// Ignore ENOTFOUND
				}

				if (ips.length === 0) {
					return callback(new Error(`ENOTFOUND: Could not resolve ${hostname}`), null)
				}

				// Check all resolved IPs against the blocklist
				for (const ip of ips) {
					if (isIpBlocked(ip)) {
						return callback(new SsrfBlockedError(`Hostname ${hostname} resolves to a blocked address (${ip})`), null)
					}
				}

				// Use the first valid IP for the actual connection
				targetIp = ips[0] as string
			}

			// Perform the actual TCP/TLS connection to the verified IP
			const connectOptions = {
				host: targetIp,
				port: Number(port),
				servername: protocol === 'https:' ? hostname : undefined, // SNI must be the hostname, not the IP
			}

			if (protocol === 'https:') {
				import('node:tls').then((tls) => {
					const socket = tls.connect(connectOptions)
					callback(null, socket)
				}).catch((err: Error) => callback(err, null))
			} else {
				const socket = net.connect(connectOptions)
				callback(null, socket)
			}
		} catch (error) {
			callback(error as Error, null)
		}
	}
})

// Enforce SSRF protection globally for undici requests in this module
setGlobalDispatcher(ssrfProtectedAgent)

export async function executeWebhook(
	url: string,
	method: string,
	headers: Record<string, string>,
	body: string | null,
	timeoutMs: number,
	chronixHeaders: {
		executionId: string
		attemptNumber: number
		scheduleId: string
		jobId: string
		workspaceId: string
	}
): Promise<WebhookResponse> {
	const startTime = process.hrtime.bigint()

	const reqHeaders = {
		...headers,
		'User-Agent': 'Chronix-Webhook-Dispatcher/1.0',
		'X-Chronix-Execution-Id': chronixHeaders.executionId,
		'X-Chronix-Attempt-Number': chronixHeaders.attemptNumber.toString(),
		'X-Chronix-Schedule-Id': chronixHeaders.scheduleId,
		'X-Chronix-Job-Id': chronixHeaders.jobId,
		'X-Chronix-Workspace-Id': chronixHeaders.workspaceId,
	}

	try {
		const res = await request(url, {
			method: method as Dispatcher.HttpMethod,
			headers: reqHeaders,
			...(body === null ? {} : { body }),
			bodyTimeout: timeoutMs,
			headersTimeout: timeoutMs,
			dispatcher: ssrfProtectedAgent,
		})

		const endTime = process.hrtime.bigint()
		const durationMs = Number(endTime - startTime) / 1_000_000

		let outcome: AttemptOutcome
		if (res.statusCode >= 200 && res.statusCode < 300) {
			outcome = 'success'
		} else if (res.statusCode >= 400 && res.statusCode < 500) {
			outcome = 'client_error'
		} else {
			outcome = 'server_error'
		}

		const responseText = await res.body.text()
		const responseBodySample = responseText.length > 2048
			? responseText.slice(0, 2048) + '... (truncated)'
			: responseText

		return {
			outcome,
			statusCode: res.statusCode,
			durationMs: Math.round(durationMs),
			responseBodySample,
			errorMessage: null
		}

	} catch (error: unknown) {
		const endTime = process.hrtime.bigint()
		const durationMs = Math.round(Number(endTime - startTime) / 1_000_000)
		const message = error instanceof Error ? error.message : "Unknown delivery failure"
		const code = typeof error === "object" && error !== null && "code" in error
			? error.code
			: undefined

		if (error instanceof SsrfBlockedError || message.includes('blocked address')) {
			return {
				outcome: 'ssrf_blocked',
				statusCode: null,
				durationMs,
				responseBodySample: null,
				errorMessage: message
			}
		}

		if (code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT' || message.toLowerCase().includes('timeout')) {
			return {
				outcome: 'timeout',
				statusCode: null,
				durationMs,
				responseBodySample: null,
				errorMessage: message
			}
		}

		return {
			outcome: 'network_error',
			statusCode: null,
			durationMs,
			responseBodySample: null,
			errorMessage: message
		}
	}
}
