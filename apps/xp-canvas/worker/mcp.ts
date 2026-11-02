import type { CanvasEnv } from './access'
import { catalog, readBoard } from './boards'
import { portalEnabled } from './portalAuth'
import { agentFromRequest, agentRateLimited, mcpResource, type AgentIdentity } from './oauth'
import { FlowchartError, LIMITS, NODE_KINDS, parseFlowchart, type ReadDiagram } from './flowchart'
import type { Board, BoardLibrary } from '../shared/boards'
import { DIAGRAM_VIEW_HTML, DIAGRAM_VIEW_URI, MCP_APP_MIME } from './mcpApp'

// Servidor MCP (Streamable HTTP sin estado) para que el agente de un alumno dibuje diagramas de flujo
// en sus canvases personales. Cada llamada se autentica con el token OAuth del alumno.

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']

export const MCP_INSTRUCTIONS = `XP Canvas es el pizarrón de las clases de Leo. Con estas herramientas dibujas diagramas de flujo en los canvases personales del alumno que te conectó.

Eres un tutor, no el autor del diagrama:
- Dibuja exactamente lo que el alumno dictó. No inventes, no agregues ni completes pasos por tu cuenta, y no corrijas su lógica en silencio.
- Usa sus palabras en los textos de los nodos.
- Cuando una herramienta devuelva huecos, pregúntaselos al alumno uno por uno, con sus palabras, y espera su respuesta antes de dibujar el siguiente cambio. No rellenes un hueco tú.
- Antes de cambiar un diagrama que ya existe, léelo con leer_canvas: el alumno pudo moverlo o corregirlo a mano.
- Al terminar, comparte el enlace del canvas para que el alumno lo abra.

Símbolos de la clase de Lógica:
- inicio y fin son óvalos que solo marcan dónde empieza y dónde termina («Inicio», «Fin» o el evento que lo dispara).
- Cada acción va en un rectángulo de proceso, también la última. No conviertas una acción en fin.
- Una decisión es un rombo con una pregunta y dos salidas, SÍ y NO.
- Un ciclo es una flecha que regresa a un paso anterior.
Si el alumno dice que ahí termina («y ya», «se acaba»), conecta esos pasos a un nodo fin. Si no dijo cómo termina, no lo inventes: el servidor lo marcará como hueco y se lo preguntas.`

const nodeSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', description: 'Identificador corto y único dentro del diagrama, por ejemplo "inicio", "restar_vida" o "d1". Al actualizar, usa los mismos ids que devolvió leer_canvas.' },
		tipo: { type: 'string', enum: [...NODE_KINDS], description: 'inicio y fin (óvalo) solo marcan dónde empieza y termina; cada acción es proceso (rectángulo), aunque sea la última; decision es un rombo con una pregunta y salidas SÍ y NO.' },
		texto: { type: 'string', maxLength: LIMITS.text, description: 'Lo que dijo el alumno, con sus palabras. Las decisiones van como pregunta, por ejemplo "¿Me quedan vidas?".' },
	},
	required: ['id', 'tipo', 'texto'],
	additionalProperties: false,
}
const edgeSchema = {
	type: 'object',
	properties: {
		de: { type: 'string', description: 'id del nodo de donde sale la flecha.' },
		a: { type: 'string', description: 'id del nodo al que llega. Para un ciclo, apunta a un paso anterior.' },
		etiqueta: { type: 'string', maxLength: LIMITS.label, description: 'Obligatoria en las flechas que salen de una decisión: "SÍ" o "NO". Déjala vacía en las demás.' },
	},
	required: ['de', 'a'],
	additionalProperties: false,
}
// Hosts that render MCP Apps show the diagram in the chat; `openai/outputTemplate` is the Apps SDK alias.
const diagramView = { ui: { resourceUri: DIAGRAM_VIEW_URI }, 'openai/outputTemplate': DIAGRAM_VIEW_URI }
const canvasParam = { type: 'string', description: 'id del canvas (de listar_canvases o crear_canvas). También acepta su enlace o su nombre exacto.' }

const TOOLS = [
	{
		name: 'listar_canvases',
		title: 'Listar canvases',
		description: 'Lista los canvases personales del alumno en XP Canvas, con su id y su enlace.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: 'crear_canvas',
		title: 'Crear canvas',
		description: 'Crea un canvas personal vacío para el alumno y devuelve su id y su enlace. Cada alumno puede tener hasta 20.',
		inputSchema: { type: 'object', properties: { nombre: { type: 'string', maxLength: 120, description: 'Nombre del canvas, por ejemplo el nombre del juego o del mod.' } }, required: ['nombre'], additionalProperties: false },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
	},
	{
		name: 'dibujar_diagrama',
		title: 'Dibujar diagrama de flujo',
		description: `Dibuja un diagrama de flujo en un canvas personal, dentro de un marco con su título. Dibuja exactamente lo que dictó el alumno: no inventes ni agregues pasos. El servidor lo acomoda de arriba abajo (SÍ sigue hacia abajo, NO sale a la derecha) y lo deja como figuras normales que el alumno puede mover.
Si ya existe un diagrama con el mismo título en ese canvas, lo reemplaza: manda el diagrama completo, con los mismos ids que devolvió leer_canvas. Los nodos que el alumno movió a mano se quedan donde los puso.
La respuesta trae los huecos que encontró el servidor (una decisión sin NO, un paso sin salida, un ciclo que nunca termina…). Pregúntaselos al alumno uno por uno; no los rellenes tú.`,
		inputSchema: {
			type: 'object',
			properties: {
				canvas: canvasParam,
				titulo: { type: 'string', maxLength: LIMITS.title, description: 'Qué describe el diagrama, por ejemplo "Cuando un zombie me pega".' },
				nodos: { type: 'array', items: nodeSchema, minItems: 1, maxItems: LIMITS.nodes },
				flechas: { type: 'array', items: edgeSchema, maxItems: LIMITS.edges },
			},
			required: ['canvas', 'titulo', 'nodos', 'flechas'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		_meta: diagramView,
	},
	{
		name: 'leer_canvas',
		title: 'Leer canvas',
		description: 'Lee los diagramas de flujo de un canvas personal, con los cambios que el alumno haya hecho a mano, y devuelve sus nodos, flechas y huecos. Lo que no forma parte de un diagrama (texto, trazos, flechas sueltas) aparece aparte en "otros". Úsalo antes de cambiar un diagrama.',
		inputSchema: { type: 'object', properties: { canvas: canvasParam }, required: ['canvas'], additionalProperties: false },
		annotations: { readOnlyHint: true, openWorldHint: false },
		_meta: diagramView,
	},
]

class ToolError extends Error {}

const rpc = (id: unknown, result: unknown) => Response.json({ jsonrpc: '2.0', id, result }, { headers: { 'cache-control': 'no-store' } })
const rpcError = (id: unknown, code: number, message: string, status = 200) => Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } })

export async function handleMcp(request: Request, env: CanvasEnv): Promise<Response> {
	if (!portalEnabled(env)) return new Response('Not found', { status: 404 })
	if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
	// Browsers may not drive this endpoint from other sites (DNS rebinding); native agents send no Origin.
	const origin = request.headers.get('origin')
	if (origin && origin !== new URL(request.url).origin) return rpcError(null, -32600, 'Origen inválido.', 403)
	const agent = await agentFromRequest(request, env)
	if (!agent) {
		return Response.json({ error: 'invalid_token', error_description: 'Conecta tu agente con tu cuenta de XP Canvas.' }, {
			status: 401,
			headers: { 'www-authenticate': `Bearer resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource/mcp", scope="canvas"`, 'cache-control': 'no-store' },
		})
	}
	if (await agentRateLimited(env, agent.grantId)) return rpcError(null, -32000, 'Demasiadas solicitudes. Espera unos minutos.', 429)
	const text = await request.text()
	if (text.length > 128_000) return rpcError(null, -32600, 'Solicitud demasiado grande.', 413)
	let message: { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: Record<string, unknown> }
	try { message = JSON.parse(text) } catch { return rpcError(null, -32700, 'JSON inválido.', 400) }
	if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') return rpcError(null, -32600, 'Solicitud JSON-RPC inválida.', 400)
	// Notifications and responses from the client need no answer.
	if (message.id === undefined || typeof message.method !== 'string') return new Response(null, { status: 202 })
	const { id, method, params = {} } = message

	switch (method) {
		case 'initialize': {
			const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
			return rpc(id, {
				protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
				serverInfo: { name: 'xp-canvas', title: 'XP Canvas', version: '1.0.0' },
				instructions: MCP_INSTRUCTIONS,
			})
		}
		case 'ping': return rpc(id, {})
		case 'tools/list': return rpc(id, { tools: TOOLS })
		case 'resources/list': return rpc(id, { resources: [{ uri: DIAGRAM_VIEW_URI, name: 'diagrama', title: 'Diagrama de XP Canvas', mimeType: MCP_APP_MIME }] })
		case 'resources/templates/list': return rpc(id, { resourceTemplates: [] })
		case 'resources/read': {
			if (params.uri !== DIAGRAM_VIEW_URI) return rpcError(id, -32002, 'Recurso no encontrado.')
			// No network access: the view only shows the SVG that comes with the tool result.
			return rpc(id, { contents: [{ uri: DIAGRAM_VIEW_URI, mimeType: MCP_APP_MIME, text: DIAGRAM_VIEW_HTML, _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true }, 'openai/widgetDescription': 'Vista previa del diagrama de flujo en XP Canvas.' } }] })
		}
		case 'tools/call': {
			const name = params.name, args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>
			if (!TOOLS.some((tool) => tool.name === name)) return rpcError(id, -32602, `No existe la herramienta ${String(name)}.`)
			try {
				return rpc(id, await callTool(String(name), args, agent, request, env))
			} catch (cause) {
				if (cause instanceof ToolError || cause instanceof FlowchartError) return rpc(id, { content: [{ type: 'text', text: cause.message }], isError: true })
				console.error('MCP tool failed', name, cause instanceof Error ? cause.message : 'Unknown error')
				return rpc(id, { content: [{ type: 'text', text: 'XP Canvas no pudo completar la acción. Inténtalo de nuevo en un momento.' }], isError: true })
			}
		}
		default: return rpcError(id, -32601, `Método no disponible: ${method}`)
	}
}

const boardUrl = (request: Request, id: string) => `${new URL(mcpResource(request)).origin}/board/${id}`
const summary = (request: Request, board: Board) => ({ id: board.id, nombre: board.name, enlace: boardUrl(request, board.id), editado: new Date(board.updatedAt).toISOString() })

async function ownBoards(env: CanvasEnv, userId: string) {
	const { boards } = await (await catalog(env).fetch(`http://catalog/api/library?owner=${encodeURIComponent(userId)}`)).json<BoardLibrary>()
	return boards.filter((board) => !board.trashedAt).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function createPersonalBoard(env: CanvasEnv, userId: string, name: unknown) {
	const response = await catalog(env).fetch('http://catalog/api/personal-boards', { method: 'POST', body: JSON.stringify({ name, ownerId: userId }) })
	const body = await response.json<Board & { error?: string }>()
	if (!response.ok) throw new ToolError(body.error ?? 'No pude crear el canvas.')
	return body
}

async function ownBoard(env: CanvasEnv, agent: AgentIdentity, value: unknown) {
	if (typeof value !== 'string' || !value.trim()) throw new ToolError('Indica el canvas (su id, enlace o nombre). Usa listar_canvases para verlos.')
	const id = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/.exec(value)?.[0]
	const board = id ? await readBoard(env, id) : (await ownBoards(env, agent.user.id)).find((candidate) => candidate.name.trim().toLocaleLowerCase('es') === value.trim().toLocaleLowerCase('es'))
	// Class canvases and other students' canvases look the same as missing ones.
	if (!board || board.trashedAt || board.ownerId !== agent.user.id) throw new ToolError(`No encontré ese canvas entre los canvases personales de ${agent.user.name}. Usa listar_canvases o crear_canvas.`)
	return board
}

function room(env: CanvasEnv, boardId: string) { return env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(boardId)) }

function describe(diagram: ReadDiagram) {
	const name = new Map(diagram.nodos.map((node) => [node.id, node.texto]))
	const lines = [`«${diagram.titulo}»${diagram.enMarco ? '' : ' (figuras sueltas, fuera de un marco)'}: ${diagram.nodos.length} nodos y ${diagram.flechas.length} flechas.`]
	for (const node of diagram.nodos) lines.push(`- [${node.id}] ${node.tipo}: ${node.texto}`)
	for (const edge of diagram.flechas) lines.push(`- ${name.get(edge.de)} → ${name.get(edge.a)}${edge.etiqueta ? ` (${edge.etiqueta})` : ''}`)
	if (diagram.huecos.length) lines.push('Huecos para preguntar al alumno, uno por uno:', ...diagram.huecos.map((gap) => `- ${gap.mensaje}`))
	else if (diagram.nodos.length) lines.push('Sin huecos.')
	if (diagram.otros.length) lines.push('Fuera del diagrama:', ...diagram.otros.map((other) => `- ${other}`))
	return lines.join('\n')
}

async function callTool(name: string, args: Record<string, unknown>, agent: AgentIdentity, request: Request, env: CanvasEnv) {
	if (name === 'listar_canvases') {
		const boards = (await ownBoards(env, agent.user.id)).map((board) => summary(request, board))
		const text = boards.length ? boards.map((board) => `- ${board.nombre} (id ${board.id}): ${board.enlace}`).join('\n') : `${agent.user.name} todavía no tiene canvases personales. Crea uno con crear_canvas.`
		return { content: [{ type: 'text', text }], structuredContent: { alumno: agent.user.name, canvases: boards } }
	}
	if (name === 'crear_canvas') {
		const board = summary(request, await createPersonalBoard(env, agent.user.id, args.nombre))
		return { content: [{ type: 'text', text: `Creé el canvas «${board.nombre}» (id ${board.id}): ${board.enlace}` }], structuredContent: { canvas: board } }
	}
	if (name === 'dibujar_diagrama') {
		const board = await ownBoard(env, agent, args.canvas)
		const chart = parseFlowchart(args)
		const result = await room(env, board.id).drawFlowchart(chart)
		await catalog(env).fetch(`http://catalog/api/boards/${board.id}`, { method: 'PATCH', body: JSON.stringify({ touch: true }) })
		if (result.canvasSvg) await saveSvgThumbnail(env, board, result.canvasSvg)
		const diagram = result.diagram as ReadDiagram | null
		const huecos = diagram?.huecos ?? []
		const intro = `${result.created ? 'Dibujé' : 'Actualicé'} «${chart.titulo}» en «${board.name}»: ${boardUrl(request, board.id)}${result.kept ? `\nRespeté la posición de ${result.kept} ${result.kept === 1 ? 'nodo que el alumno movió' : 'nodos que el alumno movió'} a mano.` : ''}`
		const gaps = huecos.length ? `\nHuecos para preguntar al alumno, uno por uno (no los rellenes tú):\n${huecos.map((gap) => `- ${gap.mensaje}`).join('\n')}` : '\nSin huecos.'
		return {
			content: [{ type: 'text', text: intro + gaps }],
			structuredContent: { canvas: summary(request, board), titulo: chart.titulo, creado: result.created, nodosMovidosAMano: result.kept, huecos, indicacion: huecos.length ? 'Pregunta los huecos al alumno uno por uno, con sus palabras. No los rellenes tú.' : 'Comparte el enlace con el alumno.' },
			// Only the chat view reads this; models get the text and structured content.
			...(result.svg ? { _meta: { 'xp-canvas/svg': result.svg } } : {}),
		}
	}
	const board = await ownBoard(env, agent, args.canvas)
	const { diagrams, svg } = await room(env, board.id).readFlowcharts() as { diagrams: ReadDiagram[]; svg: string | null }
	const text = diagrams.length ? diagrams.map(describe).join('\n\n') : 'El canvas está vacío.'
	return { content: [{ type: 'text', text: `Canvas «${board.name}» (${boardUrl(request, board.id)})\n\n${text}` }], structuredContent: { canvas: summary(request, board), diagramas: diagrams }, ...(svg ? { _meta: { 'xp-canvas/svg': svg } } : {}) }
}

/**
 * Canvases the agent drew before anyone opened them would show an empty card in the library.
 * Until a browser saves the real PNG preview, the card shows the diagrams as SVG.
 */
async function saveSvgThumbnail(env: CanvasEnv, board: Board, svg: string) {
	const key = `boards/${board.id}/thumbnail.png`
	const current = board.thumbnailAt ? await env.TLDRAW_BUCKET.head(key) : null
	if (current && current.httpMetadata?.contentType !== 'image/svg+xml') return
	await env.TLDRAW_BUCKET.put(key, svg, { httpMetadata: { contentType: 'image/svg+xml' } })
	await catalog(env).fetch(`http://catalog/api/boards/${board.id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail: true }) })
}
