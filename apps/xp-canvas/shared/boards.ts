export interface Board {
	id: string
	name: string
	folderId: string | null
	favorite: boolean
	createdAt: number
	updatedAt: number
	thumbnailAt: number | null
	trashedAt: number | null
}

export interface BoardFolder {
	id: string
	name: string
	parentId: string | null
}

export interface BoardLibrary {
	boards: Board[]
	folders: BoardFolder[]
}

export const isBoardId = (id: string) => id === 'principal' || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)

export function folderDescendants(folders: BoardFolder[], id: string): Set<string> {
	const result = new Set([id])
	const queue = [id]
	while (queue.length) {
		const parent = queue.pop()!
		for (const folder of folders) {
			if (folder.parentId === parent && !result.has(folder.id)) {
				result.add(folder.id)
				queue.push(folder.id)
			}
		}
	}
	return result
}
