import { T } from '@tldraw/validate'
import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tlschema'
import type { TLShape } from '@tldraw/tlschema'

const text = (max: number) => T.string.refine((value) => {
	if (!value.trim() || value.length > max) throw new Error('Texto de pregunta inválido.')
	return value
})
export const answerIndex = T.integer.refine((value) => {
	if (value < 0 || value > 3) throw new Error('Respuesta inválida.')
	return value
})
export const questionPoints = T.integer.refine((value) => {
	if (value < 0 || value > 1_000_000) throw new Error('Usa entre 0 y 1 000 000 puntos enteros.')
	return value
})
const versions = createShapePropsMigrationIds('question', { AddPoints: 1 })
export const questionShapeMigrations = createShapePropsMigrationSequence({ sequence: [{
	id: versions.AddPoints,
	up: (props) => { props.points = 100 },
	down: 'retired',
}] })
export const questionShapeProps = {
	points: questionPoints,
	w: T.positiveNumber, h: T.positiveNumber,
	question: text(300),
	answers: T.arrayOf(text(160)).refine((value) => {
		if (value.length !== 4) throw new Error('Se requieren cuatro respuestas.')
		return value
	}),
	correct: answerIndex,
	answered: T.arrayOf(answerIndex),
	revision: text(100),
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		question: { w: number; h: number; question: string; answers: string[]; points: number; correct: number; answered: number[]; revision: string }
	}
}
export type QuestionShape = TLShape<'question'>
export type QuestionFeedback = { type: 'question-result'; id: string; shapeId: string; revision: string; answer: number; correct: boolean; points?: number }
export type InteractionState = { type: 'question-permissions'; allowedUserIds: string[] }
export type QuestionCommand =
	| { action: 'draw' }
	| { action: 'permission'; userId: string; allowed: boolean }
	| { action: 'answer'; shapeId: string; revision: string; answer: number }

export function parseQuestionCommand(value: unknown): QuestionCommand {
	if (!value || typeof value !== 'object') throw new Error('Solicitud inválida.')
	const data = value as Record<string, unknown>
	if (data.action === 'draw') return { action: 'draw' }
	if (data.action === 'permission' && typeof data.userId === 'string' && data.userId.length <= 100 && typeof data.allowed === 'boolean') {
		return { action: 'permission', userId: data.userId, allowed: data.allowed }
	}
	if (data.action === 'answer' && typeof data.shapeId === 'string' && data.shapeId.startsWith('shape:') && data.shapeId.length <= 100 && typeof data.revision === 'string' && data.revision.length <= 100) {
		return { action: 'answer', shapeId: data.shapeId, revision: data.revision, answer: answerIndex.validate(data.answer) }
	}
	throw new Error('Solicitud inválida.')
}
