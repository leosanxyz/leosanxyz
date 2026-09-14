import { AutoRouter, error, IRequest } from 'itty-router'
import {
	CanvasEnv,
	clearEditorCookies,
	createEditorCookie,
	editorCodeMatches,
	getEditorSession,
	INTERNAL_ROLE_HEADER,
	isSameOrigin,
	isValidRoomId,
	withoutCredentials,
} from './access'
import { handleAssetDownload, handleAssetUpload } from './assetUploads'
import { listResources, removeResource, saveEmoji, saveExistingResource, moveResource, saveResourcePreview } from './resources'
import { handleLibraryRequest, handleBoardRequest, handleThumbnail, readBoard } from './boards'

export { TldrawDurableObject } from './TldrawDurableObject'
export { BoardCatalog } from './BoardCatalog'

const AUTH_EXPIRY_HEADER = 'x-xp-canvas-auth-exp'

const router = AutoRouter<IRequest, [env: CanvasEnv, ctx: ExecutionContext]>({
	catch: (exception) => {
		console.error(exception)
		return error(500, 'Internal server error')
	},
})
	.get('/api/health', () =>
		Response.json(
			{ ok: true, service: 'xp-canvas' },
			{ headers: { 'cache-control': 'no-store' } }
		)
	)
	.post('/api/input-diagnostic', async (request, env) => {
		if (!import.meta.env.DEV) return error(404, 'Not found')
		if (!isSameOrigin(request) || !(await getEditorSession(request, env))) return error(403, 'Forbidden')
		const text = await request.text()
		if (text.length > 48_000) return error(413, 'Request is too large')
		const data = JSON.parse(text) as { run?: unknown; records?: unknown }
		if (typeof data.run !== 'string' || !/^snap-[0-9]+$/.test(data.run) ||
			!Array.isArray(data.records) || data.records.length > 160) return error(400, 'Invalid trace')
		console.info('[snap-input-diagnostic]', JSON.stringify(data))
		return Response.json({ ok: true })
	})
	.get('/api/editor-session', async (request, env) => {
		const role = (await getEditorSession(request, env)) ? 'editor' : 'viewer'
		return Response.json({ role }, { headers: { 'cache-control': 'no-store' } })
	})
	.post('/api/editor-session', async (request, env) => {
		if (!isSameOrigin(request)) return error(403, 'Invalid origin')
		const contentLength = Number(request.headers.get('content-length'))
		if (Number.isFinite(contentLength) && contentLength > 1024) return error(413, 'Request is too large')

		let code: string | null = null
		try {
			const text = await request.text()
			if (text.length > 1024) return error(413, 'Request is too large')
			const data = JSON.parse(text) as { code?: unknown }
			if (typeof data.code === 'string') code = data.code.trim()
		} catch {
			return error(400, 'Invalid request')
		}

		if (!(await editorCodeMatches(code, env))) return error(401, 'Invalid editor code')
		return Response.json(
			{ role: 'editor' },
			{
				status: 201,
				headers: {
					'cache-control': 'no-store',
					'set-cookie': await createEditorCookie(request, env),
				},
			}
		)
	})
	.post('/api/editor-session/logout', (request) => {
		if (!isSameOrigin(request)) return error(403, 'Invalid origin')
		const headers = new Headers({ 'cache-control': 'no-store' })
		for (const cookie of clearEditorCookies()) headers.append('set-cookie', cookie)
		return Response.json({ role: 'viewer' }, { status: 200, headers })
	})
	.get('/api/connect/:roomId', async (request, env) => {
		if (!isValidRoomId(request.params.roomId)) return error(404, 'Room not found')
		const board = await readBoard(env, request.params.roomId)
		if (!board || board.trashedAt) return error(404, 'Room not found')
		if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
			return error(426, 'WebSocket upgrade required')
		}
		if (!isSameOrigin(request)) return error(403, 'Invalid origin')

		const sessionId = request.query.sessionId
		if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId)) {
			return error(400, 'Invalid session id')
		}

		const editorSession = await getEditorSession(request, env)
		const headers = withoutCredentials(request)
		headers.set(INTERNAL_ROLE_HEADER, editorSession ? 'editor' : 'viewer')
		if (editorSession) headers.set(AUTH_EXPIRY_HEADER, String(editorSession.expires))

		const id = env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.roomId)
		return env.TLDRAW_DURABLE_OBJECT.get(id).fetch(request.url, { headers })
	})
	.get('/api/library', handleLibraryRequest)
	.post('/api/boards', handleLibraryRequest)
	.get('/api/boards/:boardId', handleBoardRequest)
	.patch('/api/boards/:boardId', handleLibraryRequest)
	.post('/api/folders', handleLibraryRequest)
	.patch('/api/folders/:folderId', handleLibraryRequest)
	.get('/api/boards/:boardId/thumbnail', handleThumbnail)
	.put('/api/boards/:boardId/thumbnail', handleThumbnail)
	.post('/api/uploads/:uploadId', handleAssetUpload)
	.head('/api/uploads/:uploadId', handleAssetDownload)
	.get('/api/uploads/:uploadId', handleAssetDownload)
	.get('/api/resources', listResources)
	.get('/api/resource-folders', handleLibraryRequest)
	.post('/api/resource-folders', handleLibraryRequest)
	.patch('/api/resource-folders/:folderId', handleLibraryRequest)
	.patch('/api/resources/:resourceId', moveResource)
	.put('/api/resources/:resourceId/preview', saveResourcePreview)
	.post('/api/resources/emoji', saveEmoji)
	.put('/api/resources/:resourceId', saveExistingResource)
	.delete('/api/resources/:resourceId', removeResource)
	.all('/api/*', () => Response.json({ error: 'Not found' }, { status: 404 }))
	.all('*', () => new Response('Not found', { status: 404 }))

export default { fetch: router.fetch }
