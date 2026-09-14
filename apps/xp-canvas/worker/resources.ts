import { error, type IRequest } from 'itty-router'
import { fileKind, type Resource, type ResourceFolders } from '../shared/resources'
import { type CanvasEnv, requestCanEdit, isSameOrigin, ROOM_ID } from './access'
import { catalog } from './boards'

export const resourcePrefix = `rooms/${ROOM_ID}/resources/`
export const validResourceId = (id: string) => /^[a-zA-Z0-9_-]{12,64}$/.test(id)

export async function saveResource(env: CanvasEnv, resource: Resource) {
	await env.TLDRAW_BUCKET.put(`${resourcePrefix}${resource.id}`, '', {
		customMetadata: { resource: JSON.stringify(resource) },
	})
}

export async function listResources(request: IRequest, env: CanvasEnv) {
	if (!(await requestCanEdit(request, env))) return error(403, 'Editor access required')
	const cursor = new URL(request.url).searchParams.get('cursor') || undefined
	if (cursor && cursor.length > 2048) return error(400, 'Invalid cursor')
	const [result, folderResponse] = await Promise.all([
		env.TLDRAW_BUCKET.list({ prefix: resourcePrefix, limit: 100, cursor, include: ['customMetadata'] }),
		catalog(env).fetch('http://catalog/api/resource-folders'),
	])
	if (!folderResponse.ok) return error(503, 'No se pudieron cargar las carpetas')
	const { placements } = await folderResponse.json<ResourceFolders>()
	const resources = result.objects.flatMap((object) => {
		try {
			const resource = JSON.parse(object.customMetadata?.resource ?? '') as Resource
			return [{ ...resource, folderId: placements[resource.id] ?? null }]
		}
		catch { return [] }
	})
	return Response.json({ resources, cursor: result.truncated ? result.cursor : null }, {
		headers: { 'cache-control': 'no-store' },
	})
}

export async function moveResource(request: IRequest, env: CanvasEnv) {
	if (!isSameOrigin(request) || !(await requestCanEdit(request, env))) return error(403, 'Editor access required')
	if (Number(request.headers.get('content-length')) > 1024) return error(413, 'Request too large')
	const id = request.params.resourceId
	if (!validResourceId(id)) return error(400, 'Invalid resource id')
	if (!(await env.TLDRAW_BUCKET.head(`${resourcePrefix}${id}`))) return error(404, 'Resource not found')
	const text = await request.text()
	if (text.length > 1024) return error(413, 'Request too large')
	// The catalog validates the destination and serializes moves without rewriting file metadata.
	return catalog(env).fetch(`http://catalog/api/resource-placements/${id}`, { method: 'PATCH', body: text })
}

export async function saveResourcePreview(request: IRequest, env: CanvasEnv) {
	if (!isSameOrigin(request) || !(await requestCanEdit(request, env))) return error(403, 'Editor access required')
	if (Number(request.headers.get('content-length')) > 1024) return error(413, 'Request too large')
	const id = request.params.resourceId
	if (!validResourceId(id)) return error(400, 'Invalid resource id')
	const text = await request.text()
	if (text.length > 1024) return error(413, 'Request too large')
	let data: { previewId?: unknown }
	try { data = JSON.parse(text) } catch { return error(400, 'Invalid JSON') }
	if (!data || typeof data !== 'object' || typeof data.previewId !== 'string' || !validResourceId(data.previewId)) return error(400, 'Invalid preview')
	const [object, image] = await Promise.all([
		env.TLDRAW_BUCKET.head(`${resourcePrefix}${id}`),
		env.TLDRAW_BUCKET.head(`rooms/${ROOM_ID}/uploads/${data.previewId}`),
	])
	if (!object) return error(404, 'Resource not found')
	if (!image?.httpMetadata?.contentType?.startsWith('image/') || image.size > 1024 * 1024) return error(400, 'Invalid preview')
	const resource = JSON.parse(object.customMetadata?.resource ?? '{}') as Resource
	if (resource.kind !== 'video') return error(400, 'Not a video')
	resource.previewSrc = `/api/uploads/${data.previewId}`
	// A thumbnail finishing after deletion must not recreate the library entry.
	const saved = await env.TLDRAW_BUCKET.put(`${resourcePrefix}${id}`, '', {
		customMetadata: { resource: JSON.stringify(resource) }, onlyIf: { etagMatches: object.etag },
	})
	if (!saved) return error(404, 'Resource not found')
	return Response.json({ previewSrc: resource.previewSrc })
}

export async function saveEmoji(request: IRequest, env: CanvasEnv) {
	if (!isSameOrigin(request) || !(await requestCanEdit(request, env))) return error(403, 'Editor access required')
	if (Number(request.headers.get('content-length')) > 1024) return error(413, 'Request too large')
	const text = await request.text()
	if (text.length > 1024) return error(413, 'Request too large')
	let data: { emoji?: unknown; name?: unknown }
	try { data = JSON.parse(text) } catch { return error(400, 'Invalid JSON') }
	if (!data || typeof data !== 'object' || Array.isArray(data)) return error(400, 'Invalid JSON object')
	if (typeof data.emoji !== 'string' || data.emoji.length > 32 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(data.emoji)) return error(400, 'Introduce un emoji')
	const resource: Resource = {
		id: crypto.randomUUID(), kind: 'emoji', src: data.emoji.trim(),
		name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 100) : data.emoji.trim(),
		mimeType: '', size: 0, w: 64, h: 64, createdAt: new Date().toISOString(),
	}
	await saveResource(env, resource)
	return Response.json(resource, { status: 201 })
}

export async function removeResource(request: IRequest, env: CanvasEnv) {
	if (!isSameOrigin(request) || !(await requestCanEdit(request, env))) return error(403, 'Editor access required')
	if (!validResourceId(request.params.resourceId)) return error(400, 'Invalid resource id')
	// Remove only the library entry. Existing shapes, undo and other clients keep their file.
	await env.TLDRAW_BUCKET.delete(`${resourcePrefix}${request.params.resourceId}`)
	return new Response(null, { status: 204 })
}

export async function saveExistingResource(request: IRequest, env: CanvasEnv) {
	if (!isSameOrigin(request) || !(await requestCanEdit(request, env))) return error(403, 'Editor access required')
	const id = request.params.resourceId
	if (!validResourceId(id)) return error(400, 'Invalid resource id')
	if (Number(request.headers.get('content-length')) > 2048) return error(413, 'Request too large')
	const text = await request.text()
	if (text.length > 2048) return error(413, 'Request too large')
	let data: { name?: unknown; w?: unknown; h?: unknown }
	try { data = JSON.parse(text) } catch { return error(400, 'Invalid JSON') }
	if (!data || typeof data !== 'object' || Array.isArray(data)) return error(400, 'Invalid JSON object')
	const object = await env.TLDRAW_BUCKET.head(`rooms/${ROOM_ID}/uploads/${id}`)
	if (!object) return error(404, 'File not found')
	const mimeType = object.httpMetadata?.contentType ?? ''
	const kind = fileKind(mimeType)
	if (!kind) return error(415, 'Unsupported file type')
	const previous = await env.TLDRAW_BUCKET.head(`${resourcePrefix}${id}`)
	let previewSrc: string | undefined
	try {
		const saved = JSON.parse(previous?.customMetadata?.resource ?? '{}') as Resource
		if (saved.previewSrc && /^\/api\/uploads\/[a-zA-Z0-9_-]{12,64}$/.test(saved.previewSrc)) previewSrc = saved.previewSrc
	} catch { /* An older entry may not include a preview. */ }
	const resource: Resource = {
		id, kind, src: `/api/uploads/${id}`, mimeType, size: object.size,
		name: typeof data.name === 'string' ? data.name.trim().slice(0, 180) || 'Archivo' : 'Archivo',
		w: typeof data.w === 'number' && Number.isFinite(data.w) ? Math.max(1, Math.min(16384, data.w)) : 320,
		h: typeof data.h === 'number' && Number.isFinite(data.h) ? Math.max(1, Math.min(16384, data.h)) : 180,
		createdAt: object.uploaded.toISOString(),
		...(previewSrc ? { previewSrc } : {}),
	}
	await saveResource(env, resource)
	return Response.json(resource)
}
