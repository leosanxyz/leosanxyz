import type { CardMaterial } from '../../../../shared/pass'
import type { Uniforms } from './gl'

// Card units used by the shaders: the pass card is 270 wide with the 0.686 aspect ratio.
export const CW = 270, CH = 270 / 0.686
const TAU = Math.PI * 2

export type ShaderMaterial = Exclude<CardMaterial, 'none'>
/** Silhouette edge points in card units (y up) with a point inside the figure: sparks and bolts start here. */
export interface EdgePoint { x: number; y: number; cx: number; cy: number }
export interface Pointer { x: number; y: number; vx: number; vy: number; speed: number; inside: boolean }
export interface HeroState {
	clock: number
	t: number
	hover: number
	tilt: [number, number]
	trail: [number, number]
	lamp: [number, number]
	spring: [number, number]
	speed: number
	[key: string]: any
}
interface MaterialDef {
	name: string
	/** Fixed light color, or the card's own color for gel and ghost. */
	accent?: string
	loop: number
	frames: number
	init?: (pts: EdgePoint[]) => Record<string, unknown>
	step?: (s: HeroState, dt: number, p: Pointer) => void
	uniforms?: (s: HeroState) => Uniforms
	bake?: (i: number, n: number, pts: EdgePoint[]) => Uniforms
	rate?: (s: HeroState, p: Pointer) => number
	/** Opacity of the light the card throws on the table behind it. */
	light: (s: HeroState) => number
}

// Seeded generator: the baked sheet comes out the same every time.
export function rng(seed: number) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

// Nearest point on the card edge to (x, y), with its outward normal.
function edgeOf(x: number, y: number) {
	const d = ([[x, -1, 0], [CW - x, 1, 0], [y, 0, -1], [CH - y, 0, 1]] as const).slice().sort((a, b) => a[0] - b[0])[0]
	return { x: d[1] < 0 ? 0 : d[1] > 0 ? CW : x, y: d[2] < 0 ? 0 : d[2] > 0 ? CH : y, nx: d[1], ny: d[2] }
}

interface Bolt { ax: number; ay: number; bx: number; by: number; seed: number; amp: number; w: number; life: number; dur: number; reseed: number; flick: number }

function spawnBolts(list: Bolt[], pts: EdgePoint[], r: () => number, ptr: { x: number; y: number } | null) {
	if (!pts.length) return
	let A: { x: number; y: number }, B: { x: number; y: number }
	if (ptr) {
		// toward the finger: from one of the five silhouette points nearest to it
		const near = pts.map((q) => [Math.hypot(q.x - ptr.x, q.y - ptr.y), q] as const).sort((a, b) => a[0] - b[0]).slice(0, 5)
		const q = near[Math.floor(r() * near.length)][1]
		if (Math.hypot(q.x - ptr.x, q.y - ptr.y) < 14) return
		A = q; B = ptr
	} else {
		// toward the frame: away from the figure's inside
		const q = pts[Math.floor(r() * pts.length)]
		let dx = q.x - q.cx, dy = q.y - q.cy
		const l = Math.hypot(dx, dy) || 1
		dx /= l; dy /= l
		const ang = (r() - 0.5) * 0.8, c = Math.cos(ang), s = Math.sin(ang)
		;[dx, dy] = [dx * c - dy * s, dx * s + dy * c]
		const inset = 3
		const ts = [dx > 0 ? (CW - inset - q.x) / dx : dx < 0 ? (inset - q.x) / dx : 1e9, dy > 0 ? (CH - inset - q.y) / dy : dy < 0 ? (inset - q.y) / dy : 1e9]
		const t = Math.min(...ts)
		if (t > 150) {
			const e = edgeOf(q.x, q.y)
			B = { x: Math.max(inset, Math.min(CW - inset, e.x - e.nx * inset + (r() - 0.5) * 40)), y: Math.max(inset, Math.min(CH - inset, e.y - e.ny * inset + (r() - 0.5) * 40)) }
		} else B = { x: q.x + dx * t, y: q.y + dy * t }
		A = q
	}
	const len = Math.hypot(B.x - A.x, B.y - A.y)
	const dur = 0.1 + r() * 0.17
	list.push({ ax: A.x, ay: A.y, bx: B.x, by: B.y, seed: r() * 100, amp: Math.max(4, Math.min(20, len * 0.13)), w: 0.45 + r() * 0.3, life: 0, dur, reseed: 0.04, flick: 1 })
	if (!ptr && r() < 0.55) {
		// and from the frame it jumps a little further, into the air
		const e = edgeOf(B.x, B.y), out = 16 + r() * 34, tan = (r() - 0.5) * 34
		list.push({ ax: B.x, ay: B.y, bx: B.x + e.nx * out - e.ny * tan, by: B.y + e.ny * out + e.nx * tan, seed: r() * 100, amp: 3 + r() * 5, w: 0.4, life: 0, dur, reseed: 0.04, flick: 1 })
	}
}

function packBolts(list: Bolt[], B: Float32Array, K: Float32Array) {
	B.fill(0); K.fill(0)
	list.slice(-10).forEach((b, i) => {
		B.set([b.ax, b.ay, b.bx, b.by], i * 4)
		K.set([b.flick * Math.sqrt(Math.max(0, 1 - b.life / b.dur)), b.seed, b.amp, b.w], i * 4)
	})
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; dur: number; size: number }

export const MATERIALS: Record<ShaderMaterial, MaterialDef> = {
	fuego: {
		name: 'Fuego', accent: '#ff7a1a', loop: 2.667, frames: 32,
		init: () => ({ wind: 0, ember: 0 }),
		step(s, dt, p) {
			s.ember += dt * (0.12 + p.speed * 0.55)
			const target = (p.inside ? (0.5 - p.x) * 0.35 : 0) + Math.max(-1.2, Math.min(1.2, p.vx * 0.45))
			s.wind += (target - s.wind) * (1 - Math.exp(-dt * 3))
		},
		uniforms: (s) => ({ uWind: s.wind, uEmber: s.ember }),
		bake: () => ({ uWind: 0, uEmber: 0 }),
		light: (s) => 0.5 + 0.22 * Math.sin(s.clock * 13) * Math.sin(s.clock * 7.3) + 0.1 * Math.sin(s.clock * 29),
	},
	slime: {
		name: 'Slime', loop: 4, frames: 48,
		rate: (s, p) => 1 + Math.hypot(s.tilt[0], s.tilt[1]) * 0.9 + p.speed * 1.2,
		light: (s) => 0.3 + Math.min(0.3, Math.hypot(s.spring[0], s.spring[1]) * 0.5),
	},
	metal: {
		name: 'Metal', accent: '#edc76e', loop: 4, frames: 48,
		light: (s) => 0.16 + 0.22 * s.hover + 0.45 * s.speed,
	},
	fantasma: {
		name: 'Fantasma', loop: 5.333, frames: 64,
		rate: (_s, p) => 1 + p.speed * 0.8,
		light: (s) => 0.42 + 0.08 * Math.sin(s.clock * 1.2),
	},
	'metal-color': {
		name: 'Metal épico', accent: '#edc76e', loop: 4, frames: 48,
		init: () => ({ spk: new Float32Array(48), spkV: new Float32Array(48), sparkList: [] as Spark[], spawnAcc: 0, rnd: rng(7) }),
		step(s, dt, p) {
			const r = s.rnd as () => number
			s.spawnAcc += Math.max(0, p.speed - 0.28) * 40 * dt
			while (s.spawnAcc >= 1) {
				s.spawnAcc--
				// born on the edge nearest the pointer, around where it passes
				const px = (p.inside ? p.x : 0.5) * CW + (r() - 0.5) * 120, py = (p.inside ? p.y : 0.5) * CH + (r() - 0.5) * 120
				const e = edgeOf(Math.max(0, Math.min(CW, px)), Math.max(0, Math.min(CH, py)))
				const out = 22 + r() * 34, tan = (r() - 0.5) * 50
				if (s.sparkList.length >= 12) s.sparkList.shift()
				s.sparkList.push({ x: e.x + e.nx * 2, y: e.y + e.ny * 2, vx: e.nx * out - e.ny * tan + p.vx * 30, vy: e.ny * out + e.nx * tan + p.vy * 30 + 18, life: 1, dur: 0.9 + r() * 0.8, size: r() })
			}
			s.spk.fill(0); s.spkV.fill(0)
			s.sparkList = (s.sparkList as Spark[]).filter((sp) => (sp.life -= dt / sp.dur) > 0)
			;(s.sparkList as Spark[]).forEach((sp, i) => {
				sp.vy -= 55 * dt
				const drag = Math.exp(-dt * 0.7)
				sp.vx *= drag; sp.vy *= drag
				sp.x += sp.vx * dt; sp.y += sp.vy * dt
				s.spk.set([sp.x, sp.y, sp.life, sp.size], i * 4)
				s.spkV.set([sp.vx, sp.vy, 0, 0], i * 4)
			})
		},
		uniforms: (s) => ({ uSpk: s.spk, uSpkV: s.spkV }),
		bake: () => ({ uSpk: new Float32Array(48), uSpkV: new Float32Array(48) }),
		light: (s) => 0.2 + 0.2 * s.hover + 0.35 * s.speed,
	},
	'fantasma-color': {
		name: 'Fantasma con color', accent: '#9cc7f2', loop: 5.333, frames: 64,
		init: () => ({ echo: [0, 0] }),
		step(s, dt, p) {
			// the trail stays behind the motion; the lagging tilt stretches it too
			let tx = -p.vx * 0.055 + (s.trail[0] - s.tilt[0]) * 0.05, ty = -p.vy * 0.055 + (s.trail[1] - s.tilt[1]) * 0.05
			const l = Math.hypot(tx, ty), max = 0.13
			if (l > max) { tx *= max / l; ty *= max / l }
			const k = 1 - Math.exp(-dt * (l > Math.hypot(s.echo[0], s.echo[1]) ? 6 : 2.2))
			s.echo[0] += (tx - s.echo[0]) * k; s.echo[1] += (ty - s.echo[1]) * k
		},
		uniforms: (s) => ({ uEcho: s.echo }),
		bake: (i, n) => { const a = TAU * i / n; return { uEcho: [0.045 * Math.sin(a), -0.035 * Math.cos(a)] } },
		light: (s) => 0.3 + 0.12 * (0.5 - 0.5 * Math.cos(TAU * (s.t % 5.333) / 5.333)) + 0.2 * s.speed,
	},
	rayo: {
		name: 'Rayo', accent: '#86d6ff', loop: 2, frames: 32,
		init: (pts) => ({ pts, bolts: [] as Bolt[], spawnAcc: 0, flash: 0.6, flashT: 0, flashTarget: 0.6, arc: 0, rnd: rng(11), uBolt: new Float32Array(40), uBoltK: new Float32Array(40) }),
		step(s, dt, p) {
			const r = s.rnd as () => number
			s.arc += (p.speed - s.arc) * (1 - Math.exp(-dt * (p.speed > s.arc ? 8 : 2)))
			s.spawnAcc += (2.4 + s.arc * 24 + (p.inside ? 2 : 0)) * dt
			while (s.spawnAcc >= 1) {
				s.spawnAcc--
				const ptr = p.inside && r() < 0.5 ? { x: p.x * CW, y: p.y * CH } : null
				spawnBolts(s.bolts, s.pts, r, ptr)
			}
			s.bolts = (s.bolts as Bolt[]).filter((b) => (b.life += dt) < b.dur)
			// lightning strikes the same place with another shape: the seed changes in jumps
			;(s.bolts as Bolt[]).forEach((b) => { if ((b.reseed -= dt) < 0) { b.seed = r() * 100; b.reseed = 0.035 + r() * 0.03; b.flick = 0.55 + r() * 0.45 } })
			while (s.bolts.length > 10) s.bolts.shift()
			if ((s.flashT -= dt) < 0) { s.flashT = 0.04 + r() * 0.05; s.flashTarget = 0.45 + r() * 0.3 }
			const strike = (s.bolts as Bolt[]).reduce((m, b) => Math.max(m, b.flick * (1 - b.life / b.dur)), 0)
			s.flash += (s.flashTarget + strike * 0.6 - s.flash) * (1 - Math.exp(-dt * 30))
			packBolts(s.bolts, s.uBolt, s.uBoltK)
		},
		uniforms: (s) => ({ uBolt: s.uBolt, uBoltK: s.uBoltK, uFlash: s.flash, uArc: s.arc }),
		bake(i, _n, pts) {
			// in the sheet each pair of frames has its own bolts: they read as short strikes
			const r = rng(1000 + Math.floor(i / 2)), list: Bolt[] = []
			const count = 1 + Math.floor(r() * 2.6)
			for (let k = 0; k < count; k++) spawnBolts(list, pts, r, null)
			const f = rng(5000 + i)
			list.forEach((b) => { b.life = 0; b.flick = 0.6 + f() * 0.4; b.seed += (i % 2) * 13 })
			const B = new Float32Array(40), K = new Float32Array(40)
			packBolts(list, B, K)
			return { uBolt: B, uBoltK: K, uFlash: 0.5 + f() * 0.4, uArc: 0.25 }
		},
		light: (s) => 0.18 + 0.5 * (s.flash - 0.4),
	},
	hielo: {
		name: 'Hielo', accent: '#bfe3ff', loop: 4, frames: 48,
		init: () => ({ frost: 0.25, glint: 0, lastTilt: [0, 0] }),
		step(s, dt, p) {
			s.frost += (1 - s.frost) * (1 - Math.exp(-dt * 0.32))
			const tv = dt > 0 ? Math.hypot(s.tilt[0] - s.lastTilt[0], s.tilt[1] - s.lastTilt[1]) / dt : 0
			s.lastTilt = [...s.tilt]
			const target = Math.min(1, tv * 0.7 + p.speed * 0.5)
			s.glint += (target - s.glint) * (1 - Math.exp(-dt * (target > s.glint ? 12 : 2.5)))
		},
		uniforms: (s) => ({ uFrost: s.frost, uGlint: s.glint }),
		bake: (i, n) => { const a = TAU * i / n; return { uFrost: 0.8 + 0.16 * Math.sin(a), uGlint: 0.3 + 0.4 * Math.sin(2 * a) ** 2 } },
		light: (s) => 0.22 + 0.3 * s.glint,
	},
}

export const materialName = (material: CardMaterial) => material === 'none' ? 'Sin material' : MATERIALS[material].name

export const hexColor = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
