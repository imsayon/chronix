import { describe, expect, it } from 'vitest'
import { decryptHeaders, decryptValue, encryptHeaders, encryptValue } from './jobs.crypto.js'

const key = 'chronix-test-encryption-key-32b!'

describe('job material encryption', () => {
	it('round-trips headers and body with AES-256-GCM authentication', () => {
		const headers = encryptHeaders({ Authorization: 'Bearer secret', 'X-Trace': 'trace' }, key)
		const body = encryptValue('{"token":"secret"}', key)
		expect(decryptHeaders(headers.ciphertext, headers.nonce, key)).toEqual({ Authorization: 'Bearer secret', 'X-Trace': 'trace' })
		expect(decryptValue(body.ciphertext, body.nonce, key)).toBe('{"token":"secret"}')
	})

	it('rejects tampered ciphertext', () => {
		const encrypted = encryptValue('secret', key)
		encrypted.ciphertext[0] = encrypted.ciphertext[0]! ^ 1
		expect(() => decryptValue(encrypted.ciphertext, encrypted.nonce, key)).toThrow()
	})
})
