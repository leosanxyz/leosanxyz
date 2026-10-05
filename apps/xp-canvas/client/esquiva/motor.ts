// Demo de Esquiva para la clase de calidad: un piloto automático juega el nivel "Caos" y cada versión
// pule un momento del juego. Cambiar de versión se nota en el instante, sin reiniciar la partida.
//   0 Punto de partida · 1 Moverse · 2 Recibir un golpe · 3 Esquivar · 4 Gráficos · 5 Quitar

export const VERSIONES_ESQUIVA = [
	{ titulo: 'Punto de partida', detalle: 'Funciona, pero se siente plano.' },
	{ titulo: 'Moverse', detalle: 'Acelera y frena con ease-out, se estira y deja estela.' },
	{ titulo: 'Recibir un golpe', detalle: 'Pausa, sacudida, destello, chispas, sonido y corazón roto.' },
	{ titulo: 'Esquivar', detalle: 'Aviso antes de entrar. Rozar da «¡Uff!» y adelanta la barra.' },
	{ titulo: 'Gráficos', detalle: 'HUD flotante, corazones dibujados, sombras y enemigos con más movimiento.' },
	{ titulo: 'Quitar', detalle: 'Sin textos flotantes ni sonido de aviso: ya sobraban.' },
] as const

const ANCHO = 800
const ALTO = 600
const DURACION_ENEMIGO = 8
const INVENCIBLE_TRAS_GOLPE = 1.5
const DURACION_MORPH = 0.5
const VIAJE_ORBE = 0.4
const BARRA = { x: 20, y: 54, w: 220, h: 8 }

const JUGADOR = { color: '#4fc3f7', r: 14, velocidad: 4, vidas: 3 }
type Movimiento = 'recto' | 'perseguir' | 'rebotar'
type TipoEnemigo = { nombre: string; color: string; forma: 'cuadrado' | 'triangulo' | 'circulo'; r: number; velocidad: number; movimiento: Movimiento }
const ENEMIGOS: TipoEnemigo[] = [
	{ nombre: 'Roca', color: '#9e9e9e', forma: 'cuadrado', r: 18, velocidad: 3, movimiento: 'recto' },
	{ nombre: 'Cazador', color: '#ef5350', forma: 'triangulo', r: 16, velocidad: 2, movimiento: 'perseguir' },
	{ nombre: 'Pelota', color: '#ffca28', forma: 'circulo', r: 12, velocidad: 4, movimiento: 'rebotar' },
]
const NIVEL = { numero: 3, nombre: 'Caos', fondo: '#2d132c', aparicion: 0.7, duracion: 30 }

// Valores de feel de cada versión.
const AJUSTES = {
	velocidad: 5.6,
	acelerar: { duracion: 0.12, ease: [0.25, 1, 0.5, 1] as const },
	frenar: { duracion: 0.09, ease: [0.25, 1, 0.5, 1] as const },
	estiramiento: 0.22,
	forma: { visualDuration: 0.21, bounce: 0.75 },
	pausa: 0.09, sacudida: 9, temblor: 0.28, destello: 0.3, chispas: 22,
	aviso: 0.5, camaraLenta: 0.16, roce: 26, bono: 0.03,
	distraccion: 0.07,
}

type Enemigo = {
	tipo: TipoEnemigo; x: number; y: number; dx: number; dy: number; r: number; edad: number
	rozando?: boolean; uff?: boolean; antes?: { dx: number; dy: number }; rebote?: { edad: number; eje: 'x' | 'y' } | null
}
type Caja = [number, number, number, number]
type Marca = { edad: number; vida: number; r: number; sigue?: boolean; enemigo?: Enemigo; x?: number; y?: number; caja?: () => Caja }
type Morfo = { valor: number; desde: number; hacia: number; t: number }
type Sonido = 'golpe' | 'aviso' | 'bono' | 'uff'

const sobre = (a: number, b: number, u: number) => a + (b - a) * u
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const azar = (min: number, max: number) => min + Math.random() * (max - min)
const easeSalida = (p: number) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2
// Parte del morph que ocurre entre a y b, suavizada. Sirve para escalonar movimientos.
const tramo = (g: number, a: number, b: number) => {
	const u = limitar((g - a) / (b - a), 0, 1)
	return u * u * (3 - 2 * u)
}

// Curva cúbica de Bézier, como en CSS. Devuelve el avance para p entre 0 y 1.
function curvaBezier([x1, y1, x2, y2]: readonly number[]) {
	const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
	const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
	const x = (s: number) => ((ax * s + bx) * s + cx) * s
	const y = (s: number) => ((ay * s + by) * s + cy) * s
	return (p: number) => {
		if (p <= 0) return 0
		if (p >= 1) return 1
		let a = 0, b = 1, s = p
		for (let i = 0; i < 24; i++) {
			s = (a + b) / 2
			if (x(s) < p) a = s
			else b = s
		}
		return y(s)
	}
}

// Resorte con la misma convención de Motion: visualDuration y bounce.
function resorte({ visualDuration, bounce }: { visualDuration: number; bounce: number }) {
	const raiz = (2 * Math.PI) / (visualDuration * 1.2)
	const rigidez = raiz * raiz
	return { rigidez, amortiguacion: 2 * limitar(1 - bounce, 0.05, 1) * Math.sqrt(rigidez) }
}

const crearMorfo = (activo: boolean): Morfo => ({ valor: +activo, desde: +activo, hacia: +activo, t: 1 })
function avanzarMorfo(m: Morfo, objetivo: number, dt: number) {
	if (objetivo !== m.hacia) Object.assign(m, { desde: m.valor, hacia: objetivo, t: 0 })
	m.t = Math.min(1, m.t + dt / DURACION_MORPH)
	const e = m.t < 0.5 ? 4 * m.t ** 3 : 1 - (-2 * m.t + 2) ** 3 / 2
	m.valor = m.desde + (m.hacia - m.desde) * e
}

function sintetizar(ac: AudioContext, tipo: Sonido) {
	const t = ac.currentTime
	const tono = (tipoOnda: OscillatorType, desde: number, hacia: number, volumen: number, dura: number, retraso = 0) => {
		const o = ac.createOscillator()
		const g = ac.createGain()
		o.type = tipoOnda
		o.frequency.setValueAtTime(desde, t + retraso)
		if (hacia !== desde) o.frequency.exponentialRampToValueAtTime(hacia, t + retraso + dura * 0.6)
		g.gain.setValueAtTime(0.0001, t + retraso)
		g.gain.exponentialRampToValueAtTime(volumen, t + retraso + 0.01)
		g.gain.exponentialRampToValueAtTime(0.0001, t + retraso + dura)
		o.connect(g).connect(ac.destination)
		o.start(t + retraso)
		o.stop(t + retraso + dura + 0.02)
	}
	if (tipo === 'golpe') {
		tono('triangle', 240, 50, 0.7, 0.32)
		const largo = Math.floor(ac.sampleRate * 0.16)
		const buffer = ac.createBuffer(1, largo, ac.sampleRate)
		const datos = buffer.getChannelData(0)
		for (let i = 0; i < largo; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / largo) ** 2
		const ruido = ac.createBufferSource()
		ruido.buffer = buffer
		const filtro = ac.createBiquadFilter()
		filtro.type = 'lowpass'
		filtro.frequency.value = 1600
		const g = ac.createGain()
		g.gain.value = 0.45
		ruido.connect(filtro).connect(g).connect(ac.destination)
		ruido.start(t)
	}
	if (tipo === 'aviso') tono('sine', 520, 700, 0.12, 0.12)
	if (tipo === 'bono') tono('sine', 1320, 1980, 0.16, 0.16)
	if (tipo === 'uff') {
		tono('sine', 880, 880, 0.22, 0.22)
		tono('sine', 1320, 1320, 0.22, 0.22, 0.07)
	}
}

export class DemoEsquiva {
	private readonly ctx: CanvasRenderingContext2D
	private paso = 0
	private verAntes = false
	private sonido: AudioContext | null = null
	private cuadro = 0
	private anterior = 0
	private pausada = false
	private readonly morfos: { graficos: Morfo; quitar: Morfo }

	private jugador = this.jugadorNuevo()
	private enemigos: Enemigo[] = []
	private pendientes: { enemigo: Enemigo; espera: number }[] = []
	private textos: { texto: string; x: number; y: number; edad: number; color: string }[] = []
	private chispas: { x: number; y: number; vx: number; vy: number; edad: number; vida: number; lado: number; color: string }[] = []
	private corazonesRotos: { indice: number; edad: number }[] = []
	private orbes: { x: number; y: number; edad: number }[] = []
	private marcas: Marca[] = []
	private ultimaMarca: Record<string, number> = {}
	private tiempoNivel = 0
	private siguienteEnemigo = 0.2
	private congelado = 0
	private camaraLenta = 0
	private sacudida = 0
	private destello = 0
	private anilloUff = 0
	private pulsoBarra = 0
	private brilloBarra: { desde: number; hasta: number; edad: number } | null = null
	private piloto = { meta: { x: ANCHO / 2, y: ALTO / 2 }, cambioMeta: 0, decision: 0, pausa: 0, distraido: 0, escape: 0, teclas: { x: 0, y: 0 } }

	constructor(lienzo: HTMLCanvasElement, paso: number, verAntes: boolean) {
		lienzo.width = ANCHO
		lienzo.height = ALTO
		this.ctx = lienzo.getContext('2d')!
		this.paso = paso
		this.verAntes = verAntes
		this.morfos = { graficos: crearMorfo(this.hay(4)), quitar: crearMorfo(this.hay(5)) }
		this.anterior = performance.now()
		this.cuadro = requestAnimationFrame(this.bucle)
	}

	// ---------- API ----------

	ponerPaso(paso: number, verAntes: boolean) {
		const cambio = paso !== this.paso
		this.paso = paso
		this.verAntes = verAntes
		if (cambio) this.marcarCambio()
	}

	/** El sonido solo existe en el dispositivo que lo activa. Hay que llamarlo desde un toque o clic. */
	ponerSonido(activo: boolean) {
		if (activo && !this.sonido) this.sonido = new AudioContext()
		if (!activo && this.sonido) {
			void this.sonido.close()
			this.sonido = null
		}
	}

	pausar(pausada: boolean) {
		if (this.pausada === pausada) return
		this.pausada = pausada
		if (!pausada) {
			this.anterior = performance.now()
			this.cuadro = requestAnimationFrame(this.bucle)
		}
	}

	destruir() {
		cancelAnimationFrame(this.cuadro)
		this.ponerSonido(false)
	}

	// ---------- Bucle ----------

	private bucle = (ahora: number) => {
		if (this.pausada) return
		const dtReal = Math.min(0.05, (ahora - this.anterior) / 1000)
		this.anterior = ahora
		try {
			this.avanzar(dtReal)
			this.dibujar()
		} catch (error) {
			console.error(error)
		}
		this.cuadro = requestAnimationFrame(this.bucle)
	}

	private hay(n: number) { return !this.verAntes && this.paso >= n }
	private mezcla(a: number, b: number) { return sobre(a, b, this.morfos.graficos.valor) }

	private sonar(tipo: Sonido) { if (this.sonido) sintetizar(this.sonido, tipo) }

	// La pausa de impacto y la cámara lenta cambian el tiempo del juego, no el de los efectos.
	private avanzar(dtReal: number) {
		let dt = dtReal
		if (this.congelado > 0) {
			this.congelado -= dtReal
			dt = 0
		} else if (this.camaraLenta > 0) {
			this.camaraLenta -= dtReal
			dt *= 0.3
		}
		this.sacudida = Math.max(0, this.sacudida - dtReal)
		this.destello = Math.max(0, this.destello - dtReal)
		this.anilloUff = Math.max(0, this.anilloUff - dtReal)
		this.pulsoBarra = Math.max(0, this.pulsoBarra - dtReal)
		avanzarMorfo(this.morfos.graficos, this.hay(4) ? 1 : 0, dtReal)
		avanzarMorfo(this.morfos.quitar, this.hay(5) ? 1 : 0, dtReal)
		for (const c of this.corazonesRotos) c.edad += dtReal
		this.corazonesRotos = this.corazonesRotos.filter((c) => c.edad < 0.9)
		for (const o of this.orbes) o.edad += dtReal
		const llegan = this.orbes.filter((o) => o.edad >= VIAJE_ORBE).length
		this.orbes = this.orbes.filter((o) => o.edad < VIAJE_ORBE)
		for (let i = 0; i < llegan; i++) this.sumarBono()
		if (this.brilloBarra && (this.brilloBarra.edad += dtReal) > 0.7) this.brilloBarra = null
		for (const m of this.marcas) m.edad += dtReal
		this.marcas = this.marcas.filter((m) => m.edad < m.vida)
		if (dt > 0) this.actualizar(dt)
	}

	private jugadorNuevo() {
		return {
			x: ANCHO / 2, y: ALTO / 2, vx: 0, vy: 0, angulo: 0, forma: 0, velocidadForma: 0, vidas: JUGADOR.vidas, invencible: 0,
			rastro: [] as { x: number; y: number }[],
			transicion: { desdeX: 0, desdeY: 0, haciaX: 0, haciaY: 0, t: 1, duracion: 1, curva: (p: number) => p },
		}
	}

	// ---------- Marcas ----------
	// Como en Interface Craft: señalan lo que agrega la versión activa cuando ocurre.

	private marcar(n: number, marca: Partial<Marca>, clave?: string, espera = 0) {
		if (this.paso !== n || this.verAntes) return
		const ahora = performance.now() / 1000
		if (clave && ahora - (this.ultimaMarca[clave] ?? -99) < espera) return
		if (clave) this.ultimaMarca[clave] = ahora
		this.marcas.push({ edad: 0, vida: 0.9, r: 30, ...marca })
	}

	// Al cambiar de versión se marca de inmediato lo que ya está en pantalla.
	private marcarCambio() {
		const { paso } = this
		if (paso === 1) this.marcar(1, { sigue: true, r: 30, vida: 1.2 })
		if (paso === 2) {
			this.marcar(2, { sigue: true, r: 36, vida: 1.2 })
			this.marcar(2, { x: ANCHO - 38, y: 20, r: 30, vida: 1.2 })
		}
		if (paso === 3) {
			this.marcar(3, { sigue: true, r: 38, vida: 1.2 })
			for (const p of this.pendientes) this.marcar(3, { ...this.posAviso(p.enemigo), r: 22, vida: 1 })
		}
		if (paso === 4) {
			for (const tipo of ['recto', 'rebotar']) {
				const enemigo = this.enemigos.find((e) => e.tipo.movimiento === tipo)
				if (enemigo) this.marcar(4, { enemigo, r: enemigo.r + 14, vida: 1.4 })
			}
			// Las cajas se calculan en cada cuadro, así acompañan el morph de la interfaz.
			this.marcar(4, { caja: () => this.cajaNivel(), vida: 1.4 })
			this.marcar(4, { caja: () => this.cajaCorazones(), vida: 1.4 })
		}
	}

	// ---------- Simulación ----------

	private posAviso(e: Enemigo) { return { x: limitar(e.x, 18, ANCHO - 18), y: limitar(e.y, 62, ALTO - 18) } }

	private crearEnemigo() {
		const tipo = ENEMIGOS[Math.floor(Math.random() * ENEMIGOS.length)]
		const { r } = tipo
		const borde = Math.floor(Math.random() * 4)
		const [x, y] = borde === 0 ? [azar(0, ANCHO), -r] : borde === 1 ? [ANCHO + r, azar(0, ALTO)] : borde === 2 ? [azar(0, ANCHO), ALTO + r] : [-r, azar(0, ALTO)]
		const angulo = Math.atan2(azar(ALTO * 0.25, ALTO * 0.75) - y, azar(ANCHO * 0.25, ANCHO * 0.75) - x)
		const enemigo: Enemigo = { tipo, r, x, y, dx: Math.cos(angulo), dy: Math.sin(angulo), edad: 0 }
		// Con el aviso, el enemigo espera en el borde mientras se ve la marca.
		if (this.hay(3)) {
			this.pendientes.push({ enemigo, espera: AJUSTES.aviso })
			if (!this.hay(5)) this.sonar('aviso')
			this.marcar(3, { ...this.posAviso(enemigo), r: 22, vida: AJUSTES.aviso + 0.2 }, 'aviso', 0.9)
		} else {
			this.enemigos.push(enemigo)
		}
	}

	private mover(e: Enemigo, paso: number) {
		const j = this.jugador
		if (e.tipo.movimiento === 'perseguir') {
			const d = Math.hypot(j.x - e.x, j.y - e.y) || 1
			e.dx = (j.x - e.x) / d
			e.dy = (j.y - e.y) / d
		}
		e.x += e.dx * paso
		e.y += e.dy * paso
		if (e.tipo.movimiento === 'rebotar') {
			if (e.x < e.r || e.x > ANCHO - e.r) { e.dx *= -1; e.x = limitar(e.x, e.r, ANCHO - e.r) }
			if (e.y < e.r || e.y > ALTO - e.r) { e.dy *= -1; e.y = limitar(e.y, e.r, ALTO - e.r) }
		}
	}

	// Piloto automático: juega como una persona. Va hacia un punto, esquiva lo que tiene cerca y reacciona
	// con un pequeño retraso. A veces se distrae o se detiene, por eso roza enemigos y a veces recibe golpes.
	private pilotar(dt: number) {
		const p = this.piloto, j = this.jugador
		p.cambioMeta -= dt; p.decision -= dt; p.pausa -= dt; p.distraido -= dt; p.escape -= dt
		if (p.cambioMeta <= 0 || Math.hypot(p.meta.x - j.x, p.meta.y - j.y) < 50) {
			p.meta = { x: azar(90, ANCHO - 90), y: azar(110, ALTO - 80) }
			p.cambioMeta = azar(1, 2.6)
			if (Math.random() < 0.25) p.pausa = azar(0.2, 0.5)
		}
		if (p.decision > 0) return
		p.decision = azar(0.06, 0.12)
		if (Math.random() < AJUSTES.distraccion) p.distraido = 0.35
		let fx = 0, fy = 0, peligro = 0
		if (p.distraido <= 0) {
			for (const e of this.enemigos) {
				// Punto más cercano del camino del enemigo en el próximo cuarto de segundo:
				// así la dirección de huida no se invierte cuando ya está encima.
				const adelante = e.tipo.velocidad * 60 * 0.25
				const s = limitar(((j.x - e.x) * e.dx + (j.y - e.y) * e.dy) / adelante, 0, 1)
				let dx = j.x - (e.x + e.dx * adelante * s), dy = j.y - (e.y + e.dy * adelante * s)
				let d = Math.hypot(dx, dy)
				if (d < 1) { dx = -e.dy; dy = e.dx; d = 1 }
				const alcance = 110 + e.r
				if (d < alcance) {
					const w = (1 - d / alcance) ** 2 * 4
					fx += (dx / d) * w; fy += (dy / d) * w; peligro += w
				}
			}
		}
		const borde = 80
		fx += (Math.max(0, borde - j.x) - Math.max(0, j.x - (ANCHO - borde))) / borde * 2
		fy += (Math.max(0, 44 + borde - j.y) - Math.max(0, j.y - (ALTO - borde))) / borde * 2
		// Mucho peligro: elige una ruta de escape y se compromete con ella. Cerca de una pared, se inclina al centro.
		if (peligro > 1 && p.escape <= 0) {
			const f = Math.hypot(fx, fy) || 1
			const cercaPared = Math.min(j.x, ANCHO - j.x, j.y - 44, ALTO - j.y) < 130
			const cx = ANCHO / 2 - j.x, cy = ALTO / 2 - j.y, cd = Math.hypot(cx, cy) || 1
			const ex = fx / f + (cercaPared ? cx / cd : 0), ey = fy / f + (cercaPared ? cy / cd : 0)
			const ed = Math.hypot(ex, ey) || 1
			p.meta = { x: limitar(j.x + (ex / ed) * 240, 90, ANCHO - 90), y: limitar(j.y + (ey / ed) * 240, 110, ALTO - 80) }
			p.cambioMeta = 0.9; p.pausa = 0; p.escape = 0.45
		}
		p.teclas = { x: 0, y: 0 }
		if (p.pausa > 0 && peligro < 0.4) return
		const mx = p.meta.x - j.x, my = p.meta.y - j.y, md = Math.hypot(mx, my) || 1
		fx += (mx / md) * 0.9; fy += (my / md) * 0.9
		const f = Math.hypot(fx, fy) || 1
		p.teclas = { x: fx / f > 0.38 ? 1 : fx / f < -0.38 ? -1 : 0, y: fy / f > 0.38 ? 1 : fy / f < -0.38 ? -1 : 0 }
	}

	private actualizar(dt: number) {
		const cuadros = dt * 60
		const j = this.jugador
		this.pilotar(dt)

		// Jugador: desde Moverse, cada cambio de dirección es una transición corta con curva ease-out.
		const { x: mx, y: my } = this.piloto.teclas
		const largo = Math.hypot(mx, my) || 1
		const velocidad = this.hay(1) ? AJUSTES.velocidad : JUGADOR.velocidad
		const objetivoX = (mx / largo) * velocidad, objetivoY = (my / largo) * velocidad
		if (this.hay(1)) {
			const m = j.transicion
			if (Math.abs(m.haciaX - objetivoX) > 1e-6 || Math.abs(m.haciaY - objetivoY) > 1e-6) {
				const frenando = (!mx && !my) || objetivoX * j.vx + objetivoY * j.vy < 0
				const curva = frenando ? AJUSTES.frenar : AJUSTES.acelerar
				Object.assign(m, { desdeX: j.vx, desdeY: j.vy, haciaX: objetivoX, haciaY: objetivoY, t: 0, duracion: curva.duracion, curva: curvaBezier(curva.ease) })
				if ((frenando && !mx && !my) || Math.hypot(j.vx, j.vy) < 0.5) this.marcar(1, { sigue: true, r: 26, vida: 0.7 }, 'mover', 1.2)
			}
			m.t += dt
			const e = m.curva(Math.min(1, m.t / m.duracion))
			j.vx = sobre(m.desdeX, m.haciaX, e)
			j.vy = sobre(m.desdeY, m.haciaY, e)
		} else {
			j.vx = objetivoX
			j.vy = objetivoY
		}
		// Forma: un resorte la estira según la rapidez. Al frenar se pasa de largo y rebota.
		const rapidez = Math.hypot(j.vx, j.vy)
		if (rapidez > 0.2) j.angulo = Math.atan2(j.vy, j.vx)
		const { rigidez, amortiguacion } = resorte(AJUSTES.forma)
		j.velocidadForma += ((AJUSTES.estiramiento * Math.min(1, rapidez / AJUSTES.velocidad) - j.forma) * rigidez - j.velocidadForma * amortiguacion) * dt
		j.forma += j.velocidadForma * dt
		j.x = limitar(j.x + j.vx * cuadros, JUGADOR.r, ANCHO - JUGADOR.r)
		j.y = limitar(j.y + j.vy * cuadros, JUGADOR.r, ALTO - JUGADOR.r)
		j.invencible = Math.max(0, j.invencible - dt)
		if (rapidez > 0.3) j.rastro.push({ x: j.x, y: j.y })
		else j.rastro.shift()
		while (j.rastro.length > 9) j.rastro.shift()

		// Enemigos
		this.siguienteEnemigo -= dt
		if (this.siguienteEnemigo <= 0) {
			this.crearEnemigo()
			this.siguienteEnemigo = NIVEL.aparicion
		}
		for (const p of this.pendientes) p.espera -= dt
		this.enemigos.push(...this.pendientes.filter((p) => p.espera <= 0).map((p) => p.enemigo))
		this.pendientes = this.pendientes.filter((p) => p.espera > 0)
		for (const e of this.enemigos) {
			e.edad += dt
			this.mover(e, e.tipo.velocidad * cuadros)
			if (e.tipo.movimiento === 'rebotar' && e.antes) {
				const ejeX = Math.sign(e.dx) !== Math.sign(e.antes.dx), ejeY = Math.sign(e.dy) !== Math.sign(e.antes.dy)
				if (ejeX || ejeY) {
					e.rebote = { edad: 0, eje: ejeX ? 'x' : 'y' }
					this.marcar(4, { enemigo: e, r: e.r + 14, vida: 0.6 }, 'rebote', 1.6)
				}
			}
			e.antes = { dx: e.dx, dy: e.dy }
			if (e.rebote && (e.rebote.edad += dt) > 0.2) e.rebote = null
		}
		this.enemigos = this.enemigos.filter((e) => {
			const fuera = e.x < -100 || e.x > ANCHO + 100 || e.y < -100 || e.y > ALTO + 100
			return e.edad < DURACION_ENEMIGO && !(fuera && e.edad > 1)
		})

		// Choques y roces
		const protegido = j.invencible > 0
		for (const e of this.enemigos) {
			const desvaneciendo = e.edad > DURACION_ENEMIGO - 0.5
			const distancia = Math.hypot(e.x - j.x, e.y - j.y)
			const limite = e.r + JUGADOR.r * 0.8
			if (!protegido && !desvaneciendo && distancia < limite) {
				this.golpear(e)
				break
			}
			if (this.hay(3) && !protegido && !desvaneciendo && !e.uff) {
				if (distancia < limite + AJUSTES.roce) e.rozando = true
				else if (e.rozando) this.esquivaPorPoco(e)
			}
		}

		for (const t of this.textos) t.edad += dt
		this.textos = this.textos.filter((t) => t.edad < 1.2)
		for (const c of this.chispas) {
			c.edad += dt
			c.x += c.vx * dt
			c.y += c.vy * dt
			c.vx *= Math.exp(-dt * 5)
			c.vy *= Math.exp(-dt * 5)
		}
		this.chispas = this.chispas.filter((c) => c.edad < c.vida)
		this.tiempoNivel = (this.tiempoNivel + dt) % NIVEL.duracion
	}

	private golpear(e: Enemigo) {
		const j = this.jugador
		j.vidas -= 1
		j.invencible = INVENCIBLE_TRAS_GOLPE
		this.textos.push({ texto: `¡${e.tipo.nombre}!`, x: j.x, y: j.y - 30, edad: 0, color: '#ff8a80' })
		if (this.hay(2)) {
			this.congelado = AJUSTES.pausa
			this.sacudida = AJUSTES.temblor
			this.destello = 0.18
			this.sonar('golpe')
			for (let i = 0; i < AJUSTES.chispas; i++) {
				const angulo = Math.random() * Math.PI * 2, rapidez = azar(140, 440)
				this.chispas.push({ x: j.x, y: j.y, vx: Math.cos(angulo) * rapidez, vy: Math.sin(angulo) * rapidez, edad: 0, vida: azar(0.4, 0.7), lado: azar(2.5, 6), color: e.tipo.color })
			}
			this.corazonesRotos.push({ indice: Math.max(0, j.vidas), edad: 0 })
		}
		this.marcar(2, { sigue: true, r: 36, vida: 0.9 })
		this.marcar(2, { ...this.posCorazon(Math.max(0, j.vidas)), r: 16, vida: 1 })
		// La demo nunca termina: al perder la última vida, se rellenan.
		if (j.vidas <= 0) j.vidas = JUGADOR.vidas
	}

	private esquivaPorPoco(e: Enemigo) {
		const j = this.jugador
		e.uff = true
		this.textos.push({ texto: '¡Uff!', x: j.x, y: j.y - 30, edad: 0, color: '#ffe066' })
		this.anilloUff = 0.35
		this.camaraLenta = AJUSTES.camaraLenta
		this.sonar('uff')
		this.marcar(3, { sigue: true, r: 38, vida: 0.8 }, 'roce', 0.6)
		this.orbes.push({ x: j.x, y: j.y, edad: 0 })
	}

	// La chispa del roce llega a la barra: el nivel avanza un poco y la barra lo celebra.
	private sumarBono() {
		const desde = this.tiempoNivel / NIVEL.duracion
		this.tiempoNivel = Math.min(NIVEL.duracion - 0.001, this.tiempoNivel + AJUSTES.bono * NIVEL.duracion)
		const hasta = this.tiempoNivel / NIVEL.duracion
		this.brilloBarra = { desde, hasta, edad: 0 }
		this.pulsoBarra = 0.5
		this.sonar('bono')
		this.marcar(3, { ...this.posBarra(hasta), r: 14, vida: 0.8 }, 'barra', 0.5)
	}

	// ---------- Posiciones de la interfaz durante el morph ----------

	private posBarra(progreso: number) {
		const x = this.mezcla(0, BARRA.x), w = this.mezcla(ANCHO, BARRA.w)
		return { x: x + w * progreso, y: this.mezcla(42, BARRA.y + BARRA.h / 2) }
	}

	private corazonNuevo(indice: number) { return { x: ANCHO - 28 - (JUGADOR.vidas - 1 - indice) * 30, y: 30 } }

	// En la interfaz original los corazones son el texto "♥ ♥ ♥" alineado a la derecha.
	private corazonViejo(indice: number, vidas: number) {
		this.ctx.font = 'bold 18px system-ui, sans-serif'
		const separacion = this.ctx.measureText('♥ ').width, ancho = this.ctx.measureText('♥').width
		return { x: ANCHO - 14 - (vidas - 1 - indice) * separacion - ancho / 2, y: 20 }
	}

	// El corazón que se pierde es el último de la fila.
	private posCorazon(indice: number) {
		const viejo = this.corazonViejo(indice, indice + 1), nuevo = this.corazonNuevo(indice)
		return { x: this.mezcla(viejo.x, nuevo.x), y: this.mezcla(viejo.y, nuevo.y) }
	}

	private cajaNivel(): Caja {
		return [this.mezcla(4, BARRA.x - 10), this.mezcla(4, 8), this.mezcla(ANCHO - 8, BARRA.w + 20), this.mezcla(44, BARRA.y + BARRA.h + 2)]
	}

	private cajaCorazones(): Caja {
		const vidas = Math.max(1, this.jugador.vidas)
		const viejoIzq = this.corazonViejo(0, vidas), viejoDer = this.corazonViejo(vidas - 1, vidas)
		const nuevoIzq = this.corazonNuevo(0), nuevoDer = this.corazonNuevo(JUGADOR.vidas - 1)
		const izq = this.mezcla(viejoIzq.x - 14, nuevoIzq.x - 20), der = this.mezcla(viejoDer.x + 14, nuevoDer.x + 20)
		return [izq, this.mezcla(6, 10), der - izq, this.mezcla(30, 40)]
	}

	// ---------- Dibujo ----------

	private forma(forma: TipoEnemigo['forma'], x: number, y: number, r: number, angulo: number) {
		const { ctx } = this
		ctx.save()
		ctx.translate(x, y)
		ctx.rotate(angulo)
		ctx.beginPath()
		if (forma === 'cuadrado') ctx.rect(-r, -r, r * 2, r * 2)
		else if (forma === 'circulo') ctx.arc(0, 0, r, 0, Math.PI * 2)
		else for (let i = 0; i < 3; i++) ctx.lineTo(Math.cos((i * Math.PI * 2) / 3) * r * 1.2, Math.sin((i * Math.PI * 2) / 3) * r * 1.2)
		ctx.closePath()
		ctx.fill()
		ctx.restore()
	}

	private trazarCorazon(x: number, y: number, s: number) {
		const { ctx } = this
		ctx.beginPath()
		ctx.moveTo(x, y + s * 0.42)
		ctx.bezierCurveTo(x - s * 0.78, y - s * 0.05, x - s * 0.46, y - s * 0.62, x, y - s * 0.22)
		ctx.bezierCurveTo(x + s * 0.46, y - s * 0.62, x + s * 0.78, y - s * 0.05, x, y + s * 0.42)
		ctx.closePath()
	}

	private dibujar() {
		const { ctx, jugador: j } = this
		const g = this.morfos.graficos.valor
		ctx.fillStyle = NIVEL.fondo
		ctx.fillRect(0, 0, ANCHO, ALTO)
		ctx.save()
		if (this.hay(2) && this.sacudida > 0) {
			const fuerza = AJUSTES.sacudida * (this.sacudida / AJUSTES.temblor)
			ctx.translate(azar(-fuerza, fuerza), azar(-fuerza, fuerza))
		}

		// Avisos de entrada
		for (const p of this.pendientes) {
			const { x, y } = this.posAviso(p.enemigo)
			ctx.globalAlpha = 0.9
			ctx.fillStyle = p.enemigo.tipo.color
			ctx.beginPath()
			ctx.arc(x, y, 13 * (1 + Math.sin(p.espera * 30) * 0.18), 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = '#1a1a2e'
			ctx.font = 'bold 18px system-ui, sans-serif'
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.fillText('!', x, y + 1)
			ctx.textBaseline = 'alphabetic'
			ctx.globalAlpha = 1
		}

		// Enemigos. Con Gráficos, la roca deja estela, la pelota se aplasta al rebotar y todos tienen sombra.
		for (const e of this.enemigos) {
			const alfa = Math.min(1, (DURACION_ENEMIGO - e.edad) / 0.5)
			const angulo = Math.atan2(e.dy, e.dx)
			ctx.fillStyle = e.tipo.color
			if (g > 0 && e.tipo.movimiento === 'recto') {
				for (let k = 3; k >= 1; k--) {
					ctx.globalAlpha = alfa * g * 0.16 * (4 - k) / 3
					this.forma(e.tipo.forma, e.x - e.dx * k * e.tipo.velocidad * 3.5, e.y - e.dy * k * e.tipo.velocidad * 3.5, e.r * (1 - k * 0.08), angulo)
				}
			}
			ctx.globalAlpha = alfa
			ctx.save()
			if (g > 0) {
				ctx.shadowColor = `rgba(0, 0, 0, ${0.45 * g})`
				ctx.shadowBlur = 10
				ctx.shadowOffsetY = 4
			}
			if (e.rebote && g > 0) {
				const k = Math.sin((e.rebote.edad / 0.2) * Math.PI) * 0.35 * g
				ctx.translate(e.x, e.y)
				ctx.scale(e.rebote.eje === 'x' ? 1 - k : 1 + k, e.rebote.eje === 'x' ? 1 + k : 1 - k)
				this.forma(e.tipo.forma, 0, 0, e.r, angulo)
			} else {
				this.forma(e.tipo.forma, e.x, e.y, e.r, angulo)
			}
			ctx.restore()
		}
		ctx.globalAlpha = 1

		// Jugador
		if (this.hay(1)) {
			j.rastro.forEach((punto, i) => {
				const f = (i + 1) / (j.rastro.length + 1)
				ctx.globalAlpha = 0.28 * f
				ctx.fillStyle = JUGADOR.color
				ctx.beginPath()
				ctx.arc(punto.x, punto.y, JUGADOR.r * (0.35 + 0.55 * f), 0, Math.PI * 2)
				ctx.fill()
			})
			ctx.globalAlpha = 1
		}
		if (!(j.invencible > 0 && Math.floor(j.invencible * 10) % 2 === 0)) {
			ctx.save()
			if (g > 0) {
				ctx.shadowColor = `rgba(0, 0, 0, ${0.45 * g})`
				ctx.shadowBlur = 10
				ctx.shadowOffsetY = 4
			}
			ctx.fillStyle = this.hay(2) && this.destello > 0 ? '#ffffff' : JUGADOR.color
			const f = this.hay(1) ? j.forma : 0
			ctx.translate(j.x, j.y)
			ctx.rotate(j.angulo)
			ctx.beginPath()
			ctx.ellipse(0, 0, JUGADOR.r * (1 + f), JUGADOR.r * (1 - f * 0.6), 0, 0, Math.PI * 2)
			ctx.fill()
			ctx.restore()
		}
		if (this.anilloUff > 0) {
			const p = this.anilloUff / 0.35
			ctx.globalAlpha = p
			ctx.strokeStyle = '#ffe066'
			ctx.lineWidth = 4
			ctx.beginPath()
			ctx.arc(j.x, j.y, JUGADOR.r + 6 + (1 - p) * 34, 0, Math.PI * 2)
			ctx.stroke()
			ctx.globalAlpha = 1
		}
		for (const c of this.chispas) {
			ctx.globalAlpha = 1 - c.edad / c.vida
			ctx.fillStyle = c.color
			ctx.fillRect(c.x - c.lado / 2, c.y - c.lado / 2, c.lado, c.lado)
		}
		ctx.globalAlpha = 1

		if (g > 0) {
			const vineta = ctx.createRadialGradient(ANCHO / 2, ALTO / 2, ALTO * 0.35, ANCHO / 2, ALTO / 2, ALTO * 0.85)
			vineta.addColorStop(0, 'rgba(0, 0, 0, 0)')
			vineta.addColorStop(1, `rgba(0, 0, 0, ${0.38 * g})`)
			ctx.fillStyle = vineta
			ctx.fillRect(-20, -20, ANCHO + 40, ALTO + 40)
		}

		// En Quitar, los textos se desvanecen en vez de desaparecer de golpe.
		const quitar = this.morfos.quitar.valor
		if (quitar < 1) {
			for (const t of this.textos) {
				ctx.globalAlpha = (1 - t.edad / 1.2) * (1 - quitar)
				ctx.fillStyle = t.color
				ctx.font = '800 18px system-ui, sans-serif'
				ctx.textAlign = 'center'
				if (g > 0) {
					ctx.lineJoin = 'round'
					ctx.lineWidth = 4
					ctx.strokeStyle = `rgba(10, 8, 20, ${0.7 * g})`
					ctx.strokeText(t.texto, t.x, t.y - t.edad * 30)
				}
				ctx.fillText(t.texto, t.x, t.y - t.edad * 30)
			}
			ctx.globalAlpha = 1
		}
		ctx.restore()

		if (this.hay(2) && this.destello > 0) {
			ctx.fillStyle = `rgba(255, 70, 70, ${AJUSTES.destello * (this.destello / 0.18)})`
			ctx.fillRect(0, 0, ANCHO, ALTO)
		}

		const progreso = this.tiempoNivel / NIVEL.duracion
		this.interfaz(progreso)

		// Chispas del roce camino a la barra.
		for (const o of this.orbes) {
			const fin = this.posBarra(progreso)
			for (let k = 3; k >= 0; k--) {
				const e = Math.max(0, o.edad / VIAJE_ORBE - k * 0.06) ** 2
				const cx = o.x + (fin.x - o.x) * 0.2, cy = Math.max(70, Math.min(o.y, fin.y) - 120)
				ctx.save()
				ctx.globalAlpha = k === 0 ? 1 : 0.35 / k
				ctx.shadowColor = '#ffe066'
				ctx.shadowBlur = 12
				ctx.fillStyle = '#fff3bf'
				ctx.beginPath()
				ctx.arc((1 - e) ** 2 * o.x + 2 * (1 - e) * e * cx + e * e * fin.x, (1 - e) ** 2 * o.y + 2 * (1 - e) * e * cy + e * e * fin.y, 4.5 - k * 0.8, 0, Math.PI * 2)
				ctx.fill()
				ctx.restore()
			}
		}

		for (const m of this.marcas) {
			const p = m.edad / m.vida
			const alfa = Math.min(1, p / 0.15) * Math.min(1, (1 - p) / 0.4)
			const escala = 0.82 + 0.18 * easeSalida(Math.min(1, p / 0.3))
			ctx.strokeStyle = `rgba(239, 68, 68, ${0.6 * alfa})`
			ctx.fillStyle = `rgba(239, 68, 68, ${0.12 * alfa})`
			ctx.lineWidth = 1.5
			ctx.beginPath()
			if (m.caja) {
				const [x, y, w, h] = m.caja()
				const d = (1 - escala) * 20
				ctx.roundRect(x + d, y + d, w - 2 * d, h - 2 * d, 10)
			} else {
				const x = m.sigue ? j.x : m.enemigo ? m.enemigo.x : m.x ?? 0
				const y = m.sigue ? j.y : m.enemigo ? m.enemigo.y : m.y ?? 0
				ctx.arc(x, y, m.r * escala, 0, Math.PI * 2)
			}
			ctx.fill()
			ctx.stroke()
		}
	}

	// Barra de progreso con el pulso y el brillo del bono. `redondez` va de la barra plana (0) al riel (1).
	private barra(x: number, y: number, w: number, h: number, progreso: number, redondez: number) {
		const { ctx } = this
		const pulso = this.pulsoBarra > 0 ? Math.sin((1 - this.pulsoBarra / 0.5) * Math.PI) : 0
		const alto = h * (1 + 0.9 * pulso)
		const arriba = y + h / 2 - alto / 2
		const rect = (rx: number, rw: number, color: string) => {
			const ancho = Math.max(0, rw)
			ctx.fillStyle = color
			ctx.beginPath()
			ctx.roundRect(rx, arriba, ancho, alto, Math.min((alto / 2) * redondez, ancho / 2))
			ctx.fill()
		}
		if (redondez > 0) rect(x, w, `rgba(255, 255, 255, ${0.14 * redondez})`)
		rect(x, Math.max(alto * redondez, w * progreso), '#ffca28')
		if (this.brilloBarra) {
			const a = Math.max(0, 1 - this.brilloBarra.edad / 0.7)
			ctx.save()
			ctx.shadowColor = '#ffe066'
			ctx.shadowBlur = 18 * a
			rect(x + w * this.brilloBarra.desde, w * (this.brilloBarra.hasta - this.brilloBarra.desde), `rgba(255, 255, 255, ${0.95 * a})`)
			ctx.restore()
		}
	}

	// La interfaz original y la de Gráficos son la misma, mezclada según el morph: la franja se desvanece,
	// "Nivel 3 · Caos" se separa, la barra se vuelve riel y cada corazón viaja a su lugar nuevo.
	private interfaz(progreso: number) {
		const { ctx } = this
		const g = this.morfos.graficos.valor
		if (g < 1) {
			ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * (1 - g)})`
			ctx.fillRect(0, 0, ANCHO, 40)
		}

		ctx.font = 'bold 18px system-ui, sans-serif'
		const anchoNumero = ctx.measureText(`Nivel ${NIVEL.numero}`).width
		const anchoPrefijo = ctx.measureText(`Nivel ${NIVEL.numero} · `).width
		// Primero la etiqueta se encoge y el nombre baja; después el nombre se desliza a su lugar.
		const encoge = tramo(g, 0, 0.6), desliza = tramo(g, 0.35, 1)
		ctx.save()
		ctx.textAlign = 'left'
		ctx.shadowColor = `rgba(0, 0, 0, ${0.5 * g})`
		ctx.shadowBlur = 8 * g
		ctx.shadowOffsetY = g
		ctx.fillStyle = `rgba(255, 255, 255, ${sobre(1, 0.6, encoge)})`
		ctx.font = `700 ${sobre(18, 11, encoge)}px system-ui, sans-serif`
		ctx.letterSpacing = `${2 * encoge}px`
		ctx.fillText(encoge < 0.5 ? `Nivel ${NIVEL.numero}` : `NIVEL ${NIVEL.numero}`, sobre(14, BARRA.x, encoge), sobre(26, 24, encoge))
		ctx.letterSpacing = '0px'
		if (g < 0.3) {
			ctx.font = 'bold 18px system-ui, sans-serif'
			ctx.fillStyle = `rgba(255, 255, 255, ${1 - tramo(g, 0, 0.3)})`
			ctx.fillText(' · ', 14 + anchoNumero, 26)
		}
		ctx.fillStyle = '#ffffff'
		ctx.font = `700 ${sobre(18, 21, encoge)}px system-ui, sans-serif`
		ctx.fillText(NIVEL.nombre, sobre(14 + anchoPrefijo, BARRA.x, desliza), sobre(26, 45, encoge))
		ctx.restore()

		this.barra(this.mezcla(0, BARRA.x), this.mezcla(40, BARRA.y), this.mezcla(ANCHO, BARRA.w), this.mezcla(4, BARRA.h), progreso, g)

		// Cada corazón viaja de su lugar en el texto a su lugar nuevo y pasa de carácter a dibujo.
		const vidas = Math.max(0, this.jugador.vidas)
		for (let i = 0; i < Math.max(JUGADOR.vidas, vidas); i++) {
			const nuevo = this.corazonNuevo(i)
			if (i < vidas) {
				const viejo = this.corazonViejo(i, vidas)
				const x = this.mezcla(viejo.x, nuevo.x), y = this.mezcla(viejo.y, nuevo.y)
				if (g < 1) {
					ctx.globalAlpha = 1 - g
					ctx.fillStyle = '#ec407a'
					ctx.font = 'bold 18px system-ui, sans-serif'
					ctx.textAlign = 'center'
					ctx.fillText('♥', x, y + 6)
				}
				if (g > 0) {
					ctx.save()
					ctx.globalAlpha = g
					ctx.shadowColor = 'rgba(236, 64, 122, 0.55)'
					ctx.shadowBlur = 10
					this.trazarCorazon(x, y, this.mezcla(14, 22))
					ctx.fillStyle = '#ec407a'
					ctx.fill()
					ctx.restore()
				}
				ctx.globalAlpha = 1
			} else if (g > 0) {
				ctx.globalAlpha = g
				this.trazarCorazon(nuevo.x, nuevo.y, 22)
				ctx.lineWidth = 2
				ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
				ctx.stroke()
				ctx.globalAlpha = 1
			}
		}

		// Corazón roto: dos mitades que se separan y caen.
		for (const c of this.corazonesRotos) {
			const p = c.edad / 0.9
			const { x, y } = this.posCorazon(c.indice)
			for (const lado of [-1, 1]) {
				ctx.save()
				ctx.globalAlpha = Math.max(0, 1 - p)
				ctx.translate(x + lado * (4 + p * 26), y + p * p * 120)
				ctx.rotate(lado * p * 0.9)
				ctx.beginPath()
				ctx.rect(lado < 0 ? -16 : 0, -20, 16, 34)
				ctx.clip()
				ctx.fillStyle = '#ec407a'
				if (g < 0.5) {
					ctx.font = 'bold 22px system-ui, sans-serif'
					ctx.textAlign = 'center'
					ctx.fillText('♥', 0, 7)
				} else {
					this.trazarCorazon(0, 0, 22)
					ctx.fill()
				}
				ctx.restore()
			}
		}
	}
}
