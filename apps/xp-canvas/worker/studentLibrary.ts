import type { BoardLibrary } from '../shared/boards'

/** Keep only granted canvases and the folder paths needed to reach them. */
export function studentLibrary(library: BoardLibrary, allowed: ReadonlySet<string>): BoardLibrary {
	const foldersById = new Map(library.folders.map((folder) => [folder.id, folder]))
	const boards = library.boards.filter((board) => !board.trashedAt && allowed.has(board.id))
	const visibleFolders = new Set<string>()
	for (const board of boards) {
		let id = board.folderId
		while (id && !visibleFolders.has(id)) {
			const folder = foldersById.get(id)
			if (!folder) break
			visibleFolders.add(id)
			id = folder.parentId
		}
	}
	return {
		boards: boards.map((board) => ({ ...board, folderId: board.folderId && visibleFolders.has(board.folderId) ? board.folderId : null, favorite: false })),
		folders: library.folders.filter((folder) => visibleFolders.has(folder.id)).map((folder) => ({ ...folder, parentId: folder.parentId && visibleFolders.has(folder.parentId) ? folder.parentId : null })),
	}
}
