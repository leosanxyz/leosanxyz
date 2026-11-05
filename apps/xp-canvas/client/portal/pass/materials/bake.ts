import type { PassSkin } from '../../../../shared/pass'
import { skins } from '../catalog'
import { cardAssets, TH, TW, type CardAssets } from './assets'
import { buildProgram, draw, release } from './gl'
import { CW, CH, hexColor, MATERIALS, type ShaderMaterial } from './materials'
import { FRAGMENT } from './shaders'

/** One mini frame: 2× a 64 px card. */
export const FW = 128, FH = Math.round(128 / 0.686)
const TAU = Math.PI * 2

export interface Sheet { url: string; frames: number; loop: number; bytes: number; ms: number; cached: boolean }

export const materialAccent = (material: ShaderMaterial, skin: PassSkin) =>
	MATERIALS[material].accent ?? skins.find((s) => s.id === skin)?.color ?? '#ffffff'

// The fire sheet holds only the flames; the mini's other layers (dark art, masked figure, rim) are baked into
// each frame so the list stays one image per card.
function fireLayers(sheet: HTMLCanvasElement, assets: CardAssets, n: number) {
	const layer = (fill: (data: ImageData) => void, source?: CanvasImageSource) => {
		const c = document.createElement('canvas')
		c.width = TW; c.height = TH
		const g = c.getContext('2d')!
		if (source) g.drawImage(source, 0, 0)
		const data = g.getImageData(0, 0, TW, TH)
		fill(data)
		g.putImageData(data, 0, 0)
		return c
	}
	// brightness(.5) saturate(.65) by hand: Safari's canvas has no filter
	const dark = layer((d) => {
		for (let i = 0; i < d.data.length; i += 4) {
			const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2], l = r * 0.2126 + g * 0.7152 + b * 0.0722
			d.data[i] = (l + (r - l) * 0.65) * 0.5; d.data[i + 1] = (l + (g - l) * 0.65) * 0.5; d.data[i + 2] = (l + (b - l) * 0.65) * 0.5
		}
	}, assets.art)
	const figure = layer((d) => { for (let i = 0; i < TW * TH; i++) d.data[i * 4 + 3] = assets.edge[i] * 255 }, assets.art)
	const rim = layer((d) => {
		for (let i = 0; i < TW * TH; i++) {
			d.data[i * 4] = 255; d.data[i * 4 + 1] = 122; d.data[i * 4 + 2] = 26
			d.data[i * 4 + 3] = 255 * Math.min(1, Math.max(0, (0.95 - assets.medium[i]) / 0.5)) * assets.edge[i] * 0.55
		}
	})
	const out = document.createElement('canvas')
	out.width = FW * n; out.height = FH
	const g = out.getContext('2d')!
	for (let i = 0; i < n; i++) {
		const x = i * FW
		g.drawImage(dark, x, 0, FW, FH)
		g.globalCompositeOperation = 'screen'; g.drawImage(sheet, x, 0, FW, FH, x, 0, FW, FH)
		g.globalCompositeOperation = 'source-over'; g.drawImage(figure, x, 0, FW, FH)
		g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.55 + 0.35 * Math.abs(Math.sin(i * 2.3)); g.drawImage(rim, x, 0, FW, FH)
		g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
	}
	return out
}

// The same shader rendered once into N frames with the lamp going round; afterwards it is CSS only.
async function render(skin: PassSkin, material: ShaderMaterial, assets: CardAssets) {
	const def = MATERIALS[material], n = def.frames
	const off = document.createElement('canvas')
	off.width = FW; off.height = FH
	const gl = off.getContext('webgl2', { preserveDrawingBuffer: true })
	if (!gl) throw new Error('Sin WebGL2 para hornear la hoja')
	try {
		const program = buildProgram(gl, FRAGMENT[material], assets)
		const sheet = document.createElement('canvas')
		sheet.width = FW * n; sheet.height = FH
		const sg = sheet.getContext('2d')!
		const accent = hexColor(materialAccent(material, skin))
		for (let i = 0; i < n; i++) {
			const ph = i / n, a = TAU * ph
			draw(gl, program, {
				uT: ph * def.loop, uLoop: def.loop, uClock: ph * def.loop, uSpeed: 0, uSprite: 1, uHover: 0, uDpr: 1, uAspect: CW / CH,
				uTilt: [0.3 * Math.cos(a), 0.22 * Math.sin(a)], uTrail: [0.3 * Math.cos(a - 0.7), 0.22 * Math.sin(a - 0.7)],
				uLamp: [0.5 + 0.3 * Math.cos(a), 0.6 + 0.22 * Math.sin(a)], uPtr: [-5, -5], uVel: [0, 0],
				uSpring: [0.12 * Math.sin(2 * a), 0.06 * Math.cos(2 * a)], uCard: [FW, FH], uPad: [0, 0], uAccent: accent,
				...def.bake?.(i, n, assets.pts),
			})
			sg.drawImage(off, i * FW, 0)
		}
		return material === 'fuego' ? fireLayers(sheet, assets, n) : sheet
	} finally { release(gl) }
}

function hash(text: string) {
	let h = 0x811c9dc5
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
	return (h >>> 0).toString(36)
}

const CACHE = 'xp-material-sheets-v1'
async function stored(key: string) {
	try { return await (await caches.open(CACHE)).match(key) } catch { return undefined }
}
async function store(key: string, blob: Blob) {
	try { await (await caches.open(CACHE)).put(key, new Response(blob, { headers: { 'content-type': blob.type } })) } catch { /* private mode or no Cache API: memory only */ }
}

let queue: Promise<unknown> = Promise.resolve()
const sheets = new Map<string, Promise<Sheet>>()

/** Bakes (once per skin and material, one bake at a time) or reads the cached sprite sheet. */
export function materialSheet(skin: PassSkin, material: ShaderMaterial): Promise<Sheet> {
	const id = `${skin}:${material}`
	let sheet = sheets.get(id)
	if (sheet) return sheet
	sheet = (async () => {
		const assets = await cardAssets(skin)
		const key = new URL(`/__material-sheets/${hash(`${FRAGMENT[material]}|${assets.source}|${FW}x${FH}`)}/${skin}/${material}.webp`, location.origin).href
		const hit = await stored(key)
		const def = MATERIALS[material]
		if (hit) {
			const blob = await hit.blob()
			return { url: URL.createObjectURL(blob), frames: def.frames, loop: def.loop, bytes: blob.size, ms: 0, cached: true }
		}
		const job = queue.then(async () => {
			const t0 = performance.now()
			const canvas = await render(skin, material, assets)
			const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob')), 'image/webp', 0.85))
			return { blob, ms: performance.now() - t0 }
		})
		queue = job.catch(() => undefined)
		const { blob, ms } = await job
		void store(key, blob)
		return { url: URL.createObjectURL(blob), frames: def.frames, loop: def.loop, bytes: blob.size, ms, cached: false }
	})()
	// Development only: sizes and bake times, read by the QA scripts.
	if (import.meta.env.DEV) void sheet.then(({ bytes, ms, cached, frames }) => { ((window as unknown as { __materialSheets?: Record<string, unknown> }).__materialSheets ??= {})[id] = { bytes, ms: Math.round(ms), cached, frames, width: FW * frames, height: FH } })
	sheet.catch(() => sheets.delete(id))
	sheets.set(id, sheet)
	return sheet
}
