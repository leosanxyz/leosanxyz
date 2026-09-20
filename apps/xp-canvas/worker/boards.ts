import { type IRequest } from 'itty-router'
import { type Board, isBoardId } from '../shared/boards'
import { type CanvasEnv, isSameOrigin, requestCanEdit } from './access'
import { portalEnabled } from './portalAuth'

export function catalog(env: CanvasEnv) {
	return env.BOARD_CATALOG.get(env.BOARD_CATALOG.idFromName('library'))
}

export async function readBoard(env: CanvasEnv, id: string): Promise<Board | null> {
	if (!isBoardId(id)) return null
	const response = await catalog(env).fetch(`http://catalog/api/boards/${id}`)
	return response.ok ? response.json<Board>() : null
}

export async function handleLibraryRequest(request: IRequest, env: CanvasEnv) {
	if (!(await requestCanEdit(request, env)) || (request.method !== 'GET' && !isSameOrigin(request))) {
		return Response.json({ error: 'Necesitas acceso de edición.' }, { status: 403 })
	}
	const response = await catalog(env).fetch(request.url, { method: request.method, headers: request.headers, body: request.method === 'GET' ? undefined : request.body })
	if (portalEnabled(env) && response.ok && request.method === 'PATCH' && request.params.boardId) {
		await env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.boardId)).revalidatePortalSessions()
	}
	const result = new Response(response.body, response)
	result.headers.set('cache-control', 'no-store')
	return result
}

export async function handleBoardRequest(request: IRequest, env: CanvasEnv) {
	const board = await readBoard(env, request.params.boardId)
	if (!board || board.trashedAt) return Response.json({ error: 'Este canvas no está disponible.' }, { status: 404 })
	return Response.json(board, { headers: { 'cache-control': 'no-store' } })
}

export async function handleThumbnail(request: IRequest, env: CanvasEnv) {
	const id = request.params.boardId
	const board = await readBoard(env, id)
	if (!board || board.trashedAt) return new Response(null, { status: 404 })
	const key = `boards/${id}/thumbnail.png`
	if (request.method === 'GET') {
		const image = await env.TLDRAW_BUCKET.get(key)
		if (!image) return new Response(null, { status: 404 })
		return new Response(image.body, { headers: { 'content-type': 'image/png', 'cache-control': portalEnabled(env) ? 'private, no-store' : 'public, max-age=60', 'x-content-type-options': 'nosniff' } })
	}
	if (!isSameOrigin(request) || !(await requestCanEdit(request, env))) return new Response(null, { status: 403 })
	const size = Number(request.headers.get('content-length'))
	if (!size || size > 512 * 1024 || request.headers.get('content-type') !== 'image/png') return new Response(null, { status: 400 })
	const bytes = new Uint8Array(await request.arrayBuffer())
	if (bytes.length !== size || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return new Response(null, { status: 400 })
	await env.TLDRAW_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/png' } })
	await catalog(env).fetch(`http://catalog/api/boards/${id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail: true }) })
	return new Response(null, { status: 204 })
}
