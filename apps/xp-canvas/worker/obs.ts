import { isSameOrigin, tokensMatch, type CanvasEnv } from './access'
import { getPortalSession, portalEnabled } from './portalAuth'
import { body, json, PortalError } from './portalHttp'
import { OBS_ROLE_HEADER } from './ObsRelay'
import { validCapitulo } from '../shared/obs'

function relay(env: CanvasEnv) {
	if (!portalEnabled(env) || !env.OBS_RELAY) throw new PortalError(404, 'Not found')
	return env.OBS_RELAY.get(env.OBS_RELAY.idFromName('obs'))
}
function upgrade(request: Request) {
	if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new PortalError(426, 'WebSocket upgrade required')
}
const connect = (env: CanvasEnv, request: Request, role: 'dock' | 'viewer') =>
	relay(env).fetch(request.url, { headers: { upgrade: 'websocket', [OBS_ROLE_HEADER]: role } })

function respond(handler: (request: Request, env: CanvasEnv) => Promise<Response>) {
	return async (request: Request, env: CanvasEnv) => {
		try { return await handler(request, env) }
		catch (cause) { if (cause instanceof PortalError) return json({ error: cause.message }, cause.status); throw cause }
	}
}

/**
 * The OBS dock is a file:// page with no cookie, so it runs before the portal gate and is checked by its token alone.
 * Browsers can't set headers on a WebSocket, so the token travels as the second subprotocol: ['obs-relay', TOKEN].
 */
export const handleObsDock = respond(async (request, env) => {
	relay(env)
	upgrade(request)
	const protocols = (request.headers.get('sec-websocket-protocol') ?? '').split(',').map((part) => part.trim())
	const token = protocols.find((part) => part !== 'obs-relay') ?? null
	// tokensMatch rejects everything when OBS_RELAY_TOKEN is missing.
	if (!protocols.includes('obs-relay') || !await tokensMatch(token, env.OBS_RELAY_TOKEN)) return json({ error: 'Token inválido.' }, 401)
	return connect(env, request, 'dock')
})

/** Read-only state for every canvas client. The portal gate already checked the session. */
export const handleObsEstado = respond(async (request, env) => {
	relay(env)
	upgrade(request)
	if (!isSameOrigin(request)) return json({ error: 'Origen inválido.' }, 403)
	return connect(env, request, 'viewer')
})

export const handleObsCapitulo = respond(async (request, env) => {
	relay(env)
	if ((await getPortalSession(request, env))?.user.role !== 'teacher') return json({ error: 'Solo Leo cambia el capítulo.' }, 403)
	const { capitulo } = await body(request)
	if (!validCapitulo(capitulo)) return json({ error: 'Capítulo inválido.' }, 400)
	return await relay(env).irA(capitulo) ? json({ ok: true }) : json({ error: 'OBS no está conectado.' }, 409)
})
