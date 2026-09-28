import {
	AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Group,
	HemisphereLight, Material, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NoToneMapping, Object3D,
	PerspectiveCamera, PlaneGeometry, PointLight, Scene, SphereGeometry, SRGBColorSpace, Texture, TorusGeometry, Vector3, WebGLRenderer,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { capsuleHop, HATCH_OPEN, machinePose, TUMBLE_SECONDS } from './machinePose'

const COLORS = {
	body: '#ff8a6e', hood: '#ff977e', trim: '#e9694f', inner: '#ffc9b6', gold: '#ffc54a', ink: '#8a3a2c',
	cream: '#ffe2a8', hatch: '#6b3b35', flap: '#ffab94', lever: '#ffb13d', leverKnob: '#ff9a3c', light: '#fff4c7',
}
const CAPSULE_COLORS = ['#ffb347', '#6fb7ff', '#e58ae8', '#8fd66b', '#f3e2cc', '#ff8fb8']
// Capsule pile resting on the floor of the window (radius 0.3).
const CAPSULES: [number, number, number][] = [
	[-0.72, -0.53, 0.32], [-0.22, -0.55, 0.38], [0.27, -0.54, 0.33], [0.76, -0.53, 0.3],
	[-0.5, -0.56, -0.3], [0.02, -0.55, -0.28], [0.52, -0.56, -0.3],
	[-0.58, -0.03, 0.2], [-0.04, -0.02, 0.28], [0.5, -0.04, 0.18], [-0.28, -0.05, -0.36], [0.28, -0.03, -0.34],
	[-0.32, 0.44, 0.02], [0.3, 0.42, 0.1], [0.74, 0.42, -0.28],
]
const COIN = { x: -0.55, y: -1.45 }
const HATCH = { x: 0.55, y: -1.45 }

export type Point = { x: number; y: number }
export type MachineAnchors = { lever: Point; coin: Point; slot: Point }
export type MachineState = { spinAge: number | null; coinAge: number | null; prizeColor: string }
export type MachineScene = {
	render(time: number, state: MachineState, reducedMotion: boolean): MachineAnchors
	setCost(cost: number): void
	resize(width: number, height: number, pixelRatio: number): void
	dispose(): void
}

export function createMachineScene(canvas: HTMLCanvasElement, width: number, height: number, pixelRatio: number): MachineScene {
	const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
	renderer.toneMapping = NoToneMapping
	renderer.setClearColor(0x000000, 0)
	renderer.setPixelRatio(pixelRatio)
	renderer.setSize(width, height, false)

	const scene = new Scene()
	const camera = new PerspectiveCamera(28, width / height, 0.1, 50)
	camera.position.set(0, 0.4, 11)
	camera.lookAt(0, 0.1, 0)
	scene.add(new HemisphereLight('#ffffff', '#ffe3d6', 2.1), new AmbientLight('#ffffff', 0.3))
	const key = new DirectionalLight('#ffffff', 2.2)
	key.position.set(-3, 5, 6)
	const fill = new DirectionalLight('#ffe8dc', 0.9)
	fill.position.set(4, 1, 3)
	scene.add(key, fill)

	const matte = (color: string) => new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0 })
	const machine = new Group()
	scene.add(machine)
	const add = (parent: Object3D, geometry: BufferGeometry, material: Material, x: number, y: number, z: number) => {
		const mesh = new Mesh(geometry, material)
		mesh.position.set(x, y, z)
		parent.add(mesh)
		return mesh
	}
	const box = (w: number, h: number, d: number, radius: number) => new RoundedBoxGeometry(w, h, d, 3, radius)

	// Cabinet: base, pillars and hood frame the window.
	add(machine, box(2.6, 1.3, 1.8, 0.25), matte(COLORS.body), 0, -1.5, 0)
	for (const side of [-1, 1]) add(machine, box(0.3, 2.0, 1.8, 0.12), matte(COLORS.body), side * 1.15, 0.05, 0)
	add(machine, box(2.2, 2.0, 0.1, 0.04), matte(COLORS.inner), 0, 0.05, -0.8)
	add(machine, box(2.1, 0.05, 1.6, 0.02), matte(COLORS.inner), 0, -0.84, 0)
	add(machine, box(2.95, 1.15, 2.0, 0.4), matte(COLORS.hood), 0, 1.5, 0.02)
	add(machine, box(2.7, 0.12, 1.9, 0.05), matte(COLORS.trim), 0, 0.95, 0)
	for (const side of [-1, 1]) add(machine, box(0.6, 0.42, 0.55, 0.18), matte(COLORS.hood), side * 0.95, 2.12, -0.35).rotation.z = -side * 0.25
	add(machine, box(2.7, 0.18, 0.45, 0.07), matte(COLORS.trim), 0, -0.9, 0.82)

	// Emblem.
	add(machine, new CylinderGeometry(0.44, 0.44, 0.14, 48), matte(COLORS.body), 0, 1.5, 1.03).rotation.x = Math.PI / 2
	add(machine, new TorusGeometry(0.44, 0.05, 12, 48), matte(COLORS.trim), 0, 1.5, 1.1)
	add(machine, new CircleGeometry(0.36, 48), new MeshStandardMaterial({ map: textTexture('XP', 256, 256, 150), transparent: true, roughness: 0.4 }), 0, 1.5, 1.105)

	// Inner light.
	const stripMaterial = new MeshBasicMaterial({ color: COLORS.light })
	add(machine, new BoxGeometry(1.3, 0.07, 0.1), stripMaterial, 0, 0.86, 0.25)
	const glow = new PointLight('#ffd9a0', 4, 3.5, 2)
	glow.position.set(0, 0.55, 0.3)
	machine.add(glow)

	// Capsules with a paw pattern.
	const capsuleGeometry = new SphereGeometry(0.3, 32, 20)
	const capsuleMaterials = CAPSULE_COLORS.map((color, i) => new MeshPhysicalMaterial({ map: pawTexture(color, i), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }))
	const capsules = CAPSULES.map(([x, y, z], i) => {
		const mesh = add(machine, capsuleGeometry, capsuleMaterials[i % capsuleMaterials.length], x, y, z)
		mesh.rotation.set(i * 1.3, i * 0.7, i * 2.1)
		return { mesh, y, rotation: i * 2.1, spin: (i % 2 ? 1 : -1) * (1.4 + (i % 3) * 0.5) }
	})

	// Glass and reflections.
	add(machine, box(2.12, 1.95, 0.05, 0.02), new MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, roughness: 0.05, clearcoat: 1, depthWrite: false }), 0, 0.05, 0.86).renderOrder = 2
	const shine = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false })
	for (const [x, w] of [[-0.55, 0.18], [-0.25, 0.06]] as const) {
		const streak = add(machine, new PlaneGeometry(w, 1.6), shine, x, 0.15, 0.9)
		streak.rotation.z = 0.35
		streak.renderOrder = 3
	}

	// Coin mechanism, only on paid machines.
	const coinGroup = new Group()
	machine.add(coinGroup)
	add(coinGroup, box(0.8, 0.62, 0.1, 0.1), matte(COLORS.cream), COIN.x, COIN.y, 0.93)
	add(coinGroup, box(0.46, 0.26, 0.16, 0.08), matte(COLORS.gold), COIN.x, COIN.y + 0.11, 0.99)
	add(coinGroup, new BoxGeometry(0.28, 0.045, 0.02), matte(COLORS.hatch), COIN.x, COIN.y + 0.11, 1.075)
	const priceMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false })
	add(coinGroup, new PlaneGeometry(0.6, 0.2), priceMaterial, COIN.x, COIN.y - 0.17, 0.985)
	const coin = add(coinGroup, new CylinderGeometry(0.15, 0.15, 0.04, 32), new MeshStandardMaterial({ color: COLORS.gold, roughness: 0.25, metalness: 0.6 }), COIN.x, 0, 1.08)
	coin.rotation.x = Math.PI / 2

	// Prize hatch with a hinged flap and the capsule peeking out.
	add(machine, box(0.72, 0.56, 0.1, 0.1), matte(COLORS.trim), HATCH.x, HATCH.y, 0.93)
	add(machine, box(0.54, 0.38, 0.06, 0.08), matte(COLORS.hatch), HATCH.x, HATCH.y, 0.97)
	const flap = new Group()
	flap.position.set(HATCH.x, HATCH.y + 0.19, 1.01)
	machine.add(flap)
	add(flap, box(0.54, 0.38, 0.03, 0.03), matte(COLORS.flap), 0, -0.19, 0)
	const prizeMaterial = new MeshPhysicalMaterial({ color: CAPSULE_COLORS[0], roughness: 0.25, clearcoat: 1 })
	const prize = add(machine, new SphereGeometry(0.17, 24, 16), prizeMaterial, HATCH.x, HATCH.y - 0.04, 0.95)

	// Lever on the right side.
	const lever = new Group()
	lever.position.set(1.42, -1.2, 0.6)
	machine.add(lever)
	add(lever, new CylinderGeometry(0.17, 0.17, 0.16, 32), matte(COLORS.trim), 0, 0, 0).rotation.z = Math.PI / 2
	add(lever, new CylinderGeometry(0.055, 0.055, 0.95, 16), matte(COLORS.lever), 0, 0.48, 0)
	add(lever, new SphereGeometry(0.17, 24, 16), new MeshStandardMaterial({ color: COLORS.leverKnob, roughness: 0.3 }), 0, 0.98, 0)

	scene.add(groundShadow())

	let prizeColor = ''
	const point = new Vector3()
	const anchor = (object: Object3D, x: number, y: number, z: number): Point => {
		point.set(x, y, z)
		object.localToWorld(point)
		point.project(camera)
		return { x: (point.x + 1) / 2 * width, y: (1 - point.y) / 2 * height }
	}
	const stripColor = new Color(COLORS.light)

	return {
		render(time, state, reducedMotion) {
			const { spinAge } = state
			const pose = machinePose(time, spinAge, state.coinAge, reducedMotion)
			machine.rotation.y = pose.sway
			machine.position.x = pose.shakeX
			lever.rotation.x = pose.lever
			flap.rotation.x = -1.2 * pose.hatch
			stripMaterial.color.copy(stripColor).multiplyScalar(pose.light)
			glow.intensity = 4 * pose.light
			coin.visible = pose.coin !== null && pose.coin < 1
			coin.position.y = COIN.y + 0.45 - 0.34 * (pose.coin ?? 0)
			const mix = spinAge === null ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, spinAge) / TUMBLE_SECONDS))
			capsules.forEach((capsule, i) => {
				const breathe = reducedMotion ? 0 : Math.sin(time * 1.6 + i) * 0.01
				capsule.mesh.position.y = capsule.y + breathe + capsuleHop(i, spinAge ?? 0, pose.tumble)
				capsule.mesh.rotation.z = capsule.rotation + capsule.spin * mix
			})
			if (state.prizeColor !== prizeColor) prizeMaterial.color.set(prizeColor = state.prizeColor)
			// The capsule peeks out, then the reveal carries it to the centre of the screen.
			prize.visible = !reducedMotion && spinAge !== null && spinAge >= HATCH_OPEN.start && spinAge < HATCH_OPEN.end + 0.2
			prize.position.z = 0.95 + 0.14 * pose.hatch
			renderer.render(scene, camera)
			return {
				lever: anchor(lever, 0, 0.62, 0),
				coin: anchor(machine, COIN.x, COIN.y + 0.05, 1),
				slot: anchor(machine, HATCH.x, HATCH.y, 1),
			}
		},
		setCost(cost) {
			coinGroup.visible = cost > 0
			priceMaterial.map?.dispose()
			priceMaterial.map = cost > 0 ? textTexture(`● ${cost.toLocaleString('es-MX')}`, 384, 128, 76, COLORS.ink) : null
			priceMaterial.needsUpdate = true
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

function textTexture(text: string, width: number, height: number, size: number, color = COLORS.gold) {
	return canvasTexture(width, height, (context) => {
		context.font = `900 ${size}px system-ui, sans-serif`
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.lineJoin = 'round'
		if (color === COLORS.gold) {
			context.lineWidth = size * 0.14
			context.strokeStyle = COLORS.ink
			context.strokeText(text, width / 2, height / 2 + size * 0.05)
		}
		context.fillStyle = color
		context.fillText(text, width / 2, height / 2 + size * 0.05)
	})
}

/** Capsule colour with soft, lighter paw prints. */
function pawTexture(color: string, seed: number) {
	let state = seed * 9301 + 49297
	const random = () => (state = (state * 9301 + 49297) % 233280) / 233280
	return canvasTexture(256, 128, (context) => {
		context.fillStyle = color
		context.fillRect(0, 0, 256, 128)
		context.fillStyle = 'rgba(255, 255, 255, 0.35)'
		for (let i = 0; i < 7; i++) {
			const x = random() * 256, y = 20 + random() * 88, s = 7 + random() * 5
			context.beginPath()
			context.ellipse(x, y, s * 1.2, s, 0, 0, Math.PI * 2)
			for (const [dx, dy] of [[-1.3, -1.5], [0, -2], [1.3, -1.5]]) {
				context.moveTo(x + dx * s + s * 0.45, y + dy * s)
				context.arc(x + dx * s, y + dy * s, s * 0.45, 0, Math.PI * 2)
			}
			context.fill()
		}
	})
}

/** Soft oval shadow that stays on the floor while the machine sways. */
function groundShadow() {
	const texture = canvasTexture(128, 128, (context) => {
		const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
		gradient.addColorStop(0, 'rgba(92, 42, 30, 0.3)')
		gradient.addColorStop(1, 'rgba(92, 42, 30, 0)')
		context.fillStyle = gradient
		context.fillRect(0, 0, 128, 128)
	})
	const shadow = new Mesh(new PlaneGeometry(3.9, 1.4), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
	shadow.rotation.x = -Math.PI / 2
	shadow.position.y = -2.2
	return shadow
}
