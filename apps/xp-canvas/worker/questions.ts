import type { IRequest } from 'itty-router'
import { type CanvasEnv, isSameOrigin, isValidRoomId } from './access'
import { getPortalSession, portalEnabled } from './portalAuth'
import { parseQuestionCommand, type QuestionCommand } from '../shared/questionShape'

export async function handleQuestionInteraction(request: IRequest, env: CanvasEnv) {
	const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
	if (!portalEnabled(env) || !isValidRoomId(request.params.boardId)) return json({ error: 'Canvas no disponible.' }, 404)
	if (request.method !== 'GET' && !isSameOrigin(request)) return json({ error: 'Origen inválido.' }, 403)
	const session = await getPortalSession(request, env)
	if (!session) return json({ error: 'Inicia sesión para continuar.' }, 401)
	let command: QuestionCommand | null = null
	if (request.method === 'POST') {
		if (Number(request.headers.get('content-length')) > 4096) return json({ error: 'Solicitud demasiado grande.' }, 413)
		try {
			const body = await request.text()
			if (body.length > 4096) return json({ error: 'Solicitud demasiado grande.' }, 413)
			command = parseQuestionCommand(JSON.parse(body))
		} catch { return json({ error: 'Solicitud inválida.' }, 400) }
	}
	const room = env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.boardId))
	const result = await room.questionInteraction(request.params.boardId, session.tokenHash, command)
	return json(result.body, result.status)
}
