import { createTLSchema, defaultShapeSchemas, type TLRecord } from '@tldraw/tlschema'
import type { RoomSnapshot } from '@tldraw/sync-core'
import { questionShapeProps, questionShapeMigrations } from '../shared/questionShape'
import { gachaponShapeProps, gachaponShapeMigrations } from '../shared/gachaponShape'
import { resourceShapeProps } from '../shared/resourceShape'

export const canvasSchema = createTLSchema({
	shapes: { ...defaultShapeSchemas, gachapon: { props: gachaponShapeProps, migrations: gachaponShapeMigrations }, resource: { props: resourceShapeProps }, question: { props: questionShapeProps, migrations: questionShapeMigrations } },
})

/** Imports contain document records, never another user's camera or session state. */
export function validateBoardSnapshot(value: unknown): RoomSnapshot {
	if (!value || typeof value !== 'object') throw new Error('Copia inválida.')
	const snapshot = value as RoomSnapshot
	if (!snapshot.schema || !Array.isArray(snapshot.documents) || snapshot.documents.length > 25_000) throw new Error('Copia inválida.')
	const store: Record<string, TLRecord> = Object.create(null)
	for (const document of snapshot.documents) {
		const record = document?.state as TLRecord
		if (!record || typeof record.id !== 'string' || store[record.id]) throw new Error('Registros inválidos o duplicados.')
		store[record.id] = record
	}
	const migrated = canvasSchema.migrateStoreSnapshot({ store, schema: snapshot.schema })
	if (migrated.type !== 'success') throw new Error('Esta copia utiliza una versión incompatible del canvas.')
	let pages = 0
	for (const record of Object.values(migrated.value)) {
		const type = canvasSchema.types[record.typeName]
		if (!type || type.scope !== 'document') throw new Error('La copia contiene datos que no son del documento.')
		type.validate(record)
		if (record.typeName === 'page') pages++
	}
	if (!pages) throw new Error('La copia no contiene ninguna página.')
	return {
		clock: 0, documentClock: 0, tombstones: {}, schema: canvasSchema.serialize(),
		documents: Object.values(migrated.value).map((state) => ({ state, lastChangedClock: 0 })),
	}
}
