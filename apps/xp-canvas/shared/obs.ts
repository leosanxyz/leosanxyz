// What the OBS dock reports and what every canvas client receives. The protocol is shared with the dock (in OBS, on Leo's Mac).
export interface ObsSonando { titulo: string; artista: string; portada?: string }
export interface ObsEstado { capitulo: number; titulos: string[]; visible: boolean; sonando: ObsSonando | null }
export type ObsVista = ({ obs: true } & ObsEstado) | { obs: false }

export const OBS_SIN_ESTADO: ObsEstado = { capitulo: 0, titulos: [], visible: false, sonando: null }
const MAX_CAPITULOS = 99

/** A section block's title starts with its number and a middle dot: «1 · haz el primer paso de tu plan». */
export function sectionNumber(text: string | undefined): number | null {
	const match = /^\s*(\d{1,2})\s*·/.exec(text ?? '')
	const number = match ? Number(match[1]) : 0
	return number >= 1 ? number : null
}

export function validCapitulo(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_CAPITULOS
}

function text(value: unknown, max: number) {
	return typeof value === 'string' ? value.slice(0, max) : ''
}

/** Keeps only the fields the canvas shows, so a buggy dock can't push arbitrary data to every student. */
export function readEstado(data: unknown): ObsEstado | null {
	if (!data || typeof data !== 'object') return null
	const value = data as Record<string, unknown>
	if (value.tipo !== 'estado' || !Number.isInteger(value.capitulo) || (value.capitulo as number) < 0 || (value.capitulo as number) > MAX_CAPITULOS) return null
	const titulos = Array.isArray(value.titulos) ? value.titulos.slice(0, MAX_CAPITULOS).map((titulo) => text(titulo, 120)) : []
	let sonando: ObsSonando | null = null
	if (value.sonando && typeof value.sonando === 'object') {
		const song = value.sonando as Record<string, unknown>
		const titulo = text(song.titulo, 200).trim(), artista = text(song.artista, 200).trim()
		const portada = typeof song.portada === 'string' && song.portada.length <= 2000 && /^https:\/\/[^\s"'()<>\\]+$/.test(song.portada) ? song.portada : undefined
		if (titulo) sonando = { titulo, artista, ...(portada ? { portada } : {}) }
	}
	return { capitulo: value.capitulo as number, titulos, visible: value.visible === true, sonando }
}
