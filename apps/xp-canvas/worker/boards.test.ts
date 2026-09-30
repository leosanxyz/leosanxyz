import { describe, expect, it } from 'vitest'
import { folderDescendants } from '../shared/boards'
import { patchAffectsAccess } from './boards'

describe('folder nesting', () => {
	it('includes nested folders, but not siblings', () => {
		const folders = [
			{ id: 'a', name: 'A', parentId: null },
			{ id: 'b', name: 'B', parentId: 'a' },
			{ id: 'c', name: 'C', parentId: 'b' },
			{ id: 'd', name: 'D', parentId: null },
		]
		expect([...folderDescendants(folders, 'a')]).toEqual(['a', 'b', 'c'])
	})
	it('terminates even if old data contains a cycle', () => {
		expect([...folderDescendants([{ id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' }], 'a')]).toEqual(['a', 'b'])
	})
})

describe('board patches', () => {
	it('revalidates sockets only when access can change', () => {
		expect(patchAffectsAccess('{"touch":true}')).toBe(false)
		expect(patchAffectsAccess('{"name":"Clase"}')).toBe(false)
		expect(patchAffectsAccess('{"trashed":true}')).toBe(true)
		expect(patchAffectsAccess('no json')).toBe(true)
	})
})
