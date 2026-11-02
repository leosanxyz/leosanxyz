// MCP Apps view (io.modelcontextprotocol/ui): shows the diagram the agent just drew or read, inside the
// chat of hosts that render it (ChatGPT, Codex desktop). Hosts without UI use the text result instead.
// The view only displays the server's SVG and opens the canvas link through the host.

export const DIAGRAM_VIEW_URI = 'ui://xp-canvas/diagrama.html'
export const MCP_APP_MIME = 'text/html;profile=mcp-app'

export const DIAGRAM_VIEW_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>XP Canvas</title>
<style>
:root { color-scheme: light dark; --ink: #1d1d1d; --muted: #6b7280; --line: #e5e7eb; --paper: #ffffff; --accent: #1d1d1d; --accent-ink: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --ink: #f3f4f6; --muted: #9ca3af; --line: #374151; --paper: #111827; --accent: #f3f4f6; --accent-ink: #111827; } }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: transparent; }
main { padding: 12px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
h1 { font-size: 15px; font-weight: 600; margin: 0; }
p { margin: 0; color: var(--muted); font-size: 13px; }
button { flex: none; border: 0; border-radius: 999px; padding: 8px 14px; background: var(--accent); color: var(--accent-ink); font: inherit; font-size: 13px; cursor: pointer; }
.stage { border: 1px solid var(--line); border-radius: 10px; overflow: auto; max-height: 560px; background: #f8fafc; }
.stage svg { display: block; width: 100%; height: auto; min-width: 320px; }
ul { margin: 10px 0 0; padding-left: 18px; font-size: 14px; }
li + li { margin-top: 4px; }
.empty { padding: 24px; text-align: center; }
</style></head>
<body><main>
<header><div><h1 id="title">XP Canvas</h1><p id="subtitle"></p></div><button id="open" hidden>Abrir en XP Canvas</button></header>
<div class="stage" id="stage"><p class="empty">Esperando el diagrama…</p></div>
<ul id="gaps" hidden></ul>
</main>
<script>
(() => {
	let nextId = 1, link = null
	const pending = new Map()
	const send = (message) => window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*')
	const request = (method, params) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); send({ id, method, params }) })
	const $ = (id) => document.getElementById(id)
	function sizeChanged() { send({ method: 'ui/notifications/size-changed', params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } }) }
	function show(result) {
		if (!result) return
		const data = result.structuredContent || {}, meta = result._meta || {}
		const canvas = data.canvas || {}
		link = canvas.enlace || null
		$('title').textContent = data.titulo || canvas.nombre || 'XP Canvas'
		$('subtitle').textContent = canvas.nombre && data.titulo ? canvas.nombre : ''
		$('open').hidden = !link
		const svg = meta['xp-canvas/svg']
		if (typeof svg === 'string' && svg.startsWith('<svg')) {
			// The server builds this SVG and escapes every text; it carries no scripts or links.
			const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
			$('stage').replaceChildren(document.importNode(parsed, true))
		} else $('stage').innerHTML = '<p class="empty">Este canvas todavía no tiene diagramas.</p>'
		const gaps = (data.huecos || (data.diagramas || []).flatMap((d) => d.huecos || [])).map((gap) => gap.mensaje)
		$('gaps').hidden = !gaps.length
		$('gaps').replaceChildren(...gaps.map((text) => { const li = document.createElement('li'); li.textContent = text; return li }))
		requestAnimationFrame(sizeChanged)
	}
	$('open').addEventListener('click', () => {
		if (!link) return
		if (window.openai && window.openai.openExternal) window.openai.openExternal({ href: link })
		else request('ui/open-link', { url: link }).catch(() => window.open(link, '_blank', 'noopener'))
	})
	window.addEventListener('message', (event) => {
		if (event.source !== window.parent) return
		const message = event.data
		if (!message || message.jsonrpc !== '2.0') return
		if (message.id != null && pending.has(message.id)) {
			const entry = pending.get(message.id); pending.delete(message.id)
			message.error ? entry.reject(message.error) : entry.resolve(message.result)
			return
		}
		if (message.method === 'ui/notifications/tool-result') show(message.params)
	})
	// Apps SDK hosts (ChatGPT) also expose the result directly.
	if (window.openai && window.openai.toolOutput) show({ structuredContent: window.openai.toolOutput, _meta: window.openai.toolResponseMetadata })
	window.addEventListener('openai:set_globals', () => { if (window.openai && window.openai.toolOutput) show({ structuredContent: window.openai.toolOutput, _meta: window.openai.toolResponseMetadata }) })
	request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'xp-canvas-diagrama', version: '1.0.0' }, appCapabilities: {} })
		.then(() => send({ method: 'ui/notifications/initialized', params: {} }))
		.catch(() => {})
})()
</script></body></html>`
