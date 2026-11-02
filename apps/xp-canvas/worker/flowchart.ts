import type { TLRecord } from '@tldraw/tlschema'
import { getIndicesBetween, type IndexKey } from '@tldraw/utils'

// Diagramas de flujo de la clase de Lógica: el agente dicta nodos y flechas, el servidor los acomoda
// como shapes normales de tldraw y los vuelve a leer, incluidos los cambios que el alumno haga a mano.

export const NODE_KINDS = ['inicio', 'fin', 'proceso', 'decision'] as const
export type NodeKind = typeof NODE_KINDS[number]
export interface FlowNode { id: string; tipo: NodeKind; texto: string }
export interface FlowEdge { de: string; a: string; etiqueta?: string }
export interface Flowchart { titulo: string; nodos: FlowNode[]; flechas: FlowEdge[] }
export interface Gap { tipo: string; mensaje: string; nodos: string[] }

export const LIMITS = { nodes: 60, edges: 120, text: 200, label: 40, title: 80, note: 2000, noteLines: 60, notes: 30 }

/** A diagram of what the game already does, taken from the project's code. Everything else is dictated by the student. */
export const TODAY_PREFIX = 'Así funciona hoy:'
export const isTodayTitle = (title: string) => fold(title).startsWith(fold(TODAY_PREFIX))
/** "Así funciona hoy: Lobo mascota" sits next to the student's "Lobo mascota". */
const todayCounterpart = (title: string) => title.slice(title.indexOf(':') + 1).trim()

export class FlowchartError extends Error {}

const ID = /^[A-Za-z0-9_-]{1,64}$/
function cleanText(value: unknown, max: number, what: string) {
	if (typeof value !== 'string') throw new FlowchartError(`${what} debe ser texto.`)
	const text = value.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim()
	if (!text) throw new FlowchartError(`${what} está vacío.`)
	if (text.length > max) throw new FlowchartError(`${what} tiene más de ${max} caracteres.`)
	return text
}

export function parseFlowchart(value: unknown): Flowchart {
	const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
	const titulo = cleanText(data.titulo, LIMITS.title, 'El título')
	if (!Array.isArray(data.nodos) || !data.nodos.length) throw new FlowchartError('El diagrama necesita al menos un nodo.')
	if (data.nodos.length > LIMITS.nodes) throw new FlowchartError(`Un diagrama admite hasta ${LIMITS.nodes} nodos.`)
	const flechasIn = data.flechas ?? []
	if (!Array.isArray(flechasIn)) throw new FlowchartError('`flechas` debe ser una lista.')
	if (flechasIn.length > LIMITS.edges) throw new FlowchartError(`Un diagrama admite hasta ${LIMITS.edges} flechas.`)
	const ids = new Set<string>()
	const nodos = data.nodos.map((raw, index): FlowNode => {
		const node = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
		if (typeof node.id !== 'string' || !ID.test(node.id)) throw new FlowchartError(`El nodo ${index + 1} necesita un id de letras, números, - o _.`)
		if (ids.has(node.id)) throw new FlowchartError(`El id «${node.id}» está repetido.`)
		ids.add(node.id)
		if (!NODE_KINDS.includes(node.tipo as NodeKind)) throw new FlowchartError(`El nodo «${node.id}» debe ser de tipo ${NODE_KINDS.join(', ')}.`)
		return { id: node.id, tipo: node.tipo as NodeKind, texto: cleanText(node.texto, LIMITS.text, `El texto de «${node.id}»`) }
	})
	const seen = new Set<string>()
	const flechas: FlowEdge[] = []
	for (const [index, raw] of flechasIn.entries()) {
		const edge = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
		if (typeof edge.de !== 'string' || !ids.has(edge.de)) throw new FlowchartError(`La flecha ${index + 1} sale de un nodo que no existe (${String(edge.de)}).`)
		if (typeof edge.a !== 'string' || !ids.has(edge.a)) throw new FlowchartError(`La flecha ${index + 1} llega a un nodo que no existe (${String(edge.a)}).`)
		const etiqueta = edge.etiqueta == null || edge.etiqueta === '' ? undefined : normalizeLabel(cleanText(edge.etiqueta, LIMITS.label, `La etiqueta de la flecha ${index + 1}`))
		const key = `${edge.de}\n${edge.a}\n${etiqueta ?? ''}`
		if (seen.has(key)) continue
		seen.add(key)
		flechas.push({ de: edge.de, a: edge.a, ...(etiqueta ? { etiqueta } : {}) })
	}
	return { titulo, nodos, flechas }
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export function normalizeLabel(label: string) {
	const key = fold(label)
	if (['si', 'yes', 'verdadero', 'true', 'cierto'].includes(key)) return 'SÍ'
	if (['no', 'falso', 'false'].includes(key)) return 'NO'
	return label
}

// --- Huecos ---------------------------------------------------------------------------------------

export function findGaps({ nodos, flechas }: Pick<Flowchart, 'nodos' | 'flechas'>): Gap[] {
	const gaps: Gap[] = []
	const name = new Map(nodos.map((node) => [node.id, `«${node.texto}»`]))
	const outs = new Map(nodos.map((node) => [node.id, flechas.filter((edge) => edge.de === node.id)]))
	const starts = nodos.filter((node) => node.tipo === 'inicio')
	if (!starts.length) gaps.push({ tipo: 'sin-inicio', mensaje: 'Falta el inicio: ¿con qué empieza?', nodos: [] })
	if (starts.length > 1) gaps.push({ tipo: 'varios-inicios', mensaje: `Hay ${starts.length} inicios (${starts.map((n) => name.get(n.id)).join(', ')}). ¿Cuál es el verdadero?`, nodos: starts.map((n) => n.id) })
	if (!nodos.some((node) => node.tipo === 'fin')) gaps.push({ tipo: 'sin-fin', mensaje: 'Falta el fin: ¿cuándo termina?', nodos: [] })
	for (const node of nodos) {
		const out = outs.get(node.id)!
		if (node.tipo === 'decision') {
			const labels = out.map((edge) => edge.etiqueta)
			if (!labels.includes('SÍ')) gaps.push({ tipo: 'decision-sin-si', mensaje: `En la decisión ${name.get(node.id)}, ¿qué pasa si la respuesta es SÍ?`, nodos: [node.id] })
			if (!labels.includes('NO')) gaps.push({ tipo: 'decision-sin-no', mensaje: `En la decisión ${name.get(node.id)}, ¿qué pasa si la respuesta es NO?`, nodos: [node.id] })
			if (out.some((edge) => !edge.etiqueta)) gaps.push({ tipo: 'flecha-sin-etiqueta', mensaje: `Una flecha que sale de ${name.get(node.id)} no dice si es SÍ o NO.`, nodos: [node.id] })
		} else if (node.tipo === 'fin') {
			if (out.length) gaps.push({ tipo: 'fin-con-salida', mensaje: `${name.get(node.id)} es un fin, pero tiene una flecha que sale. ¿Ahí termina o sigue?`, nodos: [node.id] })
		} else {
			if (!out.length) gaps.push({ tipo: 'sin-salida', mensaje: `Después de ${name.get(node.id)} no sigue nada. ¿Qué pasa después?`, nodos: [node.id] })
			if (out.length > 1) gaps.push({ tipo: 'varias-salidas', mensaje: `${name.get(node.id)} tiene ${out.length} salidas, pero no es una decisión. ¿Qué pregunta decide el camino?`, nodos: [node.id] })
		}
	}
	if (starts.length) {
		const reached = new Set<string>(), stack = starts.map((node) => node.id)
		while (stack.length) {
			const id = stack.pop()!
			if (reached.has(id)) continue
			reached.add(id)
			for (const edge of outs.get(id) ?? []) stack.push(edge.a)
		}
		for (const node of nodos) if (!reached.has(node.id) && node.tipo !== 'inicio') gaps.push({ tipo: 'inalcanzable', mensaje: `Desde el inicio no se llega a ${name.get(node.id)}. ¿Qué paso lleva hasta ahí?`, nodos: [node.id] })
	}
	for (const cycle of stronglyConnected(nodos.map((node) => node.id), flechas)) {
		const inside = new Set(cycle)
		const loops = cycle.length > 1 || flechas.some((edge) => edge.de === cycle[0] && edge.a === cycle[0])
		if (loops && !flechas.some((edge) => inside.has(edge.de) && !inside.has(edge.a))) {
			gaps.push({ tipo: 'ciclo-sin-salida', mensaje: `El ciclo ${cycle.map((id) => name.get(id)).join(' → ')} nunca termina. ¿Cuándo se sale de él?`, nodos: cycle })
		}
	}
	return gaps
}

function stronglyConnected(ids: string[], edges: FlowEdge[]) {
	// Tarjan, iterative enough for 60 nodes.
	let counter = 0
	const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], onStack = new Set<string>(), result: string[][] = []
	const visit = (id: string) => {
		index.set(id, counter); low.set(id, counter); counter++
		stack.push(id); onStack.add(id)
		for (const edge of edges) {
			if (edge.de !== id) continue
			if (!index.has(edge.a)) { visit(edge.a); low.set(id, Math.min(low.get(id)!, low.get(edge.a)!)) }
			else if (onStack.has(edge.a)) low.set(id, Math.min(low.get(id)!, index.get(edge.a)!))
		}
		if (low.get(id) === index.get(id)) {
			const component: string[] = []
			let next: string
			do { next = stack.pop()!; onStack.delete(next); component.push(next) } while (next !== id)
			result.push(component.reverse())
		}
	}
	for (const id of ids) if (!index.has(id)) visit(id)
	return result
}

// --- Acomodo --------------------------------------------------------------------------------------

const CHAR = 12, LINE = 30
const WRAP: Record<NodeKind, number> = { inicio: 16, fin: 16, proceso: 20, decision: 14 }

export function wrapText(text: string, width: number) {
	const lines: string[] = []
	let line = ''
	for (const word of text.split(' ')) {
		for (let part = word; part; part = part.slice(width)) {
			const piece = part.slice(0, width)
			if (!line) line = piece
			else if (line.length + 1 + piece.length <= width) line += ` ${piece}`
			else { lines.push(line); line = piece }
		}
	}
	if (line) lines.push(line)
	return lines
}

export function nodeSize(node: Pick<FlowNode, 'tipo' | 'texto'>) {
	const lines = wrapText(node.texto, WRAP[node.tipo])
	const textW = Math.max(...lines.map((line) => line.length)) * CHAR, textH = lines.length * LINE
	if (node.tipo === 'decision') return { w: Math.round(Math.max(220, textW * 2 + 40)), h: Math.round(Math.max(140, textH * 2 + 40)), lines }
	if (node.tipo === 'proceso') return { w: Math.round(Math.max(200, textW + 56)), h: Math.max(84, textH + 44), lines }
	return { w: Math.round(Math.max(170, textW + 90)), h: Math.max(76, textH + 46), lines }
}

/** How far tldraw's elbow arrows go out from a shape's side before turning. */
const ARROW_GUTTER = 44
export interface Placement { x: number; y: number; w: number; h: number; row: number; col: number }
export interface EdgeRoute { start: { x: number; y: number }; end: { x: number; y: number }; back: boolean }

/** Arriba hacia abajo: SÍ sigue en la columna, NO se abre a la derecha y los ciclos regresan por un costado. */
export function layoutFlowchart({ nodos, flechas }: Pick<Flowchart, 'nodos' | 'flechas'>) {
	const rank = (edge: FlowEdge) => edge.etiqueta === 'NO' ? 2 : edge.etiqueta === 'SÍ' ? 0 : 1
	const outs = new Map(nodos.map((node) => [node.id, flechas.filter((edge) => edge.de === node.id).sort((a, b) => rank(a) - rank(b))]))
	const roots = [...nodos.filter((node) => node.tipo === 'inicio'), ...nodos.filter((node) => node.tipo !== 'inicio')].map((node) => node.id)

	// 1. Depth-first order from the start marks the arrows that close a loop.
	const order: string[] = [], back = new Set<FlowEdge>(), state = new Map<string, 'open' | 'done'>()
	const dfs = (id: string) => {
		state.set(id, 'open'); order.push(id)
		for (const edge of outs.get(id)!) {
			const target = state.get(edge.a)
			if (target === 'open') back.add(edge)
			else if (!target) dfs(edge.a)
		}
		state.set(id, 'done')
	}
	for (const id of roots) if (!state.has(id)) dfs(id)

	// 2. Rows: longest path over forward arrows, so merges sit below every branch that reaches them.
	const row = new Map(order.map((id) => [id, 0]))
	for (let pass = 0; pass < nodos.length; pass++) {
		let changed = false
		for (const edge of flechas) {
			if (back.has(edge) || edge.de === edge.a) continue
			const next = row.get(edge.de)! + 1
			if (next > row.get(edge.a)!) { row.set(edge.a, next); changed = true }
		}
		if (!changed) break
	}

	// 3. Columns: the first exit keeps the column, every other exit (NO) opens one to the right.
	// Columns follow the depth-first walk, so a step where two paths meet belongs to the main path
	// (SÍ goes first) and the NO branch comes back to it as a detour.
	const col = new Map<string, number>(), taken = new Set<string>()
	let maxCol = -1
	const place = (id: string, wanted: number) => {
		let c = wanted
		while (taken.has(`${row.get(id)}:${c}`)) c++
		col.set(id, c); taken.add(`${row.get(id)}:${c}`); maxCol = Math.max(maxCol, c)
	}
	const visit = (id: string, wanted: number) => {
		place(id, wanted)
		let first = true
		for (const edge of outs.get(id)!) {
			if (back.has(edge) || col.has(edge.a)) continue
			visit(edge.a, first && edge.etiqueta !== 'NO' ? col.get(id)! : maxCol + 1)
			first = false
		}
	}
	for (const id of order) if (!col.has(id)) visit(id, maxCol + 1)

	// 4. Coordinates.
	const sizes = new Map(nodos.map((node) => [node.id, nodeSize(node)]))
	const colWidth = Math.max(...[...sizes.values()].map((size) => size.w)) + 150
	const rows = Math.max(...row.values()) + 1
	const rowHeight = Array.from({ length: rows }, (_, r) => Math.max(0, ...nodos.filter((node) => row.get(node.id) === r).map((node) => sizes.get(node.id)!.h)))
	const rowTop: number[] = []
	for (let r = 0, y = 0; r < rows; r++) { rowTop.push(y); y += rowHeight[r] + 90 }
	const placements = new Map<string, Placement>()
	for (const node of nodos) {
		const { w, h } = sizes.get(node.id)!, r = row.get(node.id)!, c = col.get(node.id)!
		placements.set(node.id, { x: Math.round(c * colWidth + (colWidth - w) / 2), y: Math.round(rowTop[r] + (rowHeight[r] - h) / 2), w, h, row: r, col: c })
	}
	// An arrow that skips steps in its own column would run over them: it goes around on the right.
	const detour = new Set(flechas.filter((edge) => {
		if (back.has(edge) || edge.de === edge.a || col.get(edge.de) !== col.get(edge.a)) return false
		const from = row.get(edge.de)!, to = row.get(edge.a)!
		return nodos.some((node) => col.get(node.id) === col.get(edge.de) && row.get(node.id)! > from && row.get(node.id)! < to)
	}))
	// Arrows that go around a column (loops, detours) count as part of the drawing, so they get the margin too.
	const reach: number[] = []
	for (const edge of flechas) {
		const a = placements.get(edge.de)!, b = placements.get(edge.a)!
		const side = detour.has(edge) ? 1 : back.has(edge) || edge.de === edge.a ? edgeAnchors(a, b, true).start.x : null
		if (side === 0) reach.push(Math.min(a.x, b.x) - ARROW_GUTTER)
		if (side === 1) reach.push(Math.max(a.x + a.w, b.x + b.w) + ARROW_GUTTER)
	}
	// Columns center their nodes, so the widest column may not start at 0. Start the drawing at the
	// top-left corner: the frame then gets the same margin on every side.
	const left = Math.min(...[...placements.values()].map((place) => place.x), ...reach), top = Math.min(...[...placements.values()].map((place) => place.y))
	const right = Math.max(...[...placements.values()].map((place) => place.x + place.w), ...reach)
	for (const place of placements.values()) { place.x -= left; place.y -= top }
	return { placements, back, detour, width: right - left }
}

/** Where each arrow leaves and enters, as normalized anchors on the bound shapes. */
export function edgeAnchors(from: Placement, to: Placement, isBack: boolean, isDetour = false) {
	// Out on the right, down the gutter and into the step from its side.
	if (isDetour) return { start: { x: 1, y: 0.5 }, end: { x: 1, y: 0.5 } }
	if (isBack || to.row <= from.row && from !== to) {
		// Loops return on the outer side so they do not cross the main column.
		const side = from.col > to.col ? 1 : 0
		return { start: { x: side, y: 0.5 }, end: { x: side, y: 0.5 } }
	}
	if (from === to) return { start: { x: 1, y: 0.5 }, end: { x: 0.5, y: 0 } }
	if (to.col > from.col) return { start: { x: 1, y: 0.5 }, end: { x: 0.5, y: 0 } }
	if (to.col < from.col) return { start: { x: 0.5, y: 1 }, end: { x: 1, y: 0.5 } }
	return { start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } }
}

// --- Rich text ------------------------------------------------------------------------------------

type RichNode = { type: string; text?: string; content?: RichNode[] }
export function richText(lines: string[]) {
	const content: RichNode[] = []
	lines.forEach((line, index) => { if (index) content.push({ type: 'hardBreak' }); content.push({ type: 'text', text: line }) })
	return { type: 'doc', content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] }
}
export function plainText(value: unknown): string {
	const parts: string[] = []
	const walk = (node: RichNode | undefined) => {
		if (!node || typeof node !== 'object') return
		if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
		else if (node.type === 'hardBreak') parts.push(' ')
		if (Array.isArray(node.content)) node.content.forEach((child, index) => { if (index && node.type === 'doc') parts.push(' '); walk(child) })
	}
	walk(value as RichNode)
	return parts.join('').replace(/\s+/g, ' ').trim()
}

// --- Escribir en el documento ---------------------------------------------------------------------

type Store = { get(id: string): TLRecord | undefined; set(id: string, record: TLRecord): void; delete(id: string): void; values(): Iterable<TLRecord> }
type AnyShape = Extract<TLRecord, { typeName: 'shape' }>
type Validate = (record: TLRecord) => void

const GEO: Record<NodeKind, string> = { inicio: 'ellipse', fin: 'ellipse', proceso: 'rectangle', decision: 'diamond' }
const COLOR: Record<NodeKind, string> = { inicio: 'green', fin: 'green', proceso: 'blue', decision: 'orange' }
/** Diagrams of what the game does today are violet, so they never pass for the student's design. */
const TODAY_COLOR = 'violet'
const NOTE_WIDTH = 460, NOTE_GAP = 90
/** tldraw cuts a frame's heading at the frame's width; about 17 canvas units per character at classroom zoom. */
const titleWidth = (title: string) => title.length * 17 + 40
const FRAME_PAD = 70

const shapeBase = (id: string, type: string, parentId: string, index: IndexKey, x: number, y: number, props: object, meta: object) =>
	({ id, typeName: 'shape', type, x, y, rotation: 0, index, parentId, isLocked: false, opacity: 1, props, meta }) as unknown as TLRecord

const isShape = (record: TLRecord | undefined): record is AnyShape => record?.typeName === 'shape'
const pageOf = (records: Map<string, TLRecord>, shape: AnyShape): string => {
	let parent = shape.parentId as string
	for (let depth = 0; depth < 50 && parent.startsWith('shape:'); depth++) {
		const next = records.get(parent)
		if (!isShape(next)) break
		parent = next.parentId
	}
	return parent
}
function shapeWidth(shape: AnyShape) {
	const props = shape.props as { w?: number; h?: number; growY?: number }, meta = shape.meta as { xpH?: number }
	// Text grows with its content and stores no height; notes remember the height estimated when written.
	const h = typeof props.h === 'number' ? props.h : typeof meta.xpH === 'number' ? meta.xpH : 100
	return { w: typeof props.w === 'number' ? props.w : 200, h: h + (props.growY ?? 0) }
}
const movedByHand = (shape: AnyShape) => {
	const pos = (shape.meta as { xpPos?: { x: number; y: number } }).xpPos
	return !pos || Math.abs(pos.x - shape.x) > 1 || Math.abs(pos.y - shape.y) > 1
}
const isNote = (shape: AnyShape) => shape.type === 'text' && typeof (shape.meta as { xpNote?: unknown }).xpNote === 'string'
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** Moves right from `x` until a box of this size fits on the page without covering anything. */
function freeSpot(records: Map<string, TLRecord>, pageId: string, x: number, y: number, w: number, h: number) {
	const boxes = [...records.values()].filter((record): record is AnyShape => isShape(record) && record.parentId === pageId).map((shape) => ({ x: shape.x, y: shape.y, ...shapeWidth(shape) }))
	for (let tries = 0; tries < 200; tries++) {
		const hit = boxes.find((box) => overlaps({ x: x - 40, y: y - 40, w: w + 80, h: h + 80 }, box))
		if (!hit) break
		x = hit.x + hit.w + 120
	}
	return { x: Math.round(x), y: Math.round(y) }
}
function indicesAfter(records: Iterable<TLRecord>, parentId: string, n: number) {
	let max: IndexKey | null = null
	for (const record of records) if (isShape(record) && record.parentId === parentId && (!max || record.index > max)) max = record.index
	return getIndicesBetween(max, null, n)
}
const frameKey = (name: string) => fold(name).replace(/\s+/g, ' ')

export interface DrawResult { frameId: string; created: boolean; kept: number }

/**
 * Creates the diagram in a frame named after its title, or updates the frame with that title.
 * Nodes the student moved by hand keep their position; everything else follows the layout.
 * Only node shapes and the arrows between them are replaced; text, drawings and loose arrows stay.
 */
export function writeFlowchart(store: Store, chart: Flowchart, validate: Validate, newId: () => string = () => crypto.randomUUID()): DrawResult {
	const records = new Map<string, TLRecord>()
	for (const record of store.values()) records.set(record.id, record)
	const pages = [...records.values()].filter((record) => record.typeName === 'page').sort((a, b) => (a as { index: string }).index < (b as { index: string }).index ? -1 : 1)
	if (!pages.length) throw new FlowchartError('El canvas no tiene páginas.')
	const frames = [...records.values()].filter((record): record is AnyShape => isShape(record) && record.type === 'frame')
	let frame = frames.find((shape) => frameKey((shape.props as { name: string }).name) === frameKey(chart.titulo))
	const created = !frame
	const pageId = frame ? pageOf(records, frame) : pages[0].id
	const writes: TLRecord[] = [], deletes = new Set<string>()

	const { placements, back, detour, width } = layoutFlowchart(chart)
	const bounds = [...placements.values()].reduce((acc, p) => ({ w: Math.max(acc.w, p.x + p.w), h: Math.max(acc.h, p.y + p.h) }), { w: width, h: 0 })
	// A title wider than the drawing widens the frame; the drawing stays centered under it.
	const centering = Math.max(0, Math.round((titleWidth(chart.titulo) - bounds.w - FRAME_PAD * 2) / 2))
	if (centering) { for (const place of placements.values()) place.x += centering; bounds.w += centering * 2 }

	const today = isTodayTitle(chart.titulo)
	if (!frame) {
		const w = bounds.w + FRAME_PAD * 2, h = bounds.h + FRAME_PAD * 2
		// What the game does today goes right next to the diagram the student dictated, to compare them.
		const pair = today ? frames.find((shape) => shape.parentId === pageId && frameKey((shape.props as { name: string }).name) === frameKey(todayCounterpart(chart.titulo))) : undefined
		let spot: { x: number; y: number }
		if (pair) spot = freeSpot(records, pageId, pair.x + shapeWidth(pair).w + 160, pair.y, w, h)
		else {
			// Otherwise a new diagram goes to the right of whatever is already on the page.
			let right = -Infinity, top = Infinity
			for (const record of records.values()) {
				if (!isShape(record) || record.parentId !== pageId) continue
				right = Math.max(right, record.x + shapeWidth(record).w); top = Math.min(top, record.y)
			}
			spot = { x: Number.isFinite(right) ? Math.round(right + 160) : 0, y: Number.isFinite(top) ? Math.round(top) : 0 }
		}
		const [index] = indicesAfter(records.values(), pageId, 1)
		frame = shapeBase(`shape:${newId()}`, 'frame', pageId, index, spot.x, spot.y, { w, h, name: chart.titulo, color: 'black' }, { xpDiagram: true }) as AnyShape
	}
	const frameId = frame.id as string

	// Existing nodes in this frame, matched by the id the agent used or by their tldraw id.
	const existing = new Map<string, AnyShape>()
	for (const record of records.values()) {
		if (!isShape(record) || record.parentId !== frameId || record.type !== 'geo' || !nodeKindOf(record)) continue
		const meta = record.meta as { xpNode?: string }
		existing.set(typeof meta.xpNode === 'string' ? meta.xpNode : record.id.slice('shape:'.length), record)
	}
	const shapeIds = new Map<string, string>()
	const newIndices = indicesAfter(records.values(), frameId, chart.nodos.length + chart.flechas.length)
	let nextIndex = 0, kept = 0
	for (const node of chart.nodos) {
		const place = placements.get(node.id)!, old = existing.get(node.id)
		const meta = old?.meta as { xpPos?: { x: number; y: number }; xpTipo?: string } | undefined
		const movedByHand = old && (!meta?.xpPos || Math.abs(meta.xpPos.x - old.x) > 1 || Math.abs(meta.xpPos.y - old.y) > 1)
		const size = nodeSize(node)
		const sameContent = old && plainText((old.props as { richText: unknown }).richText) === node.texto && nodeKindOf(old) === node.tipo
		const w = movedByHand && sameContent ? (old.props as { w: number }).w : size.w
		const h = movedByHand && sameContent ? (old.props as { h: number }).h : size.h
		const x = movedByHand ? old.x : place.x + FRAME_PAD, y = movedByHand ? old.y : place.y + FRAME_PAD
		if (movedByHand) kept++
		// Moved nodes keep their footprint so their arrows stay attached where the student left them.
		place.x = x - FRAME_PAD; place.y = y - FRAME_PAD; place.w = w; place.h = h
		const id = old?.id ?? `shape:${newId()}`
		shapeIds.set(node.id, id)
		const sameText = old && plainText((old.props as { richText: unknown }).richText) === node.texto
		writes.push(shapeBase(id, 'geo', frameId, old?.index ?? newIndices[nextIndex++], x, y, {
			geo: GEO[node.tipo], dash: 'solid', url: '', w, h, growY: 0, scale: 1, flipX: false, flipY: false,
			labelColor: 'black', color: today ? TODAY_COLOR : COLOR[node.tipo], fill: 'semi', size: 'm', font: 'sans', align: 'middle', verticalAlign: 'middle',
			// Keep the student's own line breaks when only the position changed.
			richText: sameText ? (old.props as { richText: unknown }).richText : richText(size.lines),
		}, { ...(old?.meta ?? {}), xpNode: node.id, xpTipo: node.tipo, xpPos: movedByHand ? meta?.xpPos ?? { x, y } : { x, y } }))
	}
	const keptIds = new Set(shapeIds.values())
	for (const shape of existing.values()) if (!keptIds.has(shape.id)) deletes.add(shape.id)

	// Arrows between nodes of this diagram are rebuilt; loose arrows and other drawings stay.
	const nodeIds = new Set([...existing.values()].map((shape) => shape.id as string))
	const bindingsByArrow = new Map<string, TLRecord[]>()
	for (const record of records.values()) {
		if (record.typeName !== 'binding') continue
		const binding = record as unknown as { fromId: string; toId: string }
		bindingsByArrow.set(binding.fromId, [...bindingsByArrow.get(binding.fromId) ?? [], record])
		if (deletes.has(binding.toId)) deletes.add(record.id)
	}
	for (const [arrowId, bindings] of bindingsByArrow) {
		const arrow = records.get(arrowId)
		if (!isShape(arrow) || arrow.type !== 'arrow' || arrow.parentId !== frameId) continue
		if (bindings.length === 2 && bindings.every((binding) => nodeIds.has((binding as unknown as { toId: string }).toId))) {
			deletes.add(arrowId)
			for (const binding of bindings) deletes.add(binding.id)
		}
	}
	for (const edge of chart.flechas) {
		const from = placements.get(edge.de)!, to = placements.get(edge.a)!
		const anchors = edgeAnchors(from, to, back.has(edge), detour.has(edge))
		const start = { x: from.x + FRAME_PAD + from.w * anchors.start.x, y: from.y + FRAME_PAD + from.h * anchors.start.y }
		const end = { x: to.x + FRAME_PAD + to.w * anchors.end.x, y: to.y + FRAME_PAD + to.h * anchors.end.y }
		const arrowId = `shape:${newId()}`
		writes.push(shapeBase(arrowId, 'arrow', frameId, newIndices[nextIndex++], start.x, start.y, {
			kind: 'elbow', labelColor: edge.etiqueta === 'SÍ' ? 'green' : edge.etiqueta === 'NO' ? 'red' : 'black', color: today ? TODAY_COLOR : 'black', fill: 'none', dash: 'solid', size: 'm',
			arrowheadStart: 'none', arrowheadEnd: 'arrow', font: 'sans', start: { x: 0, y: 0 }, end: { x: end.x - start.x, y: end.y - start.y },
			bend: 0, richText: richText(edge.etiqueta ? [edge.etiqueta] : []), labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5,
		}, { xpEdge: true }))
		for (const [terminal, target, anchor] of [['start', edge.de, anchors.start], ['end', edge.a, anchors.end]] as const) {
			writes.push({ id: `binding:${newId()}`, typeName: 'binding', type: 'arrow', fromId: arrowId, toId: shapeIds.get(target)!,
				props: { terminal, normalizedAnchor: anchor, isExact: false, isPrecise: true, snap: 'none' }, meta: {} } as unknown as TLRecord)
		}
	}

	// A note attached to this diagram follows its right edge, unless the student moved it.
	const nodesRight = Math.max(FRAME_PAD, ...writes.filter((write): write is AnyShape => isShape(write) && write.type === 'geo').map((shape) => shape.x + shapeWidth(shape).w))
	for (const record of records.values()) {
		if (!isShape(record) || record.parentId !== frameId || !isNote(record) || movedByHand(record)) continue
		const x = nodesRight + NOTE_GAP, y = FRAME_PAD
		writes.push({ ...record, x, y, meta: { ...record.meta, xpPos: { x, y } } } as TLRecord)
	}

	// The frame fits the diagram and anything the student added inside it, with the same margin on both sides.
	let maxX = bounds.w + FRAME_PAD * 2, maxY = bounds.h + FRAME_PAD * 2
	for (const record of [...records.values(), ...writes]) {
		if (!isShape(record) || record.parentId !== frameId || deletes.has(record.id) || record.type === 'arrow') continue
		const latest = writes.find((write) => write.id === record.id) as AnyShape | undefined ?? record
		const size = shapeWidth(latest)
		maxX = Math.max(maxX, latest.x + size.w + FRAME_PAD); maxY = Math.max(maxY, latest.y + size.h + FRAME_PAD)
	}
	const frameProps = frame.props as { w: number; h: number; name: string }
	writes.unshift({ ...frame, props: { ...frameProps, name: chart.titulo, w: Math.round(maxX), h: Math.round(maxY) }, meta: { ...frame.meta, xpDiagram: true, ...(today ? { xpToday: true } : {}) } } as TLRecord)

	for (const record of writes) validate(record)
	for (const id of deletes) store.delete(id)
	for (const record of writes) store.set(record.id, record)
	return { frameId, created, kept }
}

// --- Leer el documento ----------------------------------------------------------------------------

export interface ReadDiagram {
	titulo: string
	/** `dictado`: lo que el alumno dijo que debe pasar. `asi_funciona_hoy`: lo que el juego ya hace, sacado del código. */
	tipo: 'dictado' | 'asi_funciona_hoy'
	enMarco: boolean
	nodos: FlowNode[]
	flechas: FlowEdge[]
	huecos: Gap[]
	otros: string[]
}

function nodeKindOf(shape: AnyShape): NodeKind | null {
	if (shape.type !== 'geo') return null
	const meta = shape.meta as { xpTipo?: string }, geo = (shape.props as { geo: string }).geo
	if (geo === 'diamond') return 'decision'
	if (geo === 'rectangle') return 'proceso'
	if (geo === 'ellipse' || geo === 'oval') return meta.xpTipo === 'inicio' || meta.xpTipo === 'fin' ? meta.xpTipo : 'inicio'
	return null
}

/**
 * Reads every frame as a diagram, plus the nodes that are loose on a page. Anything that is not a
 * flowchart symbol or an arrow between two of them is reported in `otros` instead of breaking the read.
 */
export function readFlowcharts(all: Iterable<TLRecord>): ReadDiagram[] {
	const records = new Map<string, TLRecord>()
	for (const record of all) records.set(record.id, record)
	const shapes = [...records.values()].filter(isShape)
	const groups = new Map<string, { titulo: string; enMarco: boolean; shapes: AnyShape[] }>()
	for (const shape of shapes) {
		const parent = records.get(shape.parentId)
		const container = isShape(parent) && parent.type === 'frame' ? parent : null
		if (shape.type === 'frame' || isNote(shape)) continue
		const key = container?.id ?? `page:${pageOf(records, shape)}`
		if (!groups.has(key)) groups.set(key, { titulo: container ? (container.props as { name: string }).name || 'Sin título' : 'Fuera de un marco', enMarco: Boolean(container), shapes: [] })
		groups.get(key)!.shapes.push(shape)
	}
	const bindings = [...records.values()].filter((record) => record.typeName === 'binding') as unknown as { fromId: string; toId: string; props: { terminal: 'start' | 'end' } }[]
	const result: ReadDiagram[] = []
	for (const group of groups.values()) {
		const nodeIds = new Map<string, string>(), nodos: FlowNode[] = [], otros: string[] = [], flechas: FlowEdge[] = []
		let drawings = 0
		for (const shape of group.shapes) {
			const kind = nodeKindOf(shape)
			if (!kind) continue
			const meta = shape.meta as { xpNode?: string }
			const id = typeof meta.xpNode === 'string' && ID.test(meta.xpNode) ? meta.xpNode : shape.id.slice('shape:'.length)
			nodeIds.set(shape.id, id)
			nodos.push({ id, tipo: kind, texto: plainText((shape.props as { richText: unknown }).richText) || '(sin texto)' })
		}
		for (const shape of group.shapes) {
			if (nodeIds.has(shape.id)) continue
			const text = 'richText' in (shape.props as object) ? plainText((shape.props as { richText: unknown }).richText) : ''
			if (shape.type === 'arrow') {
				const ends = bindings.filter((binding) => binding.fromId === shape.id)
				const from = ends.find((binding) => binding.props.terminal === 'start'), to = ends.find((binding) => binding.props.terminal === 'end')
				const de = from && nodeIds.get(from.toId), a = to && nodeIds.get(to.toId)
				if (de && a) { flechas.push({ de, a, ...(text ? { etiqueta: normalizeLabel(text) } : {}) }); continue }
				const fromText = de && nodos.find((node) => node.id === de)?.texto, toText = a && nodos.find((node) => node.id === a)?.texto
				otros.push(`Flecha suelta${text ? ` «${text}»` : ''}${fromText ? ` que sale de «${fromText}»` : ''}${toText ? ` que llega a «${toText}»` : ''}${!fromText && !toText ? ' sin conectar' : ''}.`)
			} else if (shape.type === 'draw' || shape.type === 'highlight' || shape.type === 'line') drawings++
			else if (text) otros.push(`${shape.type === 'note' ? 'Nota' : shape.type === 'text' ? 'Texto' : 'Figura'}: «${text.slice(0, 200)}».`)
			else if (shape.type !== 'geo') otros.push(`Un elemento de tipo ${shape.type}.`)
			else otros.push('Una figura sin texto que no es un símbolo de diagrama de flujo.')
		}
		if (drawings) otros.push(`${drawings} ${drawings === 1 ? 'trazo' : 'trazos'} a mano.`)
		// Hand-drawn ovals have no stored role: an oval with no arrow out is the end.
		for (const node of nodos) {
			const shape = group.shapes.find((candidate) => nodeIds.get(candidate.id) === node.id)!
			if ((shape.meta as { xpTipo?: string }).xpTipo || node.tipo !== 'inicio') continue
			const text = fold(node.texto)
			if (/^(fin|termina|final|end)/.test(text) || !/^(inicio|empieza|comienza|start)/.test(text) && !flechas.some((edge) => edge.de === node.id)) node.tipo = 'fin'
		}
		if (!nodos.length && !group.enMarco) {
			if (otros.length) result.push({ titulo: group.titulo, tipo: 'dictado', enMarco: false, nodos, flechas, huecos: [], otros })
			continue
		}
		result.push({ titulo: group.titulo, tipo: group.enMarco && isTodayTitle(group.titulo) ? 'asi_funciona_hoy' : 'dictado', enMarco: group.enMarco, nodos, flechas, huecos: nodos.length ? findGaps({ nodos, flechas }) : [], otros })
	}
	return result
}

// --- Notas ----------------------------------------------------------------------------------------

export interface NoteInput { titulo: string; texto: string }
export interface ReadNote { titulo: string; texto: string; juntoA: string | null }

export function parseNote(value: unknown): NoteInput {
	const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
	const titulo = cleanText(data.titulo, LIMITS.title, 'El título')
	if (typeof data.texto !== 'string') throw new FlowchartError('El texto de la nota debe ser texto.')
	const texto = data.texto.replace(/\r\n?/g, '\n').replace(/[\x00-\x09\x0b-\x1f\x7f]+/g, ' ').split('\n').map((line) => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
	if (!texto) throw new FlowchartError('La nota está vacía.')
	if (texto.length > LIMITS.note) throw new FlowchartError(`Una nota admite hasta ${LIMITS.note} caracteres.`)
	if (texto.split('\n').length > LIMITS.noteLines) throw new FlowchartError(`Una nota admite hasta ${LIMITS.noteLines} líneas.`)
	return { titulo, texto }
}

function noteRichText(lines: string[], heading?: string) {
	const paragraph = (text: string, bold = false) => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }] } : {}) })
	return { type: 'doc', content: [...(heading ? [paragraph(heading, true)] : []), ...lines.map((line) => paragraph(line))] }
}
/** Paragraphs as lines, keeping the line breaks the student or the agent wrote. */
function richLines(value: unknown): string[] {
	const doc = value as { content?: { content?: RichNode[] }[] } | undefined
	return (doc?.content ?? []).map((paragraph) => (paragraph.content ?? []).map((node) => node.type === 'hardBreak' ? '\n' : node.text ?? '').join(''))
		.flatMap((line) => line.split('\n'))
}
const noteHeight = (lines: string[]) => lines.reduce((total, line) => total + Math.max(1, wrapText(line || ' ', 36).length), 0) * 31 + 16

export interface NoteResult { noteId: string; created: boolean; nextTo: string | null; movedByHand: boolean }

/**
 * Writes a text note next to the diagram with the same title, inside its frame so they move together.
 * Without that diagram the note goes to a free spot on the page. The same title updates the note.
 */
export function writeNote(store: Store, note: NoteInput, validate: Validate, newId: () => string = () => crypto.randomUUID()): NoteResult {
	const records = new Map<string, TLRecord>()
	for (const record of store.values()) records.set(record.id, record)
	const key = frameKey(note.titulo)
	const pages = [...records.values()].filter((record) => record.typeName === 'page').sort((a, b) => (a as { index: string }).index < (b as { index: string }).index ? -1 : 1)
	if (!pages.length) throw new FlowchartError('El canvas no tiene páginas.')
	const shapes = [...records.values()].filter(isShape)
	const frame = shapes.find((shape) => shape.type === 'frame' && frameKey((shape.props as { name: string }).name) === key)
	const old = shapes.find((shape) => isNote(shape) && (shape.meta as { xpNote: string }).xpNote === key)
	if (!old && shapes.filter(isNote).length >= LIMITS.notes) throw new FlowchartError(`Un canvas admite hasta ${LIMITS.notes} notas.`)
	const keep = Boolean(old && movedByHand(old))
	const parentId = keep ? old!.parentId as string : frame?.id as string ?? pages[0].id
	const inFrame = records.get(parentId)?.typeName === 'shape'
	// Inside the diagram's frame its title is already on screen; a loose note carries it in bold.
	const lines = note.texto.split('\n'), heading = inFrame ? undefined : note.titulo
	const h = noteHeight(heading ? [heading, ...lines] : lines)
	let x: number, y: number
	if (keep) ({ x, y } = old!)
	else if (inFrame) {
		x = Math.max(FRAME_PAD, ...shapes.filter((shape) => shape.parentId === parentId && shape.type === 'geo').map((shape) => shape.x + shapeWidth(shape).w)) + NOTE_GAP
		y = FRAME_PAD
	} else {
		let right = -Infinity, top = Infinity
		for (const shape of shapes) if (shape.parentId === parentId && shape.id !== old?.id) { right = Math.max(right, shape.x + shapeWidth(shape).w); top = Math.min(top, shape.y) }
		;({ x, y } = freeSpot(records, parentId, Number.isFinite(right) ? right + 160 : 0, Number.isFinite(top) ? top : 0, NOTE_WIDTH, h))
	}
	const id = old?.id as string ?? `shape:${newId()}`
	const index = old && old.parentId === parentId ? old.index : indicesAfter(records.values(), parentId, 1)[0]
	const writes: TLRecord[] = [shapeBase(id, 'text', parentId, index, x, y, {
		color: 'black', size: 'm', font: 'sans', textAlign: 'start', w: keep ? (old!.props as { w: number }).w : NOTE_WIDTH, richText: noteRichText(lines, heading), scale: 1, autoSize: false,
	}, { ...(old?.meta ?? {}), xpNote: key, xpNoteTitle: note.titulo, xpH: h, xpPos: keep ? (old!.meta as { xpPos?: unknown }).xpPos ?? { x, y } : { x, y } })]
	const container = records.get(parentId)
	if (isShape(container) && container.type === 'frame') {
		const props = container.props as { w: number; h: number }
		const w = Math.max(props.w, Math.round(x + NOTE_WIDTH + FRAME_PAD)), fh = Math.max(props.h, Math.round(y + h + FRAME_PAD))
		if (w !== props.w || fh !== props.h) writes.unshift({ ...container, props: { ...props, w, h: fh } } as TLRecord)
	}
	for (const record of writes) validate(record)
	for (const record of writes) store.set(record.id, record)
	return { noteId: id, created: !old, nextTo: inFrame && isShape(container) ? (container.props as { name: string }).name : null, movedByHand: keep }
}

export function readNotes(all: Iterable<TLRecord>): ReadNote[] {
	const records = new Map<string, TLRecord>()
	for (const record of all) records.set(record.id, record)
	return [...records.values()].filter((record): record is AnyShape => isShape(record) && isNote(record)).map((shape) => {
		const meta = shape.meta as { xpNoteTitle?: string }, parent = records.get(shape.parentId)
		const lines = richLines((shape.props as { richText: unknown }).richText)
		const titulo = typeof meta.xpNoteTitle === 'string' ? meta.xpNoteTitle : lines[0] ?? 'Nota'
		// A loose note starts with its bold title; the student may have edited it, so drop it only if it still matches.
		const body = lines[0] !== undefined && frameKey(lines[0]) === frameKey(titulo) && !(isShape(parent) && parent.type === 'frame') ? lines.slice(1) : lines
		return { titulo, texto: body.join('\n').trim(), juntoA: isShape(parent) && parent.type === 'frame' ? (parent.props as { name: string }).name : null }
	})
}
