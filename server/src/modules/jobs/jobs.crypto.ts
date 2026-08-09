import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const NONCE_BYTES = 12
const KEY_BYTES = 32
const TEST_KEY = Buffer.from('chronix-test-encryption-key-32b!', 'utf8')

export type EncryptedValue = { ciphertext: Buffer; nonce: Buffer }

function keyBytes(rawKey?: string): Buffer {
	const value = rawKey ?? process.env['APP_ENCRYPTION_KEY']
	if (!value) {
		if (process.env['NODE_ENV'] === 'test') return TEST_KEY
		throw new Error('APP_ENCRYPTION_KEY is required for encrypted job material.')
	}
	const decoded = Buffer.from(value, /^[A-Za-z0-9+/]+=*$/.test(value) ? 'base64' : 'utf8')
	if (decoded.length !== KEY_BYTES) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes.')
	return decoded
}

export function encryptValue(value: string, rawKey?: string): EncryptedValue {
	const nonce = Buffer.from(randomBytes(NONCE_BYTES))
	const cipher = createCipheriv(ALGORITHM, keyBytes(rawKey), nonce)
	return { ciphertext: Buffer.concat([cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]), nonce }
}

export function decryptValue(ciphertext: Uint8Array, nonce: Uint8Array, rawKey?: string): string {
	const bytes = Buffer.from(ciphertext)
	const decipher = createDecipheriv(ALGORITHM, keyBytes(rawKey), Buffer.from(nonce))
	decipher.setAuthTag(bytes.subarray(-16))
	return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString('utf8')
}

export function encryptHeaders(headers: Record<string, string>, rawKey?: string): EncryptedValue {
	return encryptValue(JSON.stringify(headers), rawKey)
}

export function decryptHeaders(ciphertext: Uint8Array, nonce: Uint8Array, rawKey?: string): Record<string, string> {
	const parsed: unknown = JSON.parse(decryptValue(ciphertext, nonce, rawKey))
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Encrypted headers are invalid.')
	return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}
