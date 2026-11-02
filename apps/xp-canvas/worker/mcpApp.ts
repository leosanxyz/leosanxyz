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
.stage { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #f8fafc; }
/* The whole diagram always fits: the script sizes the SVG to the width and height available. */
.stage svg { display: block; width: 100%; }
#pending { margin-top: 8px; }
.empty { padding: 24px; text-align: center; }
</style></head>
<body><main>
<header><div><h1 id="title">XP Canvas</h1><p id="subtitle"></p></div><button id="open" hidden>Abrir en XP Canvas</button></header>
<div class="stage" id="stage"><p class="empty">Esperando el diagrama…</p></div>
<p id="pending" hidden></p>
</main>
<script>
(() => {
	let nextId = 1, link = null, maxHeight = null
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
			parsed.removeAttribute('width'); parsed.removeAttribute('height')
			parsed.setAttribute('preserveAspectRatio', 'xMidYMid meet')
			$('stage').replaceChildren(document.importNode(parsed, true))
		} else $('stage').innerHTML = '<p class="empty">Este canvas todavía no tiene diagramas.</p>'
		// The agent asks about each gap one at a time; the view only says how many are left.
		const gaps = (data.huecos || (data.diagramas || []).flatMap((d) => d.huecos || [])).length
		$('pending').hidden = !gaps
		$('pending').textContent = gaps === 1 ? 'Falta 1 cosa por decidir.' : 'Faltan ' + gaps + ' cosas por decidir.'
		fit()
	}
	// Scale the drawing to the card: full width unless that makes it taller than the host allows.
	function fit() {
		const svg = $('stage').querySelector('svg')
		if (svg) {
			const box = svg.viewBox.baseVal, width = $('stage').clientWidth || 600
			const chrome = document.documentElement.scrollHeight - $('stage').offsetHeight
			const limit = Math.max(220, (maxHeight || (window.openai && window.openai.maxHeight) || 520) - chrome - 4)
			const height = Math.min(width * box.height / box.width, limit)
			svg.style.height = Math.round(height) + 'px'
		}
		requestAnimationFrame(sizeChanged)
	}
	function readHost(context) {
		const size = context && context.containerDimensions
		if (size && typeof size.maxHeight === 'number') maxHeight = size.maxHeight
		else if (size && typeof size.height === 'number') maxHeight = size.height
		fit()
	}
	window.addEventListener('resize', fit)
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
		if (message.method === 'ui/notifications/host-context-changed') readHost(message.params)
	})
	// Apps SDK hosts (ChatGPT) also expose the result directly.
	if (window.openai && window.openai.toolOutput) show({ structuredContent: window.openai.toolOutput, _meta: window.openai.toolResponseMetadata })
	window.addEventListener('openai:set_globals', () => { if (window.openai && window.openai.toolOutput) show({ structuredContent: window.openai.toolOutput, _meta: window.openai.toolResponseMetadata }) })
	request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'xp-canvas-diagrama', version: '1.0.0' }, appCapabilities: {} })
		.then((result) => { readHost(result && result.hostContext); send({ method: 'ui/notifications/initialized', params: {} }) })
		.catch(() => {})
})()
</script></body></html>`
