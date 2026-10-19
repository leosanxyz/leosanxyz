import {
	AmbientLight, BackSide, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Material, Mesh,
	MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NoToneMapping, Object3D, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry,
	SRGBColorSpace, Texture, TorusGeometry, Vector3, WebGLRenderer,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { parejasPose, RETIRE, SECONDS } from './parejasPose'

// Misma paleta que el gachapon y el buzón.
const COLORS = { body: '#ff8a6e', trim: '#e9694f', wood: '#d3a676', woodDark: '#8a5a3b', gold: '#ffc54a', ink: '#8a3a2c', hole: '#6b3b35' }
const BALL = 0.17
const DRUM = { y: 0.5, radius: 0.8, half: 0.78 }
const APOTHEM = DRUM.radius * Math.cos(Math.PI / 8)
/** La compuerta está abajo, hacia el frente: la rampa pasa bajo el tambor y no tapa las bolas. Tras tres vueltas queda donde empezó. */
const GATE_ANGLE = -3 * Math.PI / 8
const TRAY = { y: -1.34, z: 1.85 }
const CUPS = [[0], [-0.5, 0.5], [-0.5, 0.5, 0]]
/** Las bolas sorteadas crecen al bajar, para que se lean desde lejos. */
const GROW = 0.4
/** Altura del centro de la bola sobre la bandeja, en radios: asoma lo bastante para leer la inicial. */
const SEAT = 0.75
/** La tapa se abate hacia atrás sobre su bisagra, unos 112 grados. */
const LID_ANGLE = 1.95

export type Ball = { id: string; initial: string; color: string; order: number }
export type ParejasBalls = { drum: Ball[]; pair: Ball[]; previous: Ball[] }
export type Point = { x: number; y: number }
export type ParejasScene = {
	render(time: number, elapsed: number, reducedMotion: boolean): { tray: Point; busy: boolean }
	setBalls(balls: ParejasBalls): void
	resize(width: number, height: number, pixelRatio: number): void
	dispose(): void
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const easeIn = (p: number) => clamp(p) * clamp(p)

/** Lugares de la pila dentro del tambor, de abajo hacia arriba y del centro hacia fuera. */
const PILE = (() => {
	const slots: [number, number, number][] = [], inner = APOTHEM - BALL - 0.03
	for (let layer = 0; slots.length < 40; layer++) {
		const y = -inner + 0.08 + layer * 0.29, half = Math.sqrt(Math.max(0, inner * inner - y * y)) - 0.02
		const across = Math.max(1, Math.floor(half * 2 / 0.36) + 1)
		const zs = Array.from({ length: across }, (_, a) => (a - (across - 1) / 2) * 0.36).sort((a, b) => Math.abs(a) - Math.abs(b))
		for (const z of zs) for (const x of [-0.18, 0.18, -0.52, 0.52]) slots.push([x + (layer % 2 ? 0.04 : -0.02), y, z])
	}
	return slots
})()

export function createParejasScene(canvas: HTMLCanvasElement, width: number, height: number, pixelRatio: number): ParejasScene {
	const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
	renderer.toneMapping = NoToneMapping
	renderer.setClearColor(0x000000, 0)
	renderer.setPixelRatio(pixelRatio)
	renderer.setSize(width, height, false)

	// Luces y cámara del buzón.
	const scene = new Scene()
	const camera = new PerspectiveCamera(26, width / height, 0.1, 50)
	camera.position.set(0, 2.4, 10.2)
	camera.lookAt(0, -0.35, 0)
	scene.add(new HemisphereLight('#ffffff', '#ffd9c9', 1.5), new AmbientLight('#ffffff', 0.25))
	const key = new DirectionalLight('#ffffff', 2.8)
	key.position.set(-4, 6, 5)
	const fill = new DirectionalLight('#ffe8dc', 0.7)
	fill.position.set(4, 1, 3)
	const rim = new DirectionalLight('#fff0e6', 1.3)
	rim.position.set(5, 3, -4)
	scene.add(key, fill, rim)

	const matte = (color: string) => new MeshStandardMaterial({ color, roughness: 0.48, metalness: 0 })
	const goldMaterial = new MeshStandardMaterial({ color: COLORS.gold, roughness: 0.3, metalness: 0.45 })
	const add = <T extends Object3D>(parent: Object3D, child: T, x = 0, y = 0, z = 0) => { child.position.set(x, y, z); parent.add(child); return child }
	const mesh = (geometry: BufferGeometry, material: Material) => new Mesh(geometry, material)
	const box = (w: number, h: number, d: number, radius: number) => new RoundedBoxGeometry(w, h, d, 3, radius)
	/** Cilindro acostado sobre el eje x. */
	const rod = (radius: number, length: number, material: Material, segments = 16) => { const m = mesh(new CylinderGeometry(radius, radius, length, segments), material); m.rotation.z = Math.PI / 2; return m }

	const tombola = add(scene, new Group(), 0.36, 0.06, -0.7)
	tombola.rotation.y = -0.22
	tombola.scale.setScalar(0.94)

	// Base de madera, soportes en A y eje dorado.
	const wood = matte(COLORS.wood)
	add(tombola, mesh(box(2.7, 0.14, 2.9, 0.06), wood), 0.1, -1.57, 0.65)
	for (const x of [-1, 1]) for (const side of [-1, 1]) {
		const post = add(tombola, mesh(box(0.13, 2.08, 0.13, 0.05), wood), x * (DRUM.half + 0.2), -0.5, side * 0.23)
		post.rotation.x = -side * 0.22
	}
	for (const x of [-1, 1]) add(tombola, rod(0.1, 0.16, goldMaterial, 24), x * (DRUM.half + 0.2), DRUM.y, 0)
	add(tombola, rod(0.045, 2.35, goldMaterial), 0.1, DRUM.y, 0)

	// Tambor de jaula octogonal: tapas de color, barras doradas y la compuerta por donde salen las bolas.
	const drum = add(tombola, new Group(), 0, DRUM.y, 0)
	const capMaterial = matte(COLORS.body), trimMaterial = matte(COLORS.trim)
	for (const x of [-1, 1]) {
		add(drum, rod(DRUM.radius, 0.06, capMaterial, 8), x * DRUM.half, 0, 0)
		add(drum, mesh(new TorusGeometry(DRUM.radius, 0.045, 8, 8), trimMaterial), x * (DRUM.half + 0.03), 0, 0).rotation.y = Math.PI / 2
		add(drum, rod(0.2, 0.08, goldMaterial, 24), x * (DRUM.half + 0.05), 0, 0)
	}
	add(drum, mesh(new TorusGeometry(DRUM.radius, 0.03, 8, 8), trimMaterial), 0, 0, 0).rotation.y = Math.PI / 2
	for (let k = 0; k < 8; k++) add(drum, rod(0.022, DRUM.half * 2, goldMaterial, 8), 0, DRUM.radius * Math.sin(k * Math.PI / 4), DRUM.radius * Math.cos(k * Math.PI / 4))
	const door = add(drum, new Group(), 0, APOTHEM * Math.sin(GATE_ANGLE), APOTHEM * Math.cos(GATE_ANGLE))
	door.rotation.x = -GATE_ANGLE
	add(door, mesh(box(0.5, 0.36, 0.04, 0.03), trimMaterial))
	add(door, mesh(box(0.38, 0.24, 0.05, 0.03), matte(COLORS.hole)))

	// Manivela a la derecha.
	const crank = add(tombola, new Group(), DRUM.half + 0.4, DRUM.y, 0)
	add(crank, rod(0.09, 0.08, goldMaterial, 24))
	add(crank, mesh(box(0.07, 0.5, 0.09, 0.03), goldMaterial), 0.03, 0.22, 0)
	add(crank, rod(0.055, 0.28, wood), 0.17, 0.46, 0)
	add(crank, mesh(new SphereGeometry(0.07, 20, 12), matte(COLORS.woodDark)), 0.32, 0.46, 0)

	// Rampa desde la compuerta hasta la bandeja.
	const outward = new Vector3(0, Math.sin(GATE_ANGLE), Math.cos(GATE_ANGLE))
	const gate = new Vector3(0, DRUM.y, 0).addScaledVector(outward, APOTHEM + BALL + 0.05)
	const rampEnd = new Vector3(0, TRAY.y + BALL + 0.03, TRAY.z - 0.3)
	const along = rampEnd.clone().sub(gate), rampLength = along.length() + 0.3
	const ramp = add(tombola, new Group(), ...gate.clone().add(rampEnd).multiplyScalar(0.5).toArray())
	ramp.rotation.x = Math.atan2(-along.y, along.z) - Math.PI / 2
	add(ramp, mesh(box(0.46, rampLength, 0.05, 0.02), capMaterial), 0, 0, -BALL - 0.03)
	for (const x of [-1, 1]) add(ramp, mesh(box(0.05, rampLength, 0.16, 0.02), trimMaterial), x * (BALL + 0.05), 0, -BALL + 0.02)

	// Bandeja con tres huecos.
	add(tombola, mesh(box(1.6, 0.16, 0.6, 0.06), capMaterial), 0, TRAY.y - 0.08, TRAY.z)
	add(tombola, mesh(box(1.66, 0.05, 0.66, 0.02), trimMaterial), 0, TRAY.y - 0.14, TRAY.z)
	for (const x of CUPS[2]) add(tombola, mesh(new CircleGeometry(BALL * (1 + GROW) * 0.9, 32), matte(COLORS.hole)), x, TRAY.y + 0.003, TRAY.z).rotation.x = -Math.PI / 2

	add(tombola, groundShadow(), 0.1, -1.645, 0.65)

	// Bolas: dos medias esferas huecas que juntas no dejan costura. La tapa gira sobre una bisagra en su borde trasero;
	// el tazón, con la inicial por fuera, se queda en su hueco.
	const halves = [half(0), half(1)]
	// El canto de cada mitad queda justo por dentro de la esfera: cerrada no deja costura y abierta se ve el grosor.
	const rimGeometry = new TorusGeometry(BALL - 0.013, 0.012, 8, 40)
	type BallMesh = { group: Group; hinge: Group; materials: Material[]; rest: Vector3 | null; spin: number[] }
	const balls = new Map<string, BallMesh>()
	const ballsGroup = add(tombola, new Group())
	const ballKey = (ball: Ball) => `${ball.id}|${ball.initial}|${ball.color}`
	const makeBall = (ball: Ball, index: number): BallMesh => {
		const outside = new MeshPhysicalMaterial({ map: ballTexture(ball.color, ball.initial), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 })
		// Por dentro, el mismo color más oscuro y mate, para que se note el hueco.
		const inside = new MeshStandardMaterial({ color: new Color(ball.color).lerp(new Color(COLORS.ink), 0.55), roughness: 0.65, side: BackSide })
		const rim = matte(`#${new Color(ball.color).lerp(new Color('#ffffff'), 0.35).getHexString()}`)
		const group = add(ballsGroup, new Group()), hinge = add(group, new Group(), 0, 0, -BALL)
		for (const material of [outside, inside]) {
			add(hinge, mesh(halves[0], material), 0, 0, BALL)
			add(group, mesh(halves[1], material))
		}
		add(hinge, mesh(rimGeometry, rim), 0, 0, BALL).rotation.x = Math.PI / 2
		add(group, mesh(rimGeometry, rim)).rotation.x = Math.PI / 2
		// Ladeadas un poco al azar, pero con la inicial hacia el frente.
		return { group, hinge, materials: [outside, inside, rim], rest: null, spin: [index * 0.37 % 0.8 - 0.4, index * 1.3 % 1.2 - 0.6, index * 0.53 % 0.6 - 0.3] }
	}
	let current: ParejasBalls = { drum: [], pair: [], previous: [] }
	const openLid = (b: BallMesh, open: number) => {
		b.hinge.position.y = open * 0.025
		b.hinge.rotation.x = -open * LID_ANGLE
	}

	let last = 0
	const point = new Vector3(), target = new Vector3()
	const project = (x: number, y: number, z: number): Point => {
		point.set(x, y, z)
		tombola.localToWorld(point)
		point.project(camera)
		return { x: (point.x + 1) / 2 * width, y: (1 - point.y) / 2 * height }
	}

	return {
		render(time, elapsed, reducedMotion) {
			const dt = Math.min(0.05, Math.max(0, time - last))
			last = time
			const { pair, previous } = current
			const pose = parejasPose(elapsed, pair.length, reducedMotion)
			const rock = reducedMotion ? 0 : Math.sin(time * 0.8) * 0.035
			drum.rotation.x = rock - pose.crank
			crank.rotation.x = -pose.crank
			for (const ball of balls.values()) ball.group.visible = false

			// Bolas dentro del tambor, con la gravedad: no giran con él, saltan y se revuelven.
			const inDrum = [...current.drum, ...pair.filter((_, i) => pose.balls[i]?.path === null)].sort((a, b) => a.order - b.order)
			const smoothing = reducedMotion ? 1 : 1 - Math.exp(-dt * 9)
			let settling = false
			inDrum.slice(0, 27).forEach((ball, i) => {
				const b = balls.get(ballKey(ball))
				if (!b) return
				const [x, y, z] = PILE[i]
				target.set(x, DRUM.y + y, z)
				if (!b.rest) b.rest = target.clone()
				b.rest.lerp(target, smoothing)
				if (b.rest.distanceToSquared(target) > 1e-5) settling = true
				const swirl = pose.shake * Math.sin(time * (5 + i % 3) + i) * 0.9
				const hop = pose.shake * Math.abs(Math.sin(time * (7 + i % 4) + i * 1.7)) * 0.32
				const dy = b.rest.y - DRUM.y
				b.group.position.set(b.rest.x, DRUM.y + dy * Math.cos(swirl) - b.rest.z * Math.sin(swirl) + hop, dy * Math.sin(swirl) + b.rest.z * Math.cos(swirl))
				b.group.rotation.set(b.spin[0] + pose.crank * (i % 2 ? 1 : -1), b.spin[1], b.spin[2] + rock * 3)
				b.group.scale.setScalar(1)
				openLid(b, 0)
				b.group.visible = true
			})

			// La pareja sorteada: compuerta, rampa, hueco, rebote y se abre.
			const cups = CUPS[Math.min(3, pair.length) - 1] ?? []
			pair.forEach((ball, i) => {
				const b = balls.get(ballKey(ball)), p = pose.balls[i]
				if (!b || !p || p.path === null) return
				const cup = cups[i] ?? 0, t = p.path
				if (t < 0.2) target.copy(b.rest ?? gate).lerp(gate, easeIn(t / 0.2))
				else if (t < 0.7) target.copy(gate).lerp(rampEnd, easeIn((t - 0.2) / 0.5))
				else {
					const u = (t - 0.7) / 0.3
					target.set(cup * u, rampEnd.y + (TRAY.y + BALL * (1 + GROW) * SEAT - rampEnd.y) * u + Math.sin(Math.PI * u) * 0.2, rampEnd.z + (TRAY.z - rampEnd.z) * u)
				}
				const grow = 1 + GROW * t
				b.group.position.copy(target)
				b.group.rotation.set((1 - t) * Math.PI * 6, 0, -cup * (1 - t) * 4)
				b.group.scale.set(grow * (1 + p.squash * 0.12), grow * (1 - p.squash * 0.16), grow * (1 + p.squash * 0.12))
				// La tapa se abate hacia atrás; del tazón sale el nombre.
				openLid(b, p.open)
				b.group.visible = true
			})

			// Las bolas del sorteo anterior se hunden en la bandeja.
			if (pose.retire < 1) previous.forEach((ball, i) => {
				const b = balls.get(ballKey(ball))
				if (!b || pair.some((other) => other.id === ball.id)) return
				const s = (1 - pose.retire) * (1 + GROW)
				b.group.position.set(CUPS[Math.min(3, previous.length) - 1][i] ?? 0, TRAY.y + BALL * (1 + GROW) * SEAT - pose.retire * 0.12, TRAY.z)
				b.group.rotation.set(0, 0, 0)
				b.group.scale.setScalar(s)
				openLid(b, 1)
				b.group.visible = true
			})

			renderer.render(scene, camera)
			return { tray: project(0, TRAY.y, TRAY.z), busy: settling || elapsed < SECONDS + RETIRE }
		},
		setBalls(next) {
			current = next
			const all = [...next.drum, ...next.pair, ...next.previous]
			const keep = new Set(all.map(ballKey))
			for (const [key, ball] of balls) if (!keep.has(key)) {
				for (const material of ball.materials) {
					if ('map' in material && material.map instanceof Texture) material.map.dispose()
					material.dispose()
				}
				ballsGroup.remove(ball.group)
				balls.delete(key)
			}
			all.forEach((ball) => { if (!balls.has(ballKey(ball))) balls.set(ballKey(ball), makeBall(ball, ball.order)) })
		},
		resize(nextWidth, nextHeight, nextPixelRatio) {
			width = nextWidth
			height = nextHeight
			renderer.setPixelRatio(nextPixelRatio)
			renderer.setSize(width, height, false)
			camera.aspect = width / height
			camera.updateProjectionMatrix()
		},
		dispose() {
			const geometries = new Set<BufferGeometry>(), materials = new Set<Material>()
			scene.traverse((object) => {
				if (!(object instanceof Mesh)) return
				geometries.add(object.geometry)
				for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
			})
			for (const geometry of geometries) geometry.dispose()
			for (const material of materials) {
				if ('map' in material && material.map instanceof Texture) material.map.dispose()
				material.dispose()
			}
			renderer.dispose()
		},
	}
}

/** Media esfera con las coordenadas de textura de su mitad, para que la inicial no se estire. */
function half(index: 0 | 1) {
	const geometry = new SphereGeometry(BALL, 32, 12, 0, Math.PI * 2, index * Math.PI / 2, Math.PI / 2)
	const uv = geometry.attributes.uv
	for (let i = 0; i < uv.count; i++) uv.setY(i, (1 - index) * 0.5 + uv.getY(i) * 0.5)
	return geometry
}

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	draw(canvas.getContext('2d')!)
	const texture = new CanvasTexture(canvas)
	texture.colorSpace = SRGBColorSpace
	return texture
}

/**
 * Bola de tómbola: color de cápsula con un óvalo blanco y la inicial, al frente y atrás. Van bajo el ecuador,
 * en el tazón, para seguir a la vista cuando la tapa se abre. Se ensanchan porque ahí la esfera se estrecha.
 */
function ballTexture(color: string, initial: string) {
	return canvasTexture(512, 256, (context) => {
		context.fillStyle = color
		context.fillRect(0, 0, 512, 256)
		context.font = '900 72px system-ui, sans-serif'
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		for (const x of [128, 384]) {
			context.fillStyle = '#fffdf7'
			context.beginPath()
			context.ellipse(x, 172, 84, 40, 0, 0, Math.PI * 2)
			context.fill()
			context.save()
			context.translate(x, 176)
			context.scale(1.2, 1)
			context.fillStyle = COLORS.ink
			context.fillText(initial, 0, 0)
			context.restore()
		}
	})
}

/** Sombra ovalada en el suelo, como la del gachapon. */
function groundShadow() {
	const texture = canvasTexture(128, 128, (context) => {
		const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
		gradient.addColorStop(0, 'rgba(92, 42, 30, 0.3)')
		gradient.addColorStop(1, 'rgba(92, 42, 30, 0)')
		context.fillStyle = gradient
		context.fillRect(0, 0, 128, 128)
	})
	const shadow = new Mesh(new PlaneGeometry(3.6, 4), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
	shadow.rotation.x = -Math.PI / 2
	return shadow
}
