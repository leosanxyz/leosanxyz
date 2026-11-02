import { describe, expect, it } from 'vitest'
import { DocumentRecordType, PageRecordType, TLDOCUMENT_ID, type TLPage, type TLRecord } from '@tldraw/tlschema'
import { canvasSchema } from './boardSnapshot'
import { findGaps, layoutFlowchart, parseFlowchart, parseNote, plainText, readFlowcharts, readNotes, richText, writeFlowchart, writeNote, wrapText, type Flowchart } from './flowchart'

const vidas: Flowchart = parseFlowchart({
	titulo: 'Cuando un zombie me pega',
	nodos: [
		{ id: 'inicio', tipo: 'inicio', texto: 'Inicio' },
		{ id: 'restar', tipo: 'proceso', texto: 'Restar una vida' },
		{ id: 'quedan', tipo: 'decision', texto: '¿Me quedan vidas?' },
		{ id: 'seguir', tipo: 'proceso', texto: 'Seguir jugando' },
		{ id: 'perder', tipo: 'proceso', texto: 'Mostrar «Perdiste»' },
		{ id: 'fin', tipo: 'fin', texto: 'Fin' },
	],
	flechas: [
		{ de: 'inicio', a: 'restar' }, { de: 'restar', a: 'quedan' },
		{ de: 'quedan', a: 'seguir', etiqueta: 'sí' }, { de: 'quedan', a: 'perder', etiqueta: 'No' },
		{ de: 'seguir', a: 'restar' }, { de: 'perder', a: 'fin' },
	],
})

function emptyStore() {
	const records = new Map<string, TLRecord>()
	for (const record of [DocumentRecordType.create({ id: TLDOCUMENT_ID }), PageRecordType.create({ id: 'page:page' as TLPage['id'], name: 'Página 1', index: 'a1' as TLPage['index'] })]) records.set(record.id, record)
	return { records, get: (id: string) => records.get(id), set: (id: string, record: TLRecord) => { records.set(id, record) }, delete: (id: string) => { records.delete(id) }, values: () => records.values() }
}
const validate = (record: TLRecord) => { canvasSchema.types[record.typeName].validate(record) }
const shapes = (store: ReturnType<typeof emptyStore>) => [...store.records.values()].filter((record) => record.typeName === 'shape') as Extract<TLRecord, { typeName: 'shape' }>[]

describe('flowchart input', () => {
	it('normalizes SÍ/NO labels and drops duplicated arrows', () => {
		expect(vidas.flechas.map((edge) => edge.etiqueta)).toEqual([undefined, undefined, 'SÍ', 'NO', undefined, undefined])
		const twice = parseFlowchart({ titulo: 't', nodos: [{ id: 'a', tipo: 'inicio', texto: 'a' }], flechas: [{ de: 'a', a: 'a' }, { de: 'a', a: 'a' }] })
		expect(twice.flechas).toHaveLength(1)
	})
	it('explains what is wrong instead of guessing', () => {
		expect(() => parseFlowchart({ titulo: 't', nodos: [] })).toThrow('al menos un nodo')
		expect(() => parseFlowchart({ titulo: 't', nodos: [{ id: 'a', tipo: 'paralelogramo', texto: 'x' }] })).toThrow('tipo')
		expect(() => parseFlowchart({ titulo: 't', nodos: [{ id: 'a', tipo: 'inicio', texto: 'x' }, { id: 'a', tipo: 'fin', texto: 'y' }] })).toThrow('repetido')
		expect(() => parseFlowchart({ titulo: 't', nodos: [{ id: 'a', tipo: 'inicio', texto: 'x' }], flechas: [{ de: 'a', a: 'b' }] })).toThrow('no existe')
		expect(() => parseFlowchart({ titulo: 't', nodos: [{ id: 'a', tipo: 'inicio', texto: 'x'.repeat(201) }] })).toThrow('200')
	})
})

describe('gaps', () => {
	it('finds nothing in a complete diagram with a loop that has an exit', () => {
		expect(findGaps(vidas)).toEqual([])
	})
	it('asks about a decision without NO, a step with nothing after it, and an endless loop', () => {
		const gaps = findGaps(parseFlowchart({
			titulo: 't',
			nodos: [{ id: 'i', tipo: 'inicio', texto: 'Inicio' }, { id: 'd', tipo: 'decision', texto: '¿Hay enemigos?' }, { id: 'p', tipo: 'proceso', texto: 'Atacar' }, { id: 'q', tipo: 'proceso', texto: 'Huir' }, { id: 'x', tipo: 'proceso', texto: 'Suelto' }],
			flechas: [{ de: 'i', a: 'd' }, { de: 'd', a: 'p', etiqueta: 'SÍ' }, { de: 'p', a: 'q' }, { de: 'q', a: 'p' }],
		}))
		expect(gaps.map((gap) => gap.tipo).sort()).toEqual(['ciclo-sin-salida', 'decision-sin-no', 'inalcanzable', 'sin-fin', 'sin-salida'].sort())
		expect(gaps.find((gap) => gap.tipo === 'decision-sin-no')?.mensaje).toContain('¿Hay enemigos?')
	})
})

describe('layout', () => {
	it('keeps SÍ under the decision, opens NO to the right and never overlaps nodes', () => {
		const { placements, back } = layoutFlowchart(vidas)
		const at = (id: string) => placements.get(id)!
		expect(at('seguir').col).toBe(at('quedan').col)
		expect(at('perder').col).toBeGreaterThan(at('quedan').col)
		expect([...back].map((edge) => `${edge.de}>${edge.a}`)).toEqual(['seguir>restar'])
		const boxes = [...placements.values()]
		for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
	})
	it('wraps long text into lines and makes room for it', () => {
		expect(wrapText('El jugador tiene más de cero vidas', 14)).toEqual(['El jugador', 'tiene más de', 'cero vidas'])
		expect(plainText(richText(['uno', 'dos']))).toBe('uno dos')
	})
})

describe('writing and reading the canvas', () => {
	it('draws valid tldraw shapes in a frame and reads the same diagram back', () => {
		const store = emptyStore()
		const result = writeFlowchart(store, vidas, validate)
		expect(result.created).toBe(true)
		const frame = store.records.get(result.frameId) as Extract<TLRecord, { typeName: 'shape' }>
		expect(frame.type).toBe('frame')
		expect(shapes(store).filter((shape) => shape.type === 'geo')).toHaveLength(6)
		expect([...store.records.values()].filter((record) => record.typeName === 'binding')).toHaveLength(12)
		const [diagram] = readFlowcharts(store.records.values())
		expect(diagram.titulo).toBe(vidas.titulo)
		expect(diagram.nodos).toEqual(vidas.nodos)
		expect(diagram.flechas.sort((a, b) => `${a.de}${a.a}`.localeCompare(`${b.de}${b.a}`))).toEqual([...vidas.flechas].sort((a, b) => `${a.de}${a.a}`.localeCompare(`${b.de}${b.a}`)))
		expect(diagram.huecos).toEqual([])
	})
	it('updates by title, keeps nodes moved by hand and leaves the student drawings alone', () => {
		const store = emptyStore()
		const { frameId } = writeFlowchart(store, vidas, validate)
		const moved = shapes(store).find((shape) => (shape.meta as { xpNode?: string }).xpNode === 'perder')!
		store.set(moved.id, { ...moved, x: moved.x + 300, y: moved.y + 40 })
		const scribble = canvasSchema.types.shape.create({ id: 'shape:garabato' as never, type: 'text', parentId: frameId as never, index: 'a0' as never, x: 10, y: 10, rotation: 0, isLocked: false, opacity: 1, meta: {}, props: { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 100, richText: richText(['ojo aquí']), scale: 1, autoSize: true } })
		store.set(scribble.id, scribble)
		const next = parseFlowchart({ ...vidas, nodos: [...vidas.nodos, { id: 'sonido', tipo: 'proceso', texto: 'Sonar un golpe' }], flechas: [...vidas.flechas.filter((edge) => !(edge.de === 'inicio')), { de: 'inicio', a: 'sonido' }, { de: 'sonido', a: 'restar' }] })
		const result = writeFlowchart(store, next, validate)
		expect(result).toMatchObject({ frameId, created: false, kept: 1 })
		const after = shapes(store).find((shape) => (shape.meta as { xpNode?: string }).xpNode === 'perder')!
		expect([after.x, after.y]).toEqual([moved.x + 300, moved.y + 40])
		expect(store.records.has('shape:garabato')).toBe(true)
		expect(shapes(store).filter((shape) => shape.type === 'frame')).toHaveLength(1)
		expect([...store.records.values()].filter((record) => record.typeName === 'binding')).toHaveLength(next.flechas.length * 2)
		const [diagram] = readFlowcharts(store.records.values())
		expect(diagram.nodos).toHaveLength(7)
		expect(diagram.otros).toEqual(['Texto: «ojo aquí».'])
	})
	it('reads hand-drawn shapes outside a frame without breaking', () => {
		const store = emptyStore()
		const base = { parentId: 'page:page' as never, rotation: 0, isLocked: false, opacity: 1, meta: {} }
		const geo = (id: string, kind: string, text: string, y: number) => canvasSchema.types.shape.create({ ...base, id: `shape:${id}` as never, type: 'geo', index: `a${y}` as never, x: 0, y: y * 100, props: { geo: kind, dash: 'draw', url: '', w: 100, h: 60, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black', color: 'black', fill: 'none', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', richText: richText([text]) } })
		for (const record of [geo('a', 'ellipse', 'Empieza', 1), geo('b', 'diamond', '¿Llueve?', 2), geo('c', 'cloud', 'idea', 3)]) store.set(record.id, record)
		const loose = canvasSchema.types.shape.create({ ...base, id: 'shape:flecha' as never, type: 'arrow', index: 'a5' as never, x: 0, y: 0, props: { kind: 'arc', labelColor: 'black', color: 'black', fill: 'none', dash: 'draw', size: 'm', arrowheadStart: 'none', arrowheadEnd: 'arrow', font: 'draw', start: { x: 0, y: 0 }, end: { x: 50, y: 50 }, bend: 0, richText: richText([]), labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5 } })
		store.set(loose.id, loose)
		const [diagram] = readFlowcharts(store.records.values())
		expect(diagram.enMarco).toBe(false)
		expect(diagram.nodos.map((node) => node.tipo)).toEqual(['inicio', 'decision'])
		expect(diagram.otros).toEqual(['Figura: «idea».', 'Flecha suelta sin conectar.'])
		expect(diagram.huecos.map((gap) => gap.tipo)).toContain('sin-fin')
	})
})

describe('svg preview', () => {
	it('draws every node and arrow label, and escapes the student text', async () => {
		const { renderFlowchartSvg } = await import('./flowchartSvg')
		const store = emptyStore()
		const tricky = parseFlowchart({ ...vidas, nodos: vidas.nodos.map((node) => node.id === 'seguir' ? { ...node, texto: 'Seguir <script>alert(1)</script> & jugar' } : node) })
		const { frameId } = writeFlowchart(store, tricky, validate)
		const svg = renderFlowchartSvg(store.records.values(), [frameId])!
		expect(svg.startsWith('<svg')).toBe(true)
		expect(svg).not.toContain('<script>')
		expect(svg).toContain('&#60;script&#62;')
		expect(svg).toContain('Restar una vida')
		expect(svg.match(/<polyline/g)).toHaveLength(tricky.flechas.length)
		expect(svg).toContain('>SÍ<')
		expect(renderFlowchartSvg(emptyStore().records.values())).toBeNull()
	})
})

const boxOf = (shape: Extract<TLRecord, { typeName: 'shape' }>) => ({ x: shape.x, y: shape.y, w: (shape.props as { w: number }).w, h: (shape.props as { h: number }).h })
const frameNamed = (store: ReturnType<typeof emptyStore>, name: string) => shapes(store).find((shape) => shape.type === 'frame' && (shape.props as { name: string }).name === name)!

describe('what the game does today', () => {
	it('draws the code diagram in violet next to the dictated one, without overlapping', () => {
		const store = emptyStore()
		writeFlowchart(store, vidas, validate)
		const today = parseFlowchart({ ...vidas, titulo: `Así funciona hoy: ${vidas.titulo}`, nodos: vidas.nodos.filter((node) => node.id !== 'perder'), flechas: vidas.flechas.filter((edge) => edge.a !== 'perder' && edge.de !== 'perder') })
		const { frameId } = writeFlowchart(store, today, validate)
		const mine = boxOf(frameNamed(store, vidas.titulo)), theirs = boxOf(store.records.get(frameId) as never)
		expect(theirs.y).toBe(mine.y)
		expect(theirs.x).toBeGreaterThanOrEqual(mine.x + mine.w)
		const colors = shapes(store).filter((shape) => shape.parentId === frameId && shape.type !== 'frame').map((shape) => (shape.props as { color: string }).color)
		expect(new Set(colors)).toEqual(new Set(['violet']))
		const read = readFlowcharts(store.records.values())
		expect(read.map((diagram) => diagram.tipo).sort()).toEqual(['asi_funciona_hoy', 'dictado'])
		expect(read.find((diagram) => diagram.tipo === 'asi_funciona_hoy')!.huecos.map((gap) => gap.tipo)).toContain('decision-sin-no')
	})
})

describe('notes', () => {
	const plan = 'Plan en tres pasos\n1. Hacer que el lobo se siente.\n   Para comprobar: le doy un hueso y se sienta.\n2. Detectar el peligro.\n   Para comprobar: aparece un zombie y el lobo voltea.'
	it('sits inside the diagram frame, to its right, grows the frame and updates by title', () => {
		const store = emptyStore()
		const { frameId } = writeFlowchart(store, vidas, validate)
		const before = boxOf(store.records.get(frameId) as never)
		const result = writeNote(store, parseNote({ titulo: 'cuando un ZOMBIE me pega', texto: plan }), validate)
		expect(result).toMatchObject({ created: true, nextTo: vidas.titulo })
		const note = store.records.get(result.noteId) as Extract<TLRecord, { typeName: 'shape' }>
		expect(note.parentId).toBe(frameId)
		const nodesRight = Math.max(...shapes(store).filter((shape) => shape.parentId === frameId && shape.type === 'geo').map((shape) => shape.x + (shape.props as { w: number }).w))
		expect(note.x).toBeGreaterThan(nodesRight)
		expect((store.records.get(frameId) as never as { props: { w: number } }).props.w).toBeGreaterThan(before.w)
		expect(readNotes(store.records.values())).toEqual([{ titulo: 'cuando un ZOMBIE me pega', texto: plan, juntoA: vidas.titulo }])
		expect(readFlowcharts(store.records.values())[0].otros).toEqual([])
		writeNote(store, parseNote({ titulo: vidas.titulo, texto: 'Plan corregido' }), validate)
		expect(readNotes(store.records.values()).map((entry) => entry.texto)).toEqual(['Plan corregido'])
		expect(shapes(store).filter((shape) => shape.type === 'text')).toHaveLength(1)
	})
	it('follows the diagram when it gets wider, unless the student moved it', () => {
		const store = emptyStore()
		const { frameId } = writeFlowchart(store, vidas, validate)
		const { noteId } = writeNote(store, parseNote({ titulo: vidas.titulo, texto: plan }), validate)
		const wider = parseFlowchart({ ...vidas, nodos: [...vidas.nodos, { id: 'x', tipo: 'decision', texto: '¿Tengo poción?' }, { id: 'y', tipo: 'proceso', texto: 'Tomar la poción' }], flechas: [...vidas.flechas.filter((edge) => edge.a !== 'perder'), { de: 'quedan', a: 'x', etiqueta: 'NO' }, { de: 'x', a: 'y', etiqueta: 'SÍ' }, { de: 'x', a: 'perder', etiqueta: 'NO' }, { de: 'y', a: 'restar' }] })
		writeFlowchart(store, wider, validate)
		const note = store.records.get(noteId) as Extract<TLRecord, { typeName: 'shape' }>
		const nodesRight = Math.max(...shapes(store).filter((shape) => shape.parentId === frameId && shape.type === 'geo').map((shape) => shape.x + (shape.props as { w: number }).w))
		expect(note.x).toBeGreaterThan(nodesRight)
		store.set(noteId, { ...note, x: 5, y: 900 })
		writeFlowchart(store, vidas, validate)
		writeNote(store, parseNote({ titulo: vidas.titulo, texto: 'Otra versión' }), validate)
		expect([store.records.get(noteId)!].map((shape) => [(shape as never as { x: number }).x, (shape as never as { y: number }).y])).toEqual([[5, 900]])
	})
	it('goes to a free spot with its title when there is no diagram, and checks its limits', () => {
		const store = emptyStore()
		writeFlowchart(store, vidas, validate)
		const result = writeNote(store, parseNote({ titulo: 'Ideas sueltas', texto: 'Una idea' }), validate)
		expect(result.nextTo).toBeNull()
		const note = store.records.get(result.noteId) as Extract<TLRecord, { typeName: 'shape' }>
		const frame = boxOf(frameNamed(store, vidas.titulo))
		expect(note.parentId).toBe('page:page')
		expect(note.x).toBeGreaterThanOrEqual(frame.x + frame.w)
		expect(plainText((note.props as { richText: unknown }).richText)).toBe('Ideas sueltas Una idea')
		expect(readNotes(store.records.values())).toEqual([{ titulo: 'Ideas sueltas', texto: 'Una idea', juntoA: null }])
		expect(() => parseNote({ titulo: 'x', texto: '   ' })).toThrow('vacía')
		expect(() => parseNote({ titulo: 'x', texto: 'a'.repeat(2001) })).toThrow('2000')
		expect(() => parseNote({ titulo: 'x', texto: Array(61).fill('a').join('\n') })).toThrow('60')
	})
})

describe('frame fit', () => {
	const margins = (store: ReturnType<typeof emptyStore>, frameId: string) => {
		const frame = store.records.get(frameId) as never as { props: { w: number; h: number } }
		const nodes = shapes(store).filter((shape) => shape.parentId === frameId && shape.type === 'geo')
		const left = Math.min(...nodes.map((shape) => shape.x)), right = frame.props.w - Math.max(...nodes.map((shape) => shape.x + (shape.props as { w: number }).w))
		const top = Math.min(...nodes.map((shape) => shape.y)), bottom = frame.props.h - Math.max(...nodes.map((shape) => shape.y + (shape.props as { h: number }).h))
		return { left, right, top, bottom }
	}
	const mundo = parseFlowchart({
		titulo: 'Cuando entro al mundo',
		nodos: [{ id: 'i', tipo: 'inicio', texto: 'Entras al mundo' }, { id: 'd', tipo: 'decision', texto: '¿Es tu primera vez?' }, { id: 'm', tipo: 'proceso', texto: 'Aparece un mensaje con las teclas' }, { id: 'j', tipo: 'proceso', texto: 'Juegas' }],
		flechas: [{ de: 'i', a: 'd' }, { de: 'd', a: 'm', etiqueta: 'SÍ' }, { de: 'm', a: 'j' }],
	})
	it('gives a one-column diagram the same margin on both sides', () => {
		const store = emptyStore()
		const { frameId } = writeFlowchart(store, mundo, validate)
		const m = margins(store, frameId)
		expect(m.left).toBe(m.right)
		expect(m.top).toBe(m.bottom)
	})
	it('grows to the right for a NO branch and shrinks back without a gap on the left', () => {
		const store = emptyStore()
		const { frameId } = writeFlowchart(store, mundo, validate)
		const narrow = (store.records.get(frameId) as never as { props: { w: number } }).props.w
		writeFlowchart(store, parseFlowchart({ ...mundo, nodos: [...mundo.nodos, { id: 'n', tipo: 'proceso', texto: 'Apareces donde te quedaste' }], flechas: [...mundo.flechas, { de: 'd', a: 'n', etiqueta: 'NO' }] }), validate)
		const wide = margins(store, frameId)
		expect(wide.left).toBe(wide.right)
		expect((store.records.get(frameId) as never as { props: { w: number } }).props.w).toBeGreaterThan(narrow)
		writeFlowchart(store, mundo, validate)
		expect((store.records.get(frameId) as never as { props: { w: number } }).props.w).toBe(narrow)
	})
	it('centers a narrow drawing under a long title', () => {
		const store = emptyStore()
		const { frameId } = writeFlowchart(store, parseFlowchart({ ...mundo, titulo: 'Así funciona hoy: Cuando entro al mundo por primera vez en el servidor' }), validate)
		const m = margins(store, frameId)
		expect(Math.abs(m.left - m.right)).toBeLessThanOrEqual(1)
	})
})
