import {
	AmbientLight, BoxGeometry, CanvasTexture, CylinderGeometry, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Material, Mesh,
	MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NoToneMapping, Object3D, PerspectiveCamera, PlaneGeometry, Scene, Shape, SphereGeometry,
	SRGBColorSpace, Texture, Vector3, WebGLRenderer,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Misma paleta que el gachapon.
const COLORS = { body: '#ff8a6e', door: '#ff977e', trim: '#e9694f', slot: '#6b3b35', gold: '#ffc54a', post: '#d3a676', paper: '#fffdf7', seal: '#e9694f' }
const FRONT = 0.83
const SLOT = { y: 0.62, z: FRONT + 0.02 }
const DOOR = { x: -0.52, y: -0.24, width: 1.04, height: 0.62 }
const FLAG_DOWN = -1.75
/** Segundos de cada momento. El sobre entra por la ranura en `ARRIVAL.in`. */
export const ARRIVAL = { fall: 0.45, in: 0.75, end: 1.2 }
export const DRAW = { open: 0.3, out: 0.68, close: 0.85, end: 1.25 }

export type Point = { x: number; y: number }
export type MailboxAnchors = { slot: Point; slotWidth: number; badge: Point }
export type MailboxState = {
	/** Segundos desde que llegó la última carta, o null. */
	arrival: number | null
	/** Segundos desde que el maestro sacó una carta, o null. */
	draw: number | null
	/** Segundos desde que aterrizó la carta que envió este dispositivo, o null. */
	landing: number | null
	/** Hay cartas sin leer: la bandera sube. */
	full: boolean
}
export type MailboxScene = {
	render(time: number, state: MailboxState, reducedMotion: boolean): { anchors: MailboxAnchors; busy: boolean }
	resize(width: number, height: number, pixelRatio: number): void
	dispose(): void
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p), 3)
const easeIn = (p: number) => Math.pow(clamp(p), 3)
const easeInOut = (p: number) => { p = clamp(p); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2 }
const between = (age: number, start: number, end: number) => clamp((age - start) / (end - start))
/** Rebote amortiguado: se aplasta, se estira y vuelve. */
const squash = (age: number | null, length: number) => age === null || age < 0 || age > length ? 0 : Math.sin(age / length * Math.PI * 2) * (1 - age / length)

export function createMailboxScene(canvas: HTMLCanvasElement, width: number, height: number, pixelRatio: number): MailboxScene {
	const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
	renderer.toneMapping = NoToneMapping
	renderer.setClearColor(0x000000, 0)
	renderer.setPixelRatio(pixelRatio)
	renderer.setSize(width, height, false)

	const scene = new Scene()
	const camera = new PerspectiveCamera(26, width / height, 0.1, 50)
	camera.position.set(0, 2.4, 10.2)
	camera.lookAt(0, -0.35, 0)
	scene.add(new HemisphereLight('#ffffff', '#ffd9c9', 1.5), new AmbientLight('#ffffff', 0.25))
	const key = new DirectionalLight('#ffffff', 2.8)
	key.position.set(-4, 6, 5)
	const fill = new DirectionalLight('#ffe8dc', 0.7)
	fill.position.set(4, 1, 3)
	// Luz de contorno por detrás: separa el arco del fondo.
	const rim = new DirectionalLight('#fff0e6', 1.3)
	rim.position.set(5, 3, -4)
	scene.add(key, fill, rim)

	const matte = (color: string) => new MeshStandardMaterial({ color, roughness: 0.48, metalness: 0 })
	const add = <T extends Object3D>(parent: Object3D, child: T, x = 0, y = 0, z = 0) => { child.position.set(x, y, z); parent.add(child); return child }
	const mesh = (geometry: ConstructorParameters<typeof Mesh>[0], material: Material) => new Mesh(geometry, material)
	const box = (w: number, h: number, d: number, radius: number) => new RoundedBoxGeometry(w, h, d, 3, radius)

	// Todo el buzón se balancea; el cuerpo se aplasta desde su base, sobre el poste.
	const mailbox = add(scene, new Group())
	add(mailbox, mesh(box(0.32, 1.35, 0.32, 0.06), matte(COLORS.post)), 0, -1.45)
	const body = add(mailbox, new Group(), 0, -0.83)
	const inner = add(body, new Group(), 0, 0.83)

	// Cuerpo con techo en arco, extruido desde el mismo perfil que el dibujo plano.
	const profile = new Shape()
	profile.moveTo(-0.83, -0.75)
	profile.lineTo(0.83, -0.75)
	profile.quadraticCurveTo(0.95, -0.75, 0.95, -0.63)
	profile.lineTo(0.95, 0.35)
	profile.absarc(0, 0.35, 0.95, 0, Math.PI, false)
	profile.lineTo(-0.95, -0.63)
	profile.quadraticCurveTo(-0.95, -0.75, -0.83, -0.75)
	const shell = new ExtrudeGeometry(profile, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 5, curveSegments: 40 })
	shell.translate(0, 0, -0.75)
	// Pintura brillante, como un buzón de lámina.
	add(inner, mesh(shell, new MeshPhysicalMaterial({ color: COLORS.body, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.22 })))

	// Ranura con marco.
	add(inner, mesh(box(1.12, 0.26, 0.05, 0.1), matte(COLORS.trim)), 0, SLOT.y, FRONT + 0.005)
	add(inner, mesh(box(0.9, 0.1, 0.04, 0.05), matte(COLORS.slot)), 0, SLOT.y, SLOT.z)

	// Puerta con bisagra a la izquierda y el interior oscuro detrás.
	add(inner, mesh(new PlaneGeometry(DOOR.width - 0.08, DOOR.height - 0.08), new MeshBasicMaterial({ color: '#3d211d' })), 0, DOOR.y, FRONT + 0.012)
	const door = add(inner, new Group(), DOOR.x, DOOR.y, FRONT + 0.03)
	add(door, mesh(box(DOOR.width, DOOR.height, 0.06, 0.07), matte(COLORS.door)), DOOR.width / 2, 0, 0)
	add(door, mesh(new SphereGeometry(0.055, 20, 12), new MeshStandardMaterial({ color: COLORS.gold, roughness: 0.25, metalness: 0.5 })), DOOR.width - 0.13, 0, 0.05)

	// Bandera: abajo sin cartas, arriba cuando hay alguna sin leer.
	const flag = add(inner, new Group(), 1.07, 0.12, 0.25)
	add(flag, mesh(new CylinderGeometry(0.045, 0.045, 0.82, 16), matte('#8a5a3b')), 0, 0.41, 0)
	add(flag, mesh(box(0.44, 0.3, 0.05, 0.05), matte(COLORS.gold)), 0.24, 0.68, 0)
	add(flag, mesh(new CylinderGeometry(0.08, 0.08, 0.08, 20), matte(COLORS.slot)), 0, 0, 0).rotation.x = Math.PI / 2

	// El sobre: entra por la ranura cuando llega una carta y sale por la puerta cuando se saca.
	const paper = matte(COLORS.paper)
	const envelope = add(inner, new Group())
	add(envelope, new Mesh(new BoxGeometry(0.74, 0.025, 0.5), [paper, paper, new MeshStandardMaterial({ map: envelopeTexture(), roughness: 0.6 }), paper, paper, paper]))
	envelope.visible = false

	scene.add(groundShadow())

	let flagAngle = FLAG_DOWN, flagSpeed = 0, last = 0
	const point = new Vector3()
	const project = (object: Object3D, x: number, y: number, z: number): Point => {
		point.set(x, y, z)
		object.localToWorld(point)
		point.project(camera)
		return { x: (point.x + 1) / 2 * width, y: (1 - point.y) / 2 * height }
	}

	return {
		render(time, state, reducedMotion) {
			const dt = Math.min(0.05, Math.max(0, time - last))
			last = time
			mailbox.rotation.y = reducedMotion ? -0.36 : -0.36 + Math.sin(time * 0.7) * 0.05

			// La bandera es un resorte: sube con un pequeño rebote.
			const target = state.full ? 0 : FLAG_DOWN
			if (reducedMotion) { flagAngle = target; flagSpeed = 0 }
			else {
				flagSpeed += ((target - flagAngle) * 140 - flagSpeed * 11) * dt
				flagAngle += flagSpeed * dt
			}
			flag.rotation.z = flagAngle

			const s = reducedMotion ? 0 : squash(state.arrival === null ? null : state.arrival - ARRIVAL.in + 0.05, 0.5) || squash(state.landing, 0.45)
			body.scale.set(1 + s * 0.06, 1 - s * 0.08, 1 + s * 0.06)

			const drawAge = reducedMotion ? null : state.draw
			const opening = drawAge === null ? 0 : drawAge < DRAW.close ? easeOut(drawAge / DRAW.open) : 1 - easeInOut(between(drawAge, DRAW.close, DRAW.end))
			door.rotation.y = -1.9 * opening

			envelope.visible = false
			const arrival = reducedMotion ? null : state.arrival
			if (arrival !== null && arrival < ARRIVAL.in) {
				// Cae desde arriba, se alinea con la ranura y entra.
				const fall = easeOut(arrival / ARRIVAL.fall), slide = easeIn(between(arrival, ARRIVAL.fall, ARRIVAL.in))
				envelope.visible = true
				envelope.position.set(0.45 * (1 - fall), SLOT.y + 1.5 * (1 - fall), 1.55 - 1.35 * slide)
				envelope.rotation.set(0.7 * (1 - fall), 0, 0.35 * (1 - fall))
				envelope.scale.setScalar(1)
			} else if (drawAge !== null && drawAge > 0.18 && drawAge < DRAW.out) {
				// Sale por la puerta hacia quien mira; luego la carta de papel toma su lugar.
				const out = easeOut(between(drawAge, 0.18, DRAW.out))
				envelope.visible = true
				envelope.position.set(0, DOOR.y + 0.25 * out, 0.4 + 2.2 * out)
				envelope.rotation.set(Math.PI / 2 * out, 0, 0)
				envelope.scale.setScalar(1 + out * 0.5)
			}

			renderer.render(scene, camera)
			const left = project(inner, -0.45, SLOT.y, SLOT.z), right = project(inner, 0.45, SLOT.y, SLOT.z)
			return {
				anchors: { slot: project(inner, 0, SLOT.y, SLOT.z), slotWidth: Math.abs(right.x - left.x), badge: project(inner, -0.78, 1.0, FRONT) },
				busy: Math.abs(target - flagAngle) > 0.002 || Math.abs(flagSpeed) > 0.002 || (state.arrival !== null && state.arrival < ARRIVAL.end) || (state.draw !== null && state.draw < DRAW.end) || (state.landing !== null && state.landing < 0.5),
			}
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
			scene.traverse((object) => {
				if (!(object instanceof Mesh)) return
				object.geometry.dispose()
				for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
					if ('map' in material && material.map instanceof Texture) material.map.dispose()
					material.dispose()
				}
			})
			renderer.dispose()
		},
	}
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

/** Papel crema con la solapa en V y un sello rojo. */
function envelopeTexture() {
	return canvasTexture(256, 172, (context) => {
		context.fillStyle = COLORS.paper
		context.fillRect(0, 0, 256, 172)
		context.strokeStyle = '#c9b99c'
		context.lineWidth = 6
		context.lineJoin = 'round'
		context.strokeRect(3, 3, 250, 166)
		context.beginPath()
		context.moveTo(6, 8); context.lineTo(128, 96); context.lineTo(250, 8)
		context.stroke()
		context.fillStyle = COLORS.seal
		context.beginPath()
		context.arc(128, 96, 18, 0, Math.PI * 2)
		context.fill()
	})
}

/** Sombra ovalada en el suelo, quieta aunque el buzón se balancee. */
function groundShadow() {
	const texture = canvasTexture(128, 128, (context) => {
		const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
		gradient.addColorStop(0, 'rgba(92, 42, 30, 0.3)')
		gradient.addColorStop(1, 'rgba(92, 42, 30, 0)')
		context.fillStyle = gradient
		context.fillRect(0, 0, 128, 128)
	})
	const shadow = new Mesh(new PlaneGeometry(2.6, 1.1), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
	shadow.rotation.x = -Math.PI / 2
	shadow.position.y = -2.12
	return shadow
}
