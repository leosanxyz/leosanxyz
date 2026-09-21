import { describe, expect, it } from 'vitest'
import { PageRecordType, type TLPage, type TLRecord } from '@tldraw/tlschema'
import { canvasSchema, validateBoardSnapshot } from './boardSnapshot'

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
