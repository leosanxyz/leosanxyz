import { describe, expect, it } from 'vitest'
import { PageRecordType, type TLPage, type TLRecord } from '@tldraw/tlschema'
import { canvasSchema, emptyMailboxes, validateBoardSnapshot } from './boardSnapshot'
import { parseQuestionCommand } from '../shared/questionShape'

const page = PageRecordType.create({ id: PageRecordType.createId('transfer-test'), name: 'Clase', index: 'a1' as TLPage['index'] })
const snapshot = { schema: canvasSchema.serialize(), documents: [{ state: page, lastChangedClock: 90 }], clock: 90 }

describe('canvas imports', () => {
	it('preserves document records while starting an independent sync history', () => {
		const copy = validateBoardSnapshot(snapshot)
		expect(copy.documents).toEqual([{ state: page, lastChangedClock: 0 }])
		expect(copy.clock).toBe(0)
		expect(copy.tombstones).toEqual({})
	})
	it('rejects malformed records, duplicate ids, missing pages and session data', () => {
		for (const value of [null, {}, { ...snapshot, documents: [] }, { ...snapshot, documents: [...snapshot.documents, ...snapshot.documents] }, { ...snapshot, documents: [{ state: { ...page, name: 4 } }] }, { ...snapshot, documents: [{ state: { id: 'camera:private', typeName: 'camera', x: 0, y: 0, z: 1, meta: {} } }] }]) expect(() => validateBoardSnapshot(value)).toThrow()
	})
	it('accepts the Esquiva demo and rejects versions that do not exist', () => {
		const demo = canvasSchema.types.shape.create({ id: 'shape:esquiva' as never, type: 'esquiva', parentId: page.id, index: 'a1' as never, x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {}, props: { w: 1060, h: 600, paso: 0, antes: false } })
		const copia = (paso: number) => validateBoardSnapshot({ ...snapshot, documents: [...snapshot.documents, { state: { ...demo, props: { w: 1060, h: 600, paso, antes: false } }, lastChangedClock: 1 }] })
		expect(copia(5).documents).toHaveLength(2)
		for (const paso of [-1, 6, 2.5]) expect(() => copia(paso)).toThrow()
	})
	it('copies a mailbox closed and empty, and rejects impossible counts', () => {
		const props = { w: 440, h: 560, prompt: '¿Qué notaste?', open: true, round: 3, count: 12, drawn: 4, letter: 'La sombra del pez', letterId: 'carta-1' }
		const mailbox = canvasSchema.types.shape.create({ id: 'shape:buzon' as never, type: 'mailbox', parentId: page.id, index: 'a1' as never, x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {}, props })
		const copy = emptyMailboxes(validateBoardSnapshot({ ...snapshot, documents: [...snapshot.documents, { state: mailbox, lastChangedClock: 1 }] }))
		const copied = copy.documents.find((record) => record.state.id === mailbox.id)?.state as TLRecord | undefined
		expect(copied?.typeName === 'shape' && copied.type === 'mailbox' && copied.props).toMatchObject({ prompt: '¿Qué notaste?', open: false, round: 1, count: 0, drawn: 0, letter: '', letterId: '' })
		for (const wrong of [{ count: -1 }, { round: 0 }, { prompt: '  ' }, { letter: 'x'.repeat(561) }]) {
			expect(() => validateBoardSnapshot({ ...snapshot, documents: [...snapshot.documents, { state: { ...mailbox, props: { ...props, ...wrong } }, lastChangedClock: 1 }] })).toThrow()
		}
	})
	it('accepts letters of up to 280 characters, counting an emoji as one', () => {
		const letter = (text: unknown) => parseQuestionCommand({ action: 'letter', shapeId: 'shape:buzon', round: 1, text })
		expect(letter('  Hola\r\n\n\n\nmundo  ')).toEqual({ action: 'letter', shapeId: 'shape:buzon', round: 1, text: 'Hola\n\nmundo', anonymous: false })
		expect(letter('🐟'.repeat(280))).toMatchObject({ text: '🐟'.repeat(280) })
		expect(parseQuestionCommand({ action: 'letter', shapeId: 'shape:buzon', round: 1, text: 'sin firma', anonymous: true })).toMatchObject({ anonymous: true })
		for (const text of ['', '   ', 'x'.repeat(281), 42]) expect(() => letter(text)).toThrow()
		expect(() => parseQuestionCommand({ action: 'letter', shapeId: 'buzon', round: 1, text: 'hola' })).toThrow()
		expect(parseQuestionCommand({ action: 'mailbox-draw', shapeId: 'shape:buzon' })).toEqual({ action: 'mailbox-draw', shapeId: 'shape:buzon' })
	})
})

it('migrates existing questions to 100 points without changing their answers', async () => {
	const { createTLSchema, defaultShapeSchemas } = await import('@tldraw/tlschema')
	const { questionShapeProps } = await import('../shared/questionShape')
	const { points: _points, ...oldProps } = questionShapeProps
	const previous = createTLSchema({ shapes: { ...defaultShapeSchemas, question: { props: oldProps } } })
	const oldQuestion = previous.types.shape.create({ id: 'shape:old-question' as never, type: 'question', parentId: page.id, index: 'a1' as never, x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {}, props: { w: 480, h: 400, question: 'Anterior', answers: ['A', 'B', 'C', 'D'], correct: 0, answered: [1], revision: 'original' } as never })
	const migrated = validateBoardSnapshot({ ...snapshot, schema: previous.serialize(), documents: [...snapshot.documents, { state: oldQuestion, lastChangedClock: 0 }] })
	const question = migrated.documents.find((record) => record.state.id === oldQuestion.id)?.state as TLRecord | undefined
	expect(question?.typeName === 'shape' && question.type === 'question' && question.props).toMatchObject({ points: 100, answered: [1], revision: 'original' })
	for (const points of [-1, .5, 1000001, Infinity, NaN]) expect(() => questionShapeProps.points.validate(points)).toThrow()
})
