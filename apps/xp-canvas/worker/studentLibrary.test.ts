import { describe, expect, it } from 'vitest'
import type { Board, BoardLibrary } from '../shared/boards'
import { studentLibrary } from './studentLibrary'

const board = (id: string, folderId: string | null, trashedAt: number | null = null): Board => ({ id, name: id, folderId, favorite: true, createdAt: 1, updatedAt: 1, thumbnailAt: null, trashedAt })
const library: BoardLibrary = {
	boards: [board('shared', 'class'), board('private-sibling', 'class'), board('private', 'private'), board('trashed', 'trash-only', 2), board('root', null)],
	folders: [{ id: 'term', name: 'Semestre', parentId: null }, { id: 'class', name: 'Clase', parentId: 'term' }, { id: 'private', name: 'Privado', parentId: 'term' }, { id: 'trash-only', name: 'Archivo', parentId: null }],
}

describe('student library folders', () => {
	it('includes ancestors without granting sibling canvases or disclosing unrelated folders', () => {
		const result = studentLibrary(library, new Set(['shared']))
		expect(result.boards.map((item) => item.id)).toEqual(['shared'])
		expect(result.boards[0]).toMatchObject({ folderId: 'class', favorite: false })
		expect(result.folders.map((item) => item.id)).toEqual(['term', 'class'])
		expect(library.boards[0].favorite).toBe(true)
	})
	it('removes all paths when access is revoked and omits folders containing only trashed boards', () => {
		expect(studentLibrary(library, new Set())).toEqual({ boards: [], folders: [] })
		expect(studentLibrary(library, new Set(['trashed']))).toEqual({ boards: [], folders: [] })
	})
	it('keeps unfiled canvases accessible without exposing any folders', () => {
		const result = studentLibrary(library, new Set(['root']))
		expect(result.boards[0].folderId).toBeNull()
		expect(result.folders).toEqual([])
	})
})
