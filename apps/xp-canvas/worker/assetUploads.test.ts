import { describe, expect, it } from 'vitest'
import { hasExpectedImageSignature, hasExpectedFileSignature, parseByteRange, handleAssetDownload } from './assetUploads'
import { fileKind, getFileMime } from '../shared/resources'
import { type IRequest } from 'itty-router'
import { type CanvasEnv } from './access'

describe('image signature checks', () => {
	it('accepts the expected signatures', () => {
		expect(
			hasExpectedImageSignature(
				new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
				'image/png'
			)
		).toBe(true)
		expect(
			hasExpectedImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')
		).toBe(true)
		expect(
			hasExpectedImageSignature(new TextEncoder().encode('GIF89a'), 'image/gif')
		).toBe(true)
		expect(
			hasExpectedImageSignature(new TextEncoder().encode('RIFF0000WEBP'), 'image/webp')
		).toBe(true)
	})

	it('rejects HTML disguised as an image and SVG uploads', () => {
		const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
		expect(hasExpectedImageSignature(html, 'image/png')).toBe(false)
		expect(hasExpectedImageSignature(html, 'image/svg+xml')).toBe(false)
	})
})

describe('media and document uploads', () => {
	it('accepts signatures for PDF, MP4, WebM and Office but rejects disguised files', () => {
		const bytes = (text: string) => new TextEncoder().encode(text)
		expect(hasExpectedFileSignature(bytes('%PDF-1.7'), 'application/pdf')).toBe(true)
		expect(hasExpectedFileSignature(bytes('0000ftypisom'), 'video/mp4')).toBe(true)
		expect(hasExpectedFileSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), 'video/webm')).toBe(true)
		expect(hasExpectedFileSignature(bytes('PK\x03\x04'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
		for (const mime of ['application/pdf', 'video/mp4', 'image/jpeg']) expect(hasExpectedFileSignature(bytes('<html>'), mime)).toBe(false)
		expect(fileKind('text/html')).toBe(null)
		expect(fileKind('image/svg+xml')).toBe(null)
	})
	it('uses extension fallback for iPad files with empty or generic MIME types', () => {
		expect(getFileMime({ name: 'notes.DOCX', type: '' })).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
		expect(getFileMime({ name: 'clip.mp4', type: 'application/octet-stream' })).toBe('video/mp4')
		expect(getFileMime({ name: 'readme.md', type: '' })).toBe('text/markdown')
	})
})

describe('HTTP media ranges', () => {
	it('supports Safari probes, open ended and suffix requests, including full ranges', () => {
		expect(parseByteRange('bytes=0-1', 100)).toEqual({ offset: 0, length: 2 })
		expect(parseByteRange('bytes=20-', 100)).toEqual({ offset: 20, length: 80 })
		expect(parseByteRange('bytes=-10', 100)).toEqual({ offset: 90, length: 10 })
		expect(parseByteRange('bytes=0-999', 100)).toEqual({ offset: 0, length: 100 })
		for (const range of ['bytes=100-', 'bytes=30-20', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'bytes=nope']) expect(parseByteRange(range, 100)).toBeNull()
	})
	it('distinguishes 206, 304, 412, 416 and HEAD with accurate headers', async () => {
		let reads = 0
		const metadata = {
			size: 100, httpEtag: '"test-etag"', uploaded: new Date('2026-01-01T00:00:00Z'),
			httpMetadata: { contentType: 'video/mp4' },
			writeHttpMetadata(headers: Headers) { headers.set('content-type', 'video/mp4') },
		}
		const env = { TLDRAW_BUCKET: {
			head: async () => metadata,
			get: async (_key: string, options?: { range?: { length: number } }) => { reads++; return { body: new Uint8Array(options?.range?.length ?? 100) } },
		} } as unknown as CanvasEnv
		async function request(headers: Record<string, string>, method = 'GET') {
			const req = Object.assign(new Request('http://canvas.test/api/uploads/abcdefghijkl', { method, headers }), { params: { uploadId: 'abcdefghijkl' } }) as unknown as IRequest
			return handleAssetDownload(req, env, {} as ExecutionContext)
		}
		const partial = await request({ range: 'bytes=0-1' })
		expect(partial.status).toBe(206)
		expect(partial.headers.get('content-range')).toBe('bytes 0-1/100')
		expect((await partial.arrayBuffer()).byteLength).toBe(2)
		expect((await request({ range: 'bytes=0-999' })).status).toBe(206)
		expect((await request({ 'if-none-match': 'W/"test-etag"' })).status).toBe(304)
		expect((await request({ 'if-match': '"other"' })).status).toBe(412)
		expect((await request({ range: 'bytes=100-' })).status).toBe(416)
		const head = await request({}, 'HEAD')
		expect(head.headers.get('content-length')).toBe('100')
		expect(await head.text()).toBe('')
		expect(reads).toBe(2)
	})
})
