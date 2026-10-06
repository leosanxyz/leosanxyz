/** `crypto.randomUUID` only exists in secure contexts; the QA server on the tailnet is plain HTTP. */
export function uuid(): string {
	if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
	return uuidFallback()
}

/** A version 4 UUID from `getRandomValues`, which works without a secure context. */
export function uuidFallback(): string {
	const b = crypto.getRandomValues(new Uint8Array(16))
	b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
	const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
