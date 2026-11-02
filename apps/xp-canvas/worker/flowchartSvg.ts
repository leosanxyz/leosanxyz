import type { TLRecord } from '@tldraw/tlschema'
import { plainText, wrapText } from './flowchart'

// A static SVG of the diagrams in a canvas: the preview inside the chat (MCP Apps) and the library
// thumbnail of canvases the agent drew before anyone opened them. Positions come from the document,
// so hand edits show up too. It approximates tldraw's rendering; the canvas is the source of truth.

type Shape = Extract<TLRecord, { typeName: 'shape' }>
interface Box { x: number; y: number; w: number; h: number }
interface Point { x: number; y: number }

const COLORS: Record<string, string> = {
	black: '#1d1d1d', grey: '#9fa8b2', green: '#099268', 'light-green': '#4cb05e', blue: '#4465e9', 'light-blue': '#4ba1f1',
	orange: '#e16919', red: '#e03131', 'light-red': '#f87777', violet: '#ae3ec9', 'light-violet': '#e085f4', yellow: '#f1ac4b', white: '#ffffff',
}
const color = (name: unknown) => COLORS[String(name)] ?? COLORS.black
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
const FONT = `font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"`

function textLines(shape: Shape, width: number) {
	const rich = (shape.props as { richText?: { content?: { content?: { type: string; text?: string }[] }[] } }).richText
	// Keep the line breaks the server wrote; wrap anything else to the shape's width.
	const lines: string[] = []
	for (const paragraph of rich?.content ?? []) {
		let line = ''
		for (const node of paragraph.content ?? []) {
			if (node.type === 'hardBreak') { lines.push(line); line = '' } else if (node.type === 'text') line += node.text ?? ''
		}
		lines.push(line)
	}
	const chars = Math.max(6, Math.floor(width / 11))
	return lines.flatMap((line) => line.length > chars ? wrapText(line, chars) : [line]).filter((line, _index, all) => line || all.length === 1)
}

function sideOf(anchor: Point): Point {
	if (anchor.x <= 0.01) return { x: -1, y: 0 }
	if (anchor.x >= 0.99) return { x: 1, y: 0 }
	if (anchor.y <= 0.01) return { x: 0, y: -1 }
	return { x: 0, y: 1 }
}

/** Orthogonal route between two anchored sides, close to tldraw's elbow arrows for flowcharts. */
function route(start: Point, startSide: Point, end: Point, endSide: Point): Point[] {
	const gap = 24
	const s = { x: start.x + startSide.x * gap, y: start.y + startSide.y * gap }, e = { x: end.x + endSide.x * gap, y: end.y + endSide.y * gap }
	const middle: Point[] = []
	if (startSide.x !== 0 && endSide.x !== 0 && startSide.x === endSide.x) {
		const x = startSide.x < 0 ? Math.min(s.x, e.x) : Math.max(s.x, e.x)
		middle.push({ x, y: s.y }, { x, y: e.y })
	} else if (startSide.x !== 0 && endSide.y !== 0) middle.push({ x: e.x, y: s.y })
	else if (startSide.y !== 0 && endSide.x !== 0) middle.push({ x: s.x, y: e.y })
	else if (startSide.y !== 0 && endSide.y !== 0) { const y = (s.y + e.y) / 2; middle.push({ x: s.x, y }, { x: e.x, y }) }
	else { const x = (s.x + e.x) / 2; middle.push({ x, y: s.y }, { x, y: e.y }) }
	return [start, s, ...middle, e, end].filter((point, index, all) => !index || point.x !== all[index - 1].x || point.y !== all[index - 1].y)
}

function midpoint(points: Point[]) {
	const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
	let walk = lengths.reduce((a, b) => a + b, 0) / 2
	for (const [index, length] of lengths.entries()) {
		if (walk <= length) { const t = length ? walk / length : 0, a = points[index], b = points[index + 1]; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } }
		walk -= length
	}
	return points[0]
}

/** Renders the given frames (or every frame) and the loose flowchart shapes on the first page. */
export function renderFlowchartSvg(records: Iterable<TLRecord>, frameIds?: string[]): string | null {
	const byId = new Map<string, TLRecord>()
	for (const record of records) byId.set(record.id, record)
	const shapes = [...byId.values()].filter((record): record is Shape => record.typeName === 'shape')
	const frames = shapes.filter((shape) => shape.type === 'frame' && (!frameIds || frameIds.includes(shape.id)))
	if (!frames.length) return null
	const frameSet = new Set(frames.map((frame) => frame.id as string))
	const absolute = (shape: Shape): Box => {
		const parent = byId.get(shape.parentId) as Shape | undefined
		const props = shape.props as { w?: number; h?: number; growY?: number }
		const offset = parent?.typeName === 'shape' ? absolute(parent) : { x: 0, y: 0 }
		return { x: offset.x + shape.x, y: offset.y + shape.y, w: props.w ?? 0, h: (props.h ?? 0) + (props.growY ?? 0) }
	}
	const parts: string[] = []
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
	const grow = (box: Box) => { minX = Math.min(minX, box.x); minY = Math.min(minY, box.y - 40); maxX = Math.max(maxX, box.x + box.w); maxY = Math.max(maxY, box.y + box.h) }
	for (const frame of frames) {
		const box = absolute(frame)
		grow(box)
		parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#ffffff" stroke="#c4c9d1" stroke-width="1.5"/>`)
		parts.push(`<text x="${box.x}" y="${box.y - 12}" font-size="22" fill="#1d1d1d" ${FONT}>${escape((frame.props as { name: string }).name)}</text>`)
	}
	const inside = shapes.filter((shape) => frameSet.has(shape.parentId))
	const boxes = new Map<string, Box>()
	for (const shape of inside) {
		if (shape.type === 'text') {
			// Notes next to a diagram, left aligned like on the canvas.
			const box = absolute(shape)
			textLines(shape, box.w).forEach((line, index) => parts.push(`<text x="${box.x}" y="${box.y + 26 + index * 31}" font-size="22" fill="#1d1d1d" ${FONT}>${escape(line)}</text>`))
			continue
		}
		if (shape.type !== 'geo') continue
		const box = absolute(shape), props = shape.props as { geo: string; color: string }
		boxes.set(shape.id, box)
		const stroke = color(props.color), cx = box.x + box.w / 2, cy = box.y + box.h / 2
		const outline = props.geo === 'ellipse' || props.geo === 'oval' ? `<ellipse cx="${cx}" cy="${cy}" rx="${box.w / 2}" ry="${box.h / 2}"`
			: props.geo === 'diamond' ? `<polygon points="${cx},${box.y} ${box.x + box.w},${cy} ${cx},${box.y + box.h} ${box.x},${cy}"`
			: `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"`
		parts.push(`${outline} fill="${stroke}14" stroke="${stroke}" stroke-width="3"/>`)
		const lines = textLines(shape, props.geo === 'diamond' ? box.w / 2 : box.w - 24)
		lines.forEach((line, index) => parts.push(`<text x="${cx}" y="${cy + (index - (lines.length - 1) / 2) * 28 + 8}" text-anchor="middle" font-size="22" fill="#1d1d1d" ${FONT}>${escape(line)}</text>`))
	}
	const bindings = [...byId.values()].filter((record) => record.typeName === 'binding') as unknown as { fromId: string; toId: string; props: { terminal: string; normalizedAnchor: Point; isPrecise: boolean } }[]
	for (const arrow of inside.filter((shape) => shape.type === 'arrow')) {
		const ends = bindings.filter((binding) => binding.fromId === arrow.id)
		const start = ends.find((binding) => binding.props.terminal === 'start'), end = ends.find((binding) => binding.props.terminal === 'end')
		const a = start && boxes.get(start.toId), b = end && boxes.get(end.toId)
		if (!start || !end || !a || !b) continue
		const anchorFor = (binding: typeof start, box: Box, other: Box) => binding.props.isPrecise ? binding.props.normalizedAnchor
			: Math.abs(other.y - box.y) > Math.abs(other.x - box.x) ? { x: 0.5, y: other.y > box.y ? 1 : 0 } : { x: other.x > box.x ? 1 : 0, y: 0.5 }
		const startAnchor = anchorFor(start, a, b), endAnchor = anchorFor(end, b, a)
		const points = route({ x: a.x + a.w * startAnchor.x, y: a.y + a.h * startAnchor.y }, sideOf(startAnchor), { x: b.x + b.w * endAnchor.x, y: b.y + b.h * endAnchor.y }, sideOf(endAnchor))
		parts.push(`<polyline points="${points.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="#1d1d1d" stroke-width="2.5" marker-end="url(#xp-arrow)"/>`)
		const label = plainText((arrow.props as { richText: unknown }).richText)
		if (label) {
			const at = midpoint(points), labelColor = color((arrow.props as { labelColor: string }).labelColor)
			parts.push(`<rect x="${at.x - label.length * 7 - 8}" y="${at.y - 15}" width="${label.length * 14 + 16}" height="30" fill="#ffffff"/><text x="${at.x}" y="${at.y + 7}" text-anchor="middle" font-size="20" font-weight="600" fill="${labelColor}" ${FONT}>${escape(label)}</text>`)
		}
	}
	const pad = 24, width = Math.round(maxX - minX + pad * 2), height = Math.round(maxY - minY + pad * 2)
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${Math.round(minX - pad)} ${Math.round(minY - pad)} ${width} ${height}" width="${width}" height="${height}" role="img">`
		+ `<defs><marker id="xp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#1d1d1d"/></marker></defs>`
		+ `<rect x="${Math.round(minX - pad)}" y="${Math.round(minY - pad)}" width="${width}" height="${height}" fill="#f8fafc"/>${parts.join('')}</svg>`
}
