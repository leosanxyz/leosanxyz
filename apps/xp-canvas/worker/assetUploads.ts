import { error, IRequest } from 'itty-router'
import { CanvasEnv, isSameOrigin, requestCanEdit, ROOM_ID } from './access'
import { fileKind, MAX_FILE_BYTES, MAX_IMAGE_BYTES, IMAGE_TYPES, type Resource } from '../shared/resources'
import { saveResource } from './resources'
import { portalEnabled } from './portalAuth'

export const MAX_ASSET_BYTES = MAX_IMAGE_BYTES

export const ALLOWED_IMAGE_TYPES = new Set(IMAGE_TYPES)

function getAssetObjectName(uploadId: string) {
	if (!/^[a-zA-Z0-9_-]{12,64}$/.test(uploadId)) return null
	return `rooms/${ROOM_ID}/uploads/${uploadId}`
}

declare global {
	interface CacheStorage {
		default: Cache
	}
}

export async function handleAssetUpload(request: IRequest, env: CanvasEnv) {
	if (!isSameOrigin(request)) return error(403, 'Invalid origin')
	if (!(await requestCanEdit(request, env))) return error(403, 'Editor access required')

	const objectName = getAssetObjectName(request.params.uploadId)
	if (!objectName) return error(400, 'Invalid upload id')
	let previewSrc: string | undefined
	const previewId = request.headers.get('x-resource-preview')
	if (previewId) {
		const previewName = getAssetObjectName(previewId)
		if (!previewName) return error(400, 'Invalid preview id')
		const preview = await env.TLDRAW_BUCKET.head(previewName)
		if (!preview?.httpMetadata?.contentType?.startsWith('image/') || preview.size > 1024 * 1024) return error(400, 'Invalid preview')
		previewSrc = `/api/uploads/${previewId}`
	}

	const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
	const kind = fileKind(contentType)
	if (!kind) return error(415, 'Unsupported file type')

	const declaredLength = Number(request.headers.get('content-length'))
	const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
	if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || !request.body) return error(411, 'File size required')
	if (declaredLength > limit) return error(413, 'File is too large')

	let name: string
	try { name = Array.from(decodeURIComponent(request.headers.get('x-file-name') ?? 'archivo').replace(/[\r\n\x00-\x1f]/g, '')).slice(0, 160).join('') }
	catch { return error(400, 'Invalid file name') }
	const reader = request.body.getReader()
	const prefixChunks: Uint8Array[] = []
	let prefixSize = 0
	while (prefixSize < Math.min(512, declaredLength)) {
		const { done, value } = await reader.read()
		if (done) break
		prefixChunks.push(value)
		prefixSize += value.length
	}
	const prefix = new Uint8Array(Math.min(prefixSize, 512))
	let offset = 0
	for (const chunk of prefixChunks) {
		const part = chunk.subarray(0, prefix.length - offset)
		prefix.set(part, offset); offset += part.length
	}
	if (!hasExpectedFileSignature(prefix, contentType)) {
		await reader.cancel()
		return error(400, 'File contents do not match its type')
	}
	// FixedLengthStream enforces the byte count and streams with backpressure. Never
	// hold two full copies of a video in the Worker's 128 MB memory budget.
	const stream = new FixedLengthStream(declaredLength)
	const writer = stream.writable.getWriter()
	const pump = (async () => {
		try {
			for (const chunk of prefixChunks) await writer.write(chunk)
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				await writer.write(value)
			}
			await writer.close()
		} catch (cause) { await writer.abort(cause); await reader.cancel(cause); throw cause }
	})()
	// The upload and pump may fail in either order; observe both promises immediately.
	void pump.catch(() => {})
	const dimension = (header: string) => Math.max(1, Math.min(16384, Number(request.headers.get(header)) || 320))
	const resource: Resource = {
		id: request.params.uploadId, name: name || 'archivo', kind, src: `/api/uploads/${request.params.uploadId}`,
		mimeType: contentType, size: declaredLength, w: dimension('x-asset-width'), h: dimension('x-asset-height'),
		createdAt: new Date().toISOString(),
		...(previewSrc ? { previewSrc } : {}),
	}
	const put = env.TLDRAW_BUCKET.put(objectName, stream.readable, {
		onlyIf: { etagDoesNotMatch: '*' },
		httpMetadata: {
			contentType,
			...(kind === 'document' ? { contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(resource.name)}` } : {}),
		},
	})
	const result = await put.catch(async (cause) => { await writer.abort(cause); await pump.catch(() => {}); throw cause })
	if (!result) { await reader.cancel(); await writer.abort(); await pump.catch(() => {}); return error(409, 'Upload already exists') }
	await pump
	if (request.headers.get('x-save-resource') === 'true') await saveResource(env, resource)
	return Response.json({ ok: true, resource }, { status: 201 })
}

export function hasExpectedImageSignature(bytes: Uint8Array, contentType: string) {
	const startsWith = (...signature: number[]) =>
		signature.every((byte, index) => bytes[index] === byte)
	const ascii = (offset: number, value: string) =>
		[...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0))

	switch (contentType) {
		case 'image/jpeg':
			return startsWith(0xff, 0xd8, 0xff)
		case 'image/png':
		case 'image/apng':
			return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
		case 'image/gif':
			return ascii(0, 'GIF87a') || ascii(0, 'GIF89a')
		case 'image/webp':
			return ascii(0, 'RIFF') && ascii(8, 'WEBP')
		case 'image/avif':
			return ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))
		default:
			return false
	}
}

export function hasExpectedFileSignature(bytes: Uint8Array, mime: string) {
	if (ALLOWED_IMAGE_TYPES.has(mime)) return hasExpectedImageSignature(bytes, mime)
	const ascii = (offset: number, value: string) => [...value].every((c, i) => bytes[offset + i] === c.charCodeAt(0))
	if (mime === 'application/pdf') return ascii(0, '%PDF-')
	if (mime === 'video/mp4' || mime === 'video/quicktime' || mime === 'audio/mp4') return ascii(4, 'ftyp')
	if (mime === 'video/webm' || mime === 'audio/webm') return [0x1a, 0x45, 0xdf, 0xa3].every((v, i) => bytes[i] === v)
	if (mime === 'audio/mpeg') return ascii(0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
	if (mime === 'audio/ogg') return ascii(0, 'OggS')
	if (mime === 'audio/wav') return ascii(0, 'RIFF') && ascii(8, 'WAVE')
	if (mime === 'application/zip' || mime.includes('openxmlformats')) return ascii(0, 'PK\x03\x04') || ascii(0, 'PK\x05\x06')
	if (['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'].includes(mime)) {
		return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => bytes[i] === v)
	}
	// Text is never rendered inline: downloads have attachment + nosniff + a restrictive CSP.
	return (mime.startsWith('text/') || mime === 'application/json') && bytes.length > 0 && !bytes.includes(0)
}

export function parseByteRange(header: string, size: number): { offset: number; length: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header)
	if (!match || (!match[1] && !match[2])) return null
	const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
	const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null
	return { offset: start, length: end - start + 1 }
}

// Immutable assets use browser/edge caching. Range responses support Safari media seeking.
export async function handleAssetDownload(request: IRequest, env: CanvasEnv, ctx: ExecutionContext) {
	const objectName = getAssetObjectName(request.params.uploadId)
	if (!objectName) return error(400, 'Invalid upload id')

	const cacheKey = new Request(request.url)
	const privateAsset = portalEnabled(env)
	const conditional = ['range', 'if-match', 'if-none-match', 'if-modified-since', 'if-unmodified-since'].some((h) => request.headers.has(h))
	if (!privateAsset && !conditional && request.method === 'GET') {
		const cached = await caches.default.match(cacheKey)
		if (cached) return cached
	}
	const object = await env.TLDRAW_BUCKET.head(objectName)
	if (!object) return error(404, 'File not found')
	const headers = new Headers()
	object.writeHttpMetadata(headers)
	headers.set('cache-control', privateAsset ? 'private, no-store' : 'public, max-age=31536000, immutable')
	headers.set('etag', object.httpEtag)
	headers.set('accept-ranges', 'bytes')
	headers.set('last-modified', object.uploaded.toUTCString())
	headers.set('content-security-policy', "default-src 'none'")
	headers.set('x-content-type-options', 'nosniff')
	const matches = (value: string, weak = false) => value.split(',').some((tag) => tag.trim() === '*' || (weak ? tag.trim().replace(/^W\//, '') : tag.trim()) === object.httpEtag)
	const ifMatch = request.headers.get('if-match')
	if (ifMatch && !matches(ifMatch)) return new Response(null, { status: 412, headers })
	const ifNone = request.headers.get('if-none-match')
	if (ifNone && matches(ifNone, true)) return new Response(null, { status: 304, headers })
	const modified = Math.floor(object.uploaded.getTime() / 1000) * 1000
	const unmodified = request.headers.get('if-unmodified-since')
	if (!ifMatch && unmodified && modified > Date.parse(unmodified)) return new Response(null, { status: 412, headers })
	const since = request.headers.get('if-modified-since')
	if (!ifNone && since && modified <= Date.parse(since)) return new Response(null, { status: 304, headers })
	let range: { offset: number; length: number } | undefined
	const rangeHeader = request.method === 'GET' ? request.headers.get('range') : null
	const ifRange = request.headers.get('if-range')
	if (rangeHeader && (!ifRange || ifRange === object.httpEtag || Date.parse(ifRange) >= modified)) {
		const parsed = parseByteRange(rangeHeader, object.size)
		if (!parsed) {
			headers.set('content-range', `bytes */${object.size}`)
			return new Response(null, { status: 416, headers })
		}
		range = parsed
		headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`)
	}
	headers.set('content-length', String(range?.length ?? object.size))
	if (request.method === 'HEAD') return new Response(null, { headers })
	const download = await env.TLDRAW_BUCKET.get(objectName, range ? { range } : undefined)
	if (!download) return error(404, 'File not found')
	const response = new Response(download.body, { headers, status: range ? 206 : 200 })
	if (!privateAsset && !range && object.size <= MAX_IMAGE_BYTES && object.httpMetadata?.contentType?.startsWith('image/')) {
		ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch((cause) => console.warn('Asset cache unavailable', cause)))
	}
	return response
}
