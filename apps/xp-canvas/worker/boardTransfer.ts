import type { IRequest } from 'itty-router'
import { type CanvasEnv, isSameOrigin, requestCanEdit } from './access'
import { catalog, readBoard } from './boards'
import { validateBoardSnapshot } from './boardSnapshot'

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } })
const MAX_BYTES = 8 * 1024 * 1024

export async function exportBoard(request: IRequest, env: CanvasEnv) {
	if (!await requestCanEdit(request, env)) return json({ error: 'Solo el profesor puede exportar una copia completa.' }, 403)
	const board = await readBoard(env, request.params.boardId)
	if (!board || board.trashedAt) return json({ error: 'Este canvas no está disponible.' }, 404)
	const snapshot = await env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(board.id)).getDocumentSnapshot()
	return json({ version: 1, board, snapshot })
}

export async function importBoard(request: IRequest, env: CanvasEnv) {
	if (!isSameOrigin(request) || !await requestCanEdit(request, env)) return json({ error: 'Solo el profesor puede importar canvases.' }, 403)
	if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Envía una copia JSON.' }, 415)
	if (Number(request.headers.get('content-length')) > MAX_BYTES) return json({ error: 'La copia supera 8 MiB.' }, 413)
	const reader = request.body?.getReader()
	if (!reader) return json({ error: 'Falta la copia del canvas.' }, 400)
	const chunks: string[] = [], decoder = new TextDecoder()
	let bytes = 0
	while (true) {
		const { value, done } = await reader.read()
		if (done) break
		bytes += value.byteLength
		if (bytes > MAX_BYTES) { await reader.cancel(); return json({ error: 'La copia supera 8 MiB.' }, 413) }
		chunks.push(decoder.decode(value, { stream: true }))
	}
	let name: string, snapshot
	try {
		const data = JSON.parse(chunks.join('') + decoder.decode())
		if (data?.version !== 1 || typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 120) throw new Error()
		name = data.name.trim()
		snapshot = validateBoardSnapshot(data.snapshot)
	} catch { return json({ error: 'La copia no es válida o usa una versión incompatible.' }, 400) }
	// Always creates a new room. There is deliberately no overwrite/replace option.
	const board = await catalog(env).importBoard(name, snapshot)
	return json(board, 201)
}
