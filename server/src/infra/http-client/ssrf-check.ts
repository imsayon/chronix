import * as dns from 'node:dns'
import { AppError } from '../../common/errors/AppError.js'

export class SsrfBlockedError extends AppError {
	constructor(reason: string) {
		super('SSRF_BLOCKED', `Target URL is blocked: ${reason}`, 422)
	}
}

function isIpInCidr(ip: string, cidr: string): boolean {
	const parts = cidr.split('/')
	const range = parts[0] ?? ''
	const bits = parts[1] ?? '32'
	const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1)

	const ipToNumber = (address: string) =>
		address.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0)

	const ipNum = ipToNumber(ip)
	const rangeNum = ipToNumber(range)

	return (ipNum & mask) === (rangeNum & mask)
}

function isIpv6InCidr(ip: string, cidr: string): boolean {
	if (cidr === '::1/128' && (ip === '::1' || ip === '0:0:0:0:0:0:0:1')) return true
	const prefix = cidr.split('/')[0] ?? ''
	if (prefix === 'fc00::' && ip.toLowerCase().startsWith('fc')) return true
	if (prefix === 'fc00::' && ip.toLowerCase().startsWith('fd')) return true
	if (prefix === 'fe80::' && ip.toLowerCase().startsWith('fe8')) return true
	if (prefix === 'fe80::' && ip.toLowerCase().startsWith('fe9')) return true
	if (prefix === 'fe80::' && ip.toLowerCase().startsWith('fea')) return true
	if (prefix === 'fe80::' && ip.toLowerCase().startsWith('feb')) return true
	return false
}

export function isIpBlocked(ip: string): boolean {
	const BLOCKED_IPV4 = [
		'127.0.0.0/8',
		'10.0.0.0/8',
		'172.16.0.0/12',
		'192.168.0.0/16',
		'169.254.0.0/16',
		'100.64.0.0/10',
	]

	const BLOCKED_IPV6 = [
		'::1/128',
		'fc00::/7',
		'fe80::/10',
	]

	const isV4 = ip.includes('.')
	if (isV4) {
		return BLOCKED_IPV4.some((cidr) => isIpInCidr(ip, cidr))
	} else {
		return BLOCKED_IPV6.some((cidr) => isIpv6InCidr(ip, cidr))
	}
}

export async function advisorySsrfCheck(url: string): Promise<void> {
	let parsedUrl: URL
	try {
		parsedUrl = new URL(url)
	} catch {
		throw new SsrfBlockedError('Target URL is invalid.')
	}

	if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
		throw new SsrfBlockedError('Target URL must use http or https.')
	}

	const hostname = parsedUrl.hostname
	const ips: string[] = []

	try {
		const v4 = await dns.promises.resolve4(hostname)
		ips.push(...v4)
	} catch {
		// Ignore ENOTFOUND
	}

	try {
		const v6 = await dns.promises.resolve6(hostname)
		ips.push(...v6)
	} catch {
		// Ignore ENOTFOUND
	}

	for (const ip of ips) {
		if (isIpBlocked(ip)) {
			throw new SsrfBlockedError(`Target URL resolves to a blocked address (${ip}).`)
		}
	}
}
