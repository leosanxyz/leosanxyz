import { isRewardSkin, type PassSkin } from '../../../../shared/pass'
import { skins } from '../catalog'
import { subjectSvg } from '../hologramMasks'
import { artName, chooseMaps, fitRect } from './maps'
import { CH, CW, type EdgePoint } from './materials'
import { prototypeSilhouettes } from './silhouettes'

// Painted maps generated apart (ComfyUI) live next to the prototypes; a folder that does not exist yields nothing.
const mapFiles = import.meta.glob('../../../../../../designs/capsula/materiales/mapas/*/{mask,depth}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** Textures sampled 2× the card's 270-unit width. */
export const TW = 540, TH = Math.round(540 / 0.686)

export interface CardAssets {
	art: HTMLCanvasElement
	mask: HTMLCanvasElement
	aux: HTMLCanvasElement
	/** Soft and medium mask edges, kept for the fire mini's layers. */
	edge: Float32Array
	medium: Float32Array
	pts: EdgePoint[]
	/** Identifies the maps used, so cached sheets bake again when a painted map appears. */
	source: string
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
	const image = new Image()
	image.onload = () => resolve(image)
	image.onerror = reject
	image.src = src
})

function canvas(w = TW, h = TH) {
	const c = document.createElement('canvas')
	c.width = w; c.height = h
	return [c, c.getContext('2d', { willReadFrequently: true })!] as const
}

// The cover crop the card's CSS applies to each artwork.
export function placement(skin: PassSkin) {
	if (skin === 'xp') return { position: '50% 42%', fit: 'contain' as const, background: '#101315' }
	const own = skins.find((s) => s.id === skin)?.position
	const css: Partial<Record<PassSkin, string>> = { slime: '48% center', halo: '49% center', deltarune: 'center' }
	return { position: own ?? css[skin] ?? '51% center', fit: 'cover' as const, background: skin === 'deltarune' ? '#030811' : '#000' }
}

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
	// three passes of a separable box ≈ gaussian
	const a = Float32Array.from(src), b = new Float32Array(a.length)
	for (let pass = 0; pass < 3; pass++) {
		for (let y = 0; y < h; y++) {
			let acc = 0
			const row = y * w
			for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))]
			for (let x = 0; x < w; x++) {
				b[row + x] = acc / (2 * r + 1)
				acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]
			}
		}
		for (let x = 0; x < w; x++) {
			let acc = 0
			for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x]
			for (let y = 0; y < h; y++) {
				a[y * w + x] = acc / (2 * r + 1)
				acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]
			}
		}
	}
	return a
}

const luminance = (data: Uint8ClampedArray, alpha = false) => {
	const out = new Float32Array(data.length / 4)
	for (let i = 0; i < out.length; i++) out[i] = alpha ? data[i * 4 + 3] / 255 : (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255
	return out
}

// Three channels from the silhouette: R soft edge, G wide halo, B medium halo (rim light and bevel).
function makeMask(base: Float32Array) {
	const k = TW / 338 // the radii were tuned on the 338 px Rengoku image
	const r = boxBlur(base, TW, TH, Math.max(1, Math.round(k))), m = boxBlur(base, TW, TH, Math.round(4 * k)), wide = boxBlur(base, TW, TH, Math.round(11 * k))
	const [c, g] = canvas(), out = g.createImageData(TW, TH)
	for (let i = 0; i < TW * TH; i++) {
		out.data[i * 4] = r[i] * 255; out.data[i * 4 + 1] = wide[i] * 255; out.data[i * 4 + 2] = m[i] * 255; out.data[i * 4 + 3] = 255
	}
	g.putImageData(out, 0, 0)
	return { canvas: c, r, m }
}

// Relief: R lightly blurred luminance (detail), G heavily blurred (form), B raw.
function makeAux(L: Float32Array) {
	const fine = boxBlur(L, TW, TH, 1), broad = boxBlur(L, TW, TH, Math.round(6 * TW / 540))
	const [c, g] = canvas(), out = g.createImageData(TW, TH)
	for (let i = 0; i < TW * TH; i++) {
		out.data[i * 4] = fine[i] * 255; out.data[i * 4 + 1] = broad[i] * 255; out.data[i * 4 + 2] = L[i] * 255; out.data[i * 4 + 3] = 255
	}
	g.putImageData(out, 0, 0)
	return c
}

// Points along the silhouette, about 7 card units apart, each with a point inside along the mask gradient.
function edgePoints(soft: Float32Array, medium: Float32Array): EdgePoint[] {
	const step = 3, cell = 7, seen = new Set<string>(), out: EdgePoint[] = []
	for (let y = step; y < TH - step; y += 2) for (let x = step; x < TW - step; x += 2) {
		const i = y * TW + x
		if (soft[i] < 0.5 || Math.min(soft[i - step], soft[i + step], soft[i - step * TW], soft[i + step * TW]) >= 0.5) continue
		const cx = x / TW * CW, cy = (1 - y / TH) * CH
		// only the part of the silhouette inside the card and above the name
		if (cx <= 8 || cx >= CW - 8 || cy <= 70 || cy >= CH - 8) continue
		const key = `${Math.floor(cx / cell)},${Math.floor(cy / cell)}`
		if (seen.has(key)) continue
		seen.add(key)
		const gx = medium[i + step] - medium[i - step], gy = -(medium[i + step * TW] - medium[i - step * TW])
		const l = Math.hypot(gx, gy) || 1
		out.push({ x: cx, y: cy, cx: cx + gx / l * 20, cy: cy + gy / l * 20 })
	}
	return out
}

async function build(skin: PassSkin): Promise<CardAssets> {
	const entry = skins.find((s) => s.id === skin)!
	const image = await loadImage(entry.image)
	const place = placement(skin)
	const rect = fitRect(image.naturalWidth, image.naturalHeight, TW, TH, place.position, place.fit)
	const drawn = (source: CanvasImageSource, fill: string) => {
		const [c, g] = canvas()
		g.fillStyle = fill; g.fillRect(0, 0, TW, TH)
		g.drawImage(source, rect.x, rect.y, rect.w, rect.h)
		return [c, g.getImageData(0, 0, TW, TH).data] as const
	}
	const [art, artData] = drawn(image, place.background)

	const svg = subjectSvg(skin) ?? (isRewardSkin(skin) ? prototypeSilhouettes[skin] && `<svg xmlns="http://www.w3.org/2000/svg" width="${image.naturalWidth}" height="${image.naturalHeight}" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill="black"/><g fill="white">${prototypeSilhouettes[skin]}</g></svg>` : undefined)
	const name = artName(entry.image, !import.meta.env.DEV)
	const maps = chooseMaps(name, mapFiles, Boolean(svg) || skin === 'xp')
	let base: Float32Array
	if (maps.mask.kind === 'png') base = luminance(drawn(await loadImage(maps.mask.url), '#000')[1])
	else if (skin === 'xp') {
		// the logo itself is the subject: its alpha, without the dark background
		const [, g] = canvas()
		g.drawImage(image, rect.x, rect.y, rect.w, rect.h)
		base = luminance(g.getImageData(0, 0, TW, TH).data, true)
	} else if (maps.mask.kind === 'vector') base = luminance(drawn(await loadImage(`data:image/svg+xml,${encodeURIComponent(svg!)}`), '#000')[1])
	else {
		// no traced subject: a soft figure in the middle so the effects still have something to wrap
		const [, g] = canvas()
		g.fillStyle = '#fff'; g.beginPath(); g.ellipse(TW * 0.5, TH * 0.56, TW * 0.36, TH * 0.4, 0, 0, Math.PI * 2); g.fill()
		base = luminance(g.getImageData(0, 0, TW, TH).data)
	}
	const mask = makeMask(base)
	const relief = maps.depth.kind === 'png' ? luminance(drawn(await loadImage(maps.depth.url), '#000')[1]) : luminance(artData)
	return {
		art, mask: mask.canvas, aux: makeAux(relief), edge: mask.r, medium: mask.m,
		pts: edgePoints(mask.r, mask.m),
		source: `${maps.mask.kind === 'png' ? maps.mask.url : maps.mask.kind}|${maps.depth.kind === 'png' ? maps.depth.url : 'luminance'}`,
	}
}

const cache = new Map<PassSkin, Promise<CardAssets>>()
export function cardAssets(skin: PassSkin) {
	let assets = cache.get(skin)
	if (!assets) {
		assets = build(skin)
		assets.catch(() => cache.delete(skin))
		cache.set(skin, assets)
	}
	return assets
}
