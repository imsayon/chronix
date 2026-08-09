import { request, Agent } from 'undici'
import type { Dispatcher } from 'undici'
import * as dns from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import type { AttemptOutcome } from '../../generated/prisma/client.js'
import { isIpBlocked, SsrfBlockedError } from './ssrf-check.js'

const MAX_URL_LENGTH = 2_048
const MAX_HEADER_COUNT = 64
const MAX_HEADER_NAME_LENGTH = 256
const MAX_HEADER_VALUE_LENGTH = 8_192
const MAX_HEADER_BYTES = 64 * 1_024
const MAX_BODY_BYTES = 1 * 1_024 * 1_024
const MAX_RESPONSE_BYTES = 64 * 1_024
const MAX_REDIRECTS = 3
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const FORBIDDEN_HEADERS = new Set(['connection', 'content-length', 'expect', 'host', 'proxy-connection', 'transfer-encoding', 'upgrade'])

export type WebhookResponse = {
	outcome: AttemptOutcome
	statusCode: number | null
	durationMs: number
	responseBodySample: string | null
	errorMessage: string | null
}

export type DeliveryRequest = {
	url: string
	method: string
	headers: Record<string, string>
	body: string | null
	timeoutMs: number
	chronixHeaders: {
		executionId: string
		attemptNumber: number
		scheduleId: string
		jobId: string
		workspaceId: string
	}
}

export interface DeliveryClient {
	deliver(input: DeliveryRequest): Promise<WebhookResponse>
}

type ResolvedAddress = { address: string; family: 4 | 6 }
type Resolver = (hostname: string) => Promise<readonly ResolvedAddress[]>
type RequestFunction = typeof request

function hostnameFor(url: URL): string {
	return url.hostname.replace(/^\[|\]$/g, '')
}

async function resolveSafeAddress(url: URL, resolver: Resolver): Promise<ResolvedAddress> {
	const hostname = hostnameFor(url)
	const literalFamily = net.isIP(hostname)
	if (literalFamily === 4 || literalFamily === 6) {
		if (isIpBlocked(hostname, literalFamily)) throw new SsrfBlockedError('Address is in a blocked network range.')
		return { address: hostname, family: literalFamily }
	}

	let addresses: readonly ResolvedAddress[]
	try {
		addresses = await resolver(hostname)
	} catch {
		throw new SsrfBlockedError('Hostname could not be resolved.')
	}
	if (addresses.length === 0 || addresses.some(({ address, family }) => isIpBlocked(address, family))) {
		throw new SsrfBlockedError('Hostname resolves to a blocked network range.')
	}
	const selected = addresses[0]
	if (!selected) throw new SsrfBlockedError('Hostname could not be resolved.')
	return selected
}

function validateInput(input: DeliveryRequest): void {
	if (input.url.length === 0 || input.url.length > MAX_URL_LENGTH) throw new SsrfBlockedError('URL exceeds the allowed length.')
	let url: URL
	try {
		url = new URL(input.url)
	} catch {
		throw new SsrfBlockedError('URL is invalid.')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SsrfBlockedError('Protocol not allowed; use HTTP or HTTPS.')
	if (url.username || url.password) throw new SsrfBlockedError('Embedded credentials are not allowed.')
	if (!ALLOWED_METHODS.has(input.method.toUpperCase())) throw new Error(`HTTP method ${input.method} is not allowed.`)
	if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1_000 || input.timeoutMs > 300_000) throw new Error('Timeout must be between 1000 and 300000 milliseconds.')
	if (input.body !== null && Buffer.byteLength(input.body, 'utf8') > MAX_BODY_BYTES) throw new Error('Request body exceeds the allowed size.')
	const entries = Object.entries(input.headers)
	if (entries.length > MAX_HEADER_COUNT) throw new Error('Too many request headers.')
	let totalBytes = 0
	for (const [name, value] of entries) {
		if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || name.length > MAX_HEADER_NAME_LENGTH) throw new Error(`Invalid request header: ${name}`)
		if (FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new Error(`Request header is not allowed: ${name}`)
		if (value.length > MAX_HEADER_VALUE_LENGTH) throw new Error(`Request header is too long: ${name}`)
		totalBytes += Buffer.byteLength(name) + Buffer.byteLength(value)
	}
	if (totalBytes > MAX_HEADER_BYTES) throw new Error('Request headers exceed the allowed size.')
}

function pinnedAgent(url: URL, address: ResolvedAddress): Agent {
	const hostname = hostnameFor(url)
	return new Agent({
		connect: (options, callback) => {
			const connectOptions = { host: address.address, port: Number(options.port), family: address.family }
			if (options.protocol === 'https:') {
				const socket = tls.connect({ ...connectOptions, servername: hostname })
				socket.once('error', (error) => callback(error, null))
				socket.once('connect', () => callback(null, socket))
				return
			}
			const socket = net.connect(connectOptions)
			socket.once('error', (error) => callback(error, null))
			socket.once('connect', () => callback(null, socket))
		},
	})
}

async function captureResponseBody(body: AsyncIterable<Uint8Array> & { destroy?: () => void }): Promise<string> {
	const chunks: Uint8Array[] = []
	let size = 0
	let truncated = false
	for await (const chunk of body) {
		if (size >= MAX_RESPONSE_BYTES) {
			truncated = true
			body.destroy?.()
			break
		}
		const remaining = MAX_RESPONSE_BYTES - size
		const part = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk
		chunks.push(part)
		size += part.byteLength
		if (part.byteLength < chunk.byteLength) {
			truncated = true
			body.destroy?.()
			break
		}
	}
	return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8') + (truncated ? '\n…[truncated]' : '')
}

function classifyStatus(statusCode: number): AttemptOutcome {
	if (statusCode >= 200 && statusCode < 300) return 'success'
	if (statusCode >= 400 && statusCode < 500) return 'client_error'
	return 'server_error'
}

export function createDeliveryClient(options: {
	resolve?: Resolver
	requestFn?: RequestFunction
	} = {}): DeliveryClient {
	const resolver: Resolver = options.resolve ?? (async (hostname) => (await dns.lookup(hostname, { all: true, verbatim: true })) as ResolvedAddress[])
	const requestFn = options.requestFn ?? request

	return {
		async deliver(input) {
			const startTime = process.hrtime.bigint()
			try {
				validateInput(input)
				let currentUrl = new URL(input.url)
				let method = input.method.toUpperCase()
				let body = input.body

				for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
					const address = await resolveSafeAddress(currentUrl, resolver)
					const agent = pinnedAgent(currentUrl, address)
					try {
						const response = await requestFn(currentUrl, {
							method,
							headers: {
								...input.headers,
								'User-Agent': 'Chronix-Webhook-Dispatcher/1.0',
								'X-Chronix-Execution-Id': input.chronixHeaders.executionId,
								'X-Chronix-Attempt-Number': String(input.chronixHeaders.attemptNumber),
								'X-Chronix-Schedule-Id': input.chronixHeaders.scheduleId,
								'X-Chronix-Job-Id': input.chronixHeaders.jobId,
								'X-Chronix-Workspace-Id': input.chronixHeaders.workspaceId,
							},
							...(body === null ? {} : { body }),
							bodyTimeout: input.timeoutMs,
							headersTimeout: input.timeoutMs,
							dispatcher: agent as Dispatcher,
						})

						const location = response.headers['location']
						if (typeof location === 'string' && response.statusCode >= 300 && response.statusCode < 400) {
							await captureResponseBody(response.body)
							if (redirect === MAX_REDIRECTS) throw new Error('Redirect limit exceeded.')
							currentUrl = new URL(location, currentUrl)
							if (response.statusCode === 303) {
								method = 'GET'
								body = null
							}
							continue
						}

						const responseBodySample = await captureResponseBody(response.body)
						return {
							outcome: classifyStatus(response.statusCode),
							statusCode: response.statusCode,
							durationMs: Math.round(Number(process.hrtime.bigint() - startTime) / 1_000_000),
							responseBodySample: responseBodySample || null,
							errorMessage: null,
						}
					} finally {
						await agent.close()
					}
				}
				throw new Error('Redirect processing failed.')
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : 'Unknown delivery failure'
				const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
				const outcome: AttemptOutcome = error instanceof SsrfBlockedError ? 'ssrf_blocked' : code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT' || message.toLowerCase().includes('timeout') ? 'timeout' : 'network_error'
				return {
					outcome,
					statusCode: null,
					durationMs: Math.round(Number(process.hrtime.bigint() - startTime) / 1_000_000),
					responseBodySample: null,
					errorMessage: message,
				}
			}
		},
	}
}

const defaultDeliveryClient = createDeliveryClient()

export async function executeWebhook(
	url: string,
	method: string,
	headers: Record<string, string>,
	body: string | null,
	timeoutMs: number,
	chronixHeaders: DeliveryRequest['chronixHeaders'],
): Promise<WebhookResponse> {
	return defaultDeliveryClient.deliver({ url, method, headers, body, timeoutMs, chronixHeaders })
}
