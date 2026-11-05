import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MotionValue } from 'motion/react'
import type { CardMaterial, PassSkin } from '../../../../shared/pass'
import { cardAssets } from './assets'
import { materialAccent } from './bake'
import { buildProgram, draw, release } from './gl'
import { useHeroSlot } from './heroSlot'
import { CH, CW, hexColor, MATERIALS, type HeroState, type Pointer } from './materials'
import { FRAGMENT } from './shaders'
import './material.css'

// The canvas is larger than the card so what the material lights spills out of the frame.
const PAD = 64

declare global {
	interface Window { __materialHero?: { gpuMs: number | null; cpuMs: number; frames: number; width: number; height: number } }
}

export function MaterialHero({ skin, material, root, rotateX, rotateY, lamp, phase, reduced }: {
	skin: PassSkin
	material: CardMaterial
	/** The card's stationary box: pointer position and speed are read on it. */
	root: RefObject<HTMLElement | null>
	rotateX: MotionValue<number>
	rotateY: MotionValue<number>
	lamp: MotionValue<{ x: number; y: number }>
	phase: MotionValue<number>
	reduced: boolean
}) {
	const host = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), spillRef = useRef<HTMLDivElement>(null)
	const supported = typeof WebGL2RenderingContext !== 'undefined'
	const [failed, setFailed] = useState(false), [ready, setReady] = useState(false), [generation, setGeneration] = useState(0)
	const active = material !== 'none' && supported && !failed
	const owner = useHeroSlot(host, active)
	useEffect(() => {
		const canvas = canvasRef.current, element = host.current?.parentElement, card = root.current
		if (!owner || !active || !canvas || !element || !card) return
		const def = MATERIALS[material], accent = hexColor(materialAccent(material, skin))
		let stopped = false, frame = 0, gl: WebGL2RenderingContext | null = null
		const p: Pointer & { tx: number; ty: number; lastT: number; lastX: number; lastY: number; mouse: boolean } = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, vx: 0, vy: 0, speed: 0, inside: false, lastT: 0, lastX: 0, lastY: 0, mouse: false }
		const uv = (e: PointerEvent) => {
			const r = card.getBoundingClientRect()
			return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height] as const
		}
		const move = (e: PointerEvent) => {
			const [x, y] = uv(e), t = e.timeStamp / 1000
			if (p.inside && t > p.lastT) {
				const dt = Math.max(1 / 240, t - p.lastT)
				p.vx = p.vx * 0.5 + (x - p.lastX) / dt * 0.5; p.vy = p.vy * 0.5 + (y - p.lastY) / dt * 0.5
			}
			p.tx = x; p.ty = y; p.lastX = x; p.lastY = y; p.lastT = t; p.inside = true; p.mouse = e.pointerType === 'mouse'
		}
		const leave = () => { p.inside = false; p.tx = 0.5; p.ty = 0.5 }
		card.addEventListener('pointermove', move)
		card.addEventListener('pointerleave', leave)
		card.addEventListener('pointercancel', leave)
		const lost = (e: Event) => { e.preventDefault(); stopped = true }
		const restored = () => setGeneration((g) => g + 1)
		canvas.addEventListener('webglcontextlost', lost)
		canvas.addEventListener('webglcontextrestored', restored)

		const s: HeroState = { clock: 0, t: phase.get() * def.loop, hover: 0, tilt: [0, 0], trail: [0, 0], lamp: [0.72, 0.78], spring: [0, 0], springV: [0, 0], speed: 0 }
		let size = { w: 0, h: 0, dpr: 1 }
		const resize = () => {
			const dpr = Math.min(2, window.devicePixelRatio || 1), w = element.clientWidth, h = element.clientHeight
			size = { w, h, dpr }
			canvas.width = Math.round((w + PAD * 2) * dpr); canvas.height = Math.round((h + PAD * 2) * dpr)
			if (reduced) render()
		}
		function step(dt: number) {
			const k = 1 - Math.exp(-dt * 8)
			p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k
			const sp = Math.hypot(p.vx, p.vy)
			p.speed += (Math.min(1, sp / 2.5) - p.speed) * (1 - Math.exp(-dt * (sp / 2.5 > p.speed ? 10 : 2.5)))
			const decay = Math.exp(-dt * 6)
			p.vx *= decay; p.vy *= decay
			s.clock += dt; s.speed = p.speed
			const ease = (r: number) => 1 - Math.exp(-dt * r)
			s.hover += ((p.inside ? 1 : 0) - s.hover) * ease(6)
			// the card's own tilt springs: ±6° maps to ±1
			s.tilt = [Math.max(-1, Math.min(1, rotateY.get() / 6)), Math.max(-1, Math.min(1, rotateX.get() / 6))]
			s.trail[0] += (s.tilt[0] - s.trail[0]) * ease(2.2); s.trail[1] += (s.tilt[1] - s.trail[1]) * ease(2.2)
			// the foil's lamp under a mouse; the finger itself on touch; with no pointer it circles so the material stays alive
			const l = lamp.get()
			const [lx, ly] = p.inside ? p.mouse ? [l.x / 100, 1 - l.y / 100] : [p.x, p.y] : [0.5 + 0.32 * Math.cos(s.clock * 0.45), 0.62 + 0.22 * Math.sin(s.clock * 0.6)]
			s.lamp[0] += (lx - s.lamp[0]) * ease(5); s.lamp[1] += (ly - s.lamp[1]) * ease(5)
			// damped spring pushed by the pointer's speed (gel)
			const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n
			for (let i = 0; i < n; i++) for (const a of [0, 1] as const) {
				const drive = (a ? p.vy : p.vx) * 18 * (p.inside ? 1 : 0)
				s.springV[a] += (-140 * s.spring[a] - 7 * s.springV[a] + drive) * h
				s.spring[a] = Math.max(-1, Math.min(1, s.spring[a] + s.springV[a] * h))
			}
			s.t += dt * (def.rate ? def.rate(s, p) : 1)
			def.step?.(s, dt, p)
			if (spillRef.current) spillRef.current.style.opacity = Math.max(0, Math.min(1, def.light(s))).toFixed(3)
		}
		let program: ReturnType<typeof buildProgram> | null = null
		function render() {
			if (!gl || !program || stopped || !size.w) return
			draw(gl, program, {
				uT: s.t % def.loop, uLoop: def.loop, uClock: s.clock, uSpeed: s.speed, uSprite: 0, uHover: s.hover, uDpr: size.dpr, uAspect: CW / CH,
				uTilt: s.tilt, uTrail: s.trail, uLamp: s.lamp, uPtr: p.inside ? [p.x, p.y] : [-5, -5], uVel: [p.vx, p.vy], uSpring: s.spring,
				uCard: [size.w, size.h], uPad: [PAD, PAD], uAccent: accent, ...def.uniforms?.(s),
			})
		}
		// Development only: GPU time per frame from timer queries, read by the QA scripts.
		const timer = import.meta.env.DEV ? { pending: null as WebGLQuery | null, gpu: [] as number[], cpu: [] as number[], ext: null as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null } : null
		let last = 0
		const loop = (now: number) => {
			if (stopped || !gl) return
			const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
			last = now
			if (timer?.pending && gl.getQueryParameter(timer.pending, gl.QUERY_RESULT_AVAILABLE)) {
				if (!gl.getParameter(timer.ext!.GPU_DISJOINT_EXT)) timer.gpu = [...timer.gpu.slice(-59), (gl.getQueryParameter(timer.pending, gl.QUERY_RESULT) as number) / 1e6]
				gl.deleteQuery(timer.pending)
				timer.pending = null
			}
			const t0 = performance.now(), query = timer?.ext && !timer.pending ? gl.createQuery() : null
			if (query) gl.beginQuery(timer!.ext!.TIME_ELAPSED_EXT, query)
			step(dt); render()
			if (query) { gl.endQuery(timer!.ext!.TIME_ELAPSED_EXT); timer!.pending = query }
			if (timer) {
				timer.cpu = [...timer.cpu.slice(-119), performance.now() - t0]
				const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
				window.__materialHero = { gpuMs: timer.gpu.length ? mean(timer.gpu) : null, cpuMs: mean(timer.cpu), frames: (window.__materialHero?.frames ?? 0) + 1, width: canvas!.width, height: canvas!.height }
			}
			frame = requestAnimationFrame(loop)
		}
		const observer = new ResizeObserver(resize)
		void cardAssets(skin).then((assets) => {
			if (stopped) return
			gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })
			if (!gl) { setFailed(true); return }
			try { program = buildProgram(gl, FRAGMENT[material], assets) } catch (cause) { console.error(cause); setFailed(true); return }
			if (timer) timer.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
			// a body that needs edge points (bolts) receives them through its state
			Object.assign(s, def.init?.(assets.pts))
			observer.observe(element)
			resize()
			if (reduced) { step(1.1); render() } else frame = requestAnimationFrame(loop)
			setReady(true)
		}).catch(() => setFailed(true))
		return () => {
			stopped = true
			cancelAnimationFrame(frame)
			observer.disconnect()
			card.removeEventListener('pointermove', move)
			card.removeEventListener('pointerleave', leave)
			card.removeEventListener('pointercancel', leave)
			canvas.removeEventListener('webglcontextlost', lost)
			canvas.removeEventListener('webglcontextrestored', restored)
			if (gl) release(gl)
			setReady(false)
		}
	}, [owner, active, skin, material, root, rotateX, rotateY, lamp, phase, reduced, generation])
	if (!active) return null
	const [r, g, b] = hexColor(materialAccent(material, skin)).map((v) => Math.round(v * 255))
	return <div ref={host} className="material-hero" data-ready={owner && ready} aria-hidden="true" style={{ ['--material-spill' as string]: `rgba(${r},${g},${b},.34)` }}>
		{owner && <>
			<div ref={spillRef} className="material-spill" />
			{/* a fresh canvas per material: a released context cannot come back on the same element */}
			<canvas key={`${skin}:${material}:${generation}`} ref={canvasRef} />
		</>}
	</div>
}
