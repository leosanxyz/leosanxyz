import { describe, expect, it } from 'vitest'
import { PageRecordType, type TLPage } from '@tldraw/tlschema'
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
