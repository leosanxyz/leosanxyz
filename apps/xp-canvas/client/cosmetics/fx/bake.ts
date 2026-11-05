import { buildFxProgram, draw, release } from '../../portal/pass/materials/gl'
import { fxSize, type FxSpec } from './specs'

export interface FxSheet { url: string; frames: number; loop: number; width: number; height: number }

const TAU = Math.PI * 2

/** Uniforms shared by the sheet and the live hero. */
export function fxUniforms(spec: FxSpec, res: readonly [number, number], t: number, extra: Record<string, number | readonly number[]> = {}) {
	return {
		uT: t % spec.loop, uLoop: spec.loop, uClock: t, uSpeed: 0, uHover: 0, uSprite: 0, uRadius: spec.radius, uDpr: 1,
		uBox: spec.box, uPad: spec.pad, uRes: res, uPtr: [-5, -5], uLamp: [0.5, 0.7], uTilt: [0, 0], ...extra,
	}
}

function hash(text: string) {
	let h = 0x811c9dc5
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
	return (h >>> 0).toString(36)
}

const CACHE = 'xp-cosmetic-sheets-v1'
async function stored(key: string) {
	try { return await (await caches.open(CACHE)).match(key) } catch { return undefined }
}
async function store(key: string, blob: Blob) {
	try { await (await caches.open(CACHE)).put(key, new Response(blob, { headers: { 'content-type': blob.type } })) } catch { /* private mode or no Cache API: memory only */ }
}

// One bake at a time, like the material sheets: a list asking for four plates does not stall the page four times at once.
let queue: Promise<unknown> = Promise.resolve()
const sheets = new Map<string, Promise<FxSheet>>()

/** The shader rendered once into N frames side by side, then played with CSS `steps()`. No live WebGL in lists. */
export function fxSheet(id: string, spec: FxSpec): Promise<FxSheet> {
	let sheet = sheets.get(id)
	if (sheet) return sheet
	const [w, h] = fxSize(spec), n = spec.frames
	sheet = (async () => {
		const key = new URL(`/__cosmetic-sheets/${hash(`${spec.fs}|${w}x${h}x${n}|${spec.loop}`)}/${id}.webp`, location.origin).href
		const hit = await stored(key)
		const done = (blob: Blob) => ({ url: URL.createObjectURL(blob), frames: n, loop: spec.loop, width: w, height: h })
		if (hit) return done(await hit.blob())
		const job = queue.then(async () => {
			const off = document.createElement('canvas')
			off.width = w; off.height = h
			const gl = off.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true })
			if (!gl) throw new Error('Sin WebGL2 para hornear la hoja')
			try {
				const program = buildFxProgram(gl, spec.fs)
				const out = document.createElement('canvas')
				out.width = w * n; out.height = h
				const g = out.getContext('2d')!
				for (let i = 0; i < n; i++) {
					const a = TAU * i / n
					// the lamp goes once round the box over the loop, as in the material sheets
					draw(gl, program, fxUniforms(spec, [w, h], i / n * spec.loop, { uSprite: 1, uLamp: [0.5 + 0.35 * Math.cos(a), 0.6 + 0.3 * Math.sin(a)] }))
					g.drawImage(off, i * w, 0)
				}
				return await new Promise<Blob>((resolve, reject) => out.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob')), 'image/webp', 0.86))
			} finally { release(gl) }
		})
		queue = job.catch(() => undefined)
		const blob = await job
		void store(key, blob)
		return done(blob)
	})()
	sheet.catch(() => sheets.delete(id))
	sheets.set(id, sheet)
	return sheet
}
