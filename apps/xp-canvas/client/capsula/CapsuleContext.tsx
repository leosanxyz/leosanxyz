import { createContext, useContext } from 'react'
import type { CapsuleBet, CapsuleShape } from '../../shared/capsuleShape'

export const CapsuleContext = createContext<{
	isTeacher: boolean
	/** Solo con el portal y la conexión activa se puede apostar, sortear o resolver. */
	enabled: boolean
	/** Las apuestas de este alumno, por cápsula. Solo existen en su pantalla. */
	mine: Record<string, CapsuleBet>
	bet: (shape: CapsuleShape) => void
	draw: (shape: CapsuleShape) => Promise<void>
	bonus: (shape: CapsuleShape, betId: string) => Promise<void>
	resolve: (shape: CapsuleShape, winner: number) => Promise<void>
	list: (shape: CapsuleShape) => void
	edit: (shape: CapsuleShape) => void
}>({ isTeacher: false, enabled: false, mine: {}, bet: () => {}, draw: async () => {}, bonus: async () => {}, resolve: async () => {}, list: () => {}, edit: () => {} })
export const useCapsule = () => useContext(CapsuleContext)

const sameWeek = 6 * 24 * 60 * 60 * 1000
/** «jueves, 10:00» si cae esta semana; con fecha si está más lejos. */
export function formatOpensAt(at: number, now = Date.now()) {
	const date = new Date(at)
	const options: Intl.DateTimeFormatOptions = at - now < sameWeek ? { weekday: 'long', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
	return new Intl.DateTimeFormat('es-MX', options).format(date)
}
