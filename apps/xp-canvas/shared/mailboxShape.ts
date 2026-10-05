import { T } from '@tldraw/validate'
import type { TLShape } from '@tldraw/tlschema'

export const LETTER_MAX = 280
export const LETTERS_PER_STUDENT = 5
export const LETTERS_PER_ROUND = 300

const limited = (max: number, message: string) => T.string.refine((value) => {
	if (value.length > max) throw new Error(message)
	return value
})
const counter = T.integer.refine((value) => {
	if (value < 0 || value > LETTERS_PER_ROUND) throw new Error('Conteo inválido.')
	return value
})

/** Buzón: el maestro lo abre por rondas y saca cartas al azar. Las cartas viven en el servidor; aquí solo la que se leyó. */
export const mailboxShapeProps = {
	w: T.positiveNumber, h: T.positiveNumber,
	prompt: T.string.refine((value) => {
		if (!value.trim() || value.length > 200) throw new Error('Escribe la pregunta del buzón.')
		return value
	}),
	open: T.boolean,
	round: T.integer.refine((value) => {
		if (value < 1 || value > 99) throw new Error('Ronda inválida.')
		return value
	}),
	count: counter,
	drawn: counter,
	letter: limited(LETTER_MAX * 2, 'Carta demasiado larga.'),
	letterId: limited(100, 'Identificador inválido.'),
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		mailbox: { w: number; h: number; prompt: string; open: boolean; round: number; count: number; drawn: number; letter: string; letterId: string }
	}
}
export type MailboxShape = TLShape<'mailbox'>

export type MailboxCommand =
	| { action: 'letter'; shapeId: string; round: number; text: string; anonymous: boolean }
	| { action: 'mailbox-draw'; shapeId: string }
export type MailboxReply =
	| { type: 'mailbox-letter'; id: string }
	/** `name` llega vacío cuando la carta se mandó sin nombre. */
	| { type: 'mailbox-draw'; id: string; text: string; name: string }

/** Cuenta caracteres como los ve una persona: un emoji vale uno. */
export const letterLength = (text: string) => [...text].length

export function cleanLetter(value: unknown) {
	if (typeof value !== 'string') return null
	const text = value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
	return text && letterLength(text) <= LETTER_MAX ? text : null
}

export function parseMailboxCommand(data: Record<string, unknown>): MailboxCommand | null {
	const shapeId = typeof data.shapeId === 'string' && data.shapeId.startsWith('shape:') && data.shapeId.length <= 100 ? data.shapeId : null
	if (!shapeId) return null
	if (data.action === 'mailbox-draw') return { action: 'mailbox-draw', shapeId }
	if (data.action !== 'letter' || !Number.isInteger(data.round)) return null
	const text = cleanLetter(data.text)
	return text ? { action: 'letter', shapeId, round: data.round as number, text, anonymous: data.anonymous === true } : null
}
