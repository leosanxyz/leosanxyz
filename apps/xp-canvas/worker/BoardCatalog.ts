import { DurableObject } from 'cloudflare:workers'
import { type Board, type BoardFolder, folderDescendants, isBoardId } from '../shared/boards'
import type { ResourceFolder, ResourceFolders } from '../shared/resources'
import type { RoomSnapshot } from '@tldraw/sync-core'

type CatalogKind = 'board' | 'folder' | 'resource-folder' | 'resource-placement'
interface ResourcePlacement { id: string; resourceId: string; folderId: string | null }

class CatalogError extends Error {
	constructor(readonly status: number, message: string) { super(message) }
}

/** Only board/folder metadata lives here. Each board keeps its own existing sync database. */
export class BoardCatalog extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL)')
		const now = Date.now()
		ctx.storage.sql.exec('INSERT OR IGNORE INTO catalog VALUES (?, ?, ?)', 'principal', 'board', JSON.stringify({
			id: 'principal', name: 'Principal', folderId: null, favorite: false,
			createdAt: now, updatedAt: now, thumbnailAt: null, trashedAt: null,
		} satisfies Board))
	}

	private read<T>(id: string, kind: CatalogKind): T | null {
		const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM catalog WHERE id = ? AND kind = ?', id, kind).toArray()[0]
		return row ? JSON.parse(row.data) as T : null
	}
	private list<T>(kind: CatalogKind): T[] {
		return this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM catalog WHERE kind = ?', kind).toArray().map((row) => JSON.parse(row.data) as T)
	}
	private write(kind: CatalogKind, value: Board | BoardFolder | ResourcePlacement) {
		this.ctx.storage.sql.exec('INSERT OR REPLACE INTO catalog VALUES (?, ?, ?)', value.id, kind, JSON.stringify(value))
	}
	private folder(value: unknown, kind: 'folder' | 'resource-folder' = 'folder') {
		if (value === null || value === undefined) return null
		if (typeof value !== 'string' || !this.read<BoardFolder>(value, kind)) throw new CatalogError(400, 'La carpeta no existe.')
		return value
	}
	private name(value: unknown) {
		if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) throw new CatalogError(400, 'Escribe un nombre de hasta 120 caracteres.')
		return value.trim()
	}

	private async copyBoard(id: string): Promise<Response> {
		const source = isBoardId(id) ? this.read<Board>(id, 'board') : null
		if (!source || source.trashedAt) throw new CatalogError(404, 'Este canvas no está disponible.')
		const copyId = crypto.randomUUID()
		const rooms = this.env.TLDRAW_DURABLE_OBJECT
		const snapshot = await rooms.get(rooms.idFromName(id)).getDocumentSnapshot()
		await rooms.get(rooms.idFromName(copyId)).initializeCopy(snapshot)
		const thumbnail = source.thumbnailAt ? await this.env.TLDRAW_BUCKET.get(`boards/${id}/thumbnail.png`) : null
		if (thumbnail) await this.env.TLDRAW_BUCKET.put(`boards/${copyId}/thumbnail.png`, thumbnail.body, { httpMetadata: { contentType: 'image/png' } })
		// Publish metadata only after the independent document and preview are saved.
		// Recheck after the awaits in case another editor trashed the original.
		const current = this.read<Board>(id, 'board')
		if (!current || current.trashedAt) throw new CatalogError(404, 'Este canvas no está disponible.')
		const now = Date.now()
		const copy: Board = {
			id: copyId, name: `Copia de ${current.name}`.slice(0, 120), folderId: current.folderId,
			favorite: false, createdAt: now, updatedAt: now, thumbnailAt: thumbnail ? now : null, trashedAt: null,
		}
		this.write('board', copy)
		return Response.json(copy, { status: 201 })
	}

	async importBoard(name: string, snapshot: RoomSnapshot): Promise<Board> {
		const title = this.name(name), id = crypto.randomUUID()
		await this.env.TLDRAW_DURABLE_OBJECT.get(this.env.TLDRAW_DURABLE_OBJECT.idFromName(id)).initializeCopy(snapshot)
		const now = Date.now()
		const board: Board = { id, name: title, folderId: null, favorite: false, createdAt: now, updatedAt: now, thumbnailAt: null, trashedAt: null }
		// Metadata appears only after the new document is safely persisted.
		this.write('board', board)
		return board
	}

	override async fetch(request: Request): Promise<Response> {
		try {
			const url = new URL(request.url)
			const parts = url.pathname.split('/').filter(Boolean)
			const collection = parts[1], id = parts[2]
			if (request.method === 'POST' && collection === 'boards' && id && parts[3] === 'copy' && parts.length === 4) return await this.copyBoard(id)
			if (request.method === 'GET') {
				if (collection === 'library') return Response.json({ boards: this.list<Board>('board'), folders: this.list<BoardFolder>('folder') })
				if (collection === 'resource-folders') return Response.json({
					folders: this.list<ResourceFolder>('resource-folder'),
					placements: Object.fromEntries(this.list<ResourcePlacement>('resource-placement').map((placement) => [placement.resourceId, placement.folderId])),
				} satisfies ResourceFolders)
				const board = id && this.read<Board>(id, 'board')
				if (!board) throw new CatalogError(404, 'Este canvas no existe.')
				return Response.json(board)
			}
			if (Number(request.headers.get('content-length')) > 4096) throw new CatalogError(413, 'Solicitud demasiado grande.')
			const text = await request.text()
			if (text.length > 4096) throw new CatalogError(413, 'Solicitud demasiado grande.')
			let data: Record<string, unknown>
			try { data = JSON.parse(text) } catch { throw new CatalogError(400, 'Solicitud inválida.') }
			if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CatalogError(400, 'Solicitud inválida.')

			// No await inside the transaction: concurrent clients cannot overwrite each other's fields.
			return this.ctx.storage.transactionSync(() => {
				if (collection === 'resource-folders' && request.method === 'POST' && !id) {
					const folder: ResourceFolder = { id: crypto.randomUUID(), name: this.name(data.name), parentId: this.folder(data.parentId, 'resource-folder') }
					this.write('resource-folder', folder)
					return Response.json(folder, { status: 201 })
				}
				if (collection === 'resource-folders' && request.method === 'PATCH' && id) {
					const folder = this.read<ResourceFolder>(id, 'resource-folder')
					if (!folder) throw new CatalogError(404, 'La carpeta no existe.')
					if ('name' in data) folder.name = this.name(data.name)
					if ('parentId' in data) {
						const parent = this.folder(data.parentId, 'resource-folder')
						if (parent && folderDescendants(this.list<ResourceFolder>('resource-folder'), id).has(parent)) throw new CatalogError(400, 'Una carpeta no puede contenerse a sí misma.')
						folder.parentId = parent
					}
					this.write('resource-folder', folder)
					return Response.json(folder)
				}
				if (collection === 'resource-placements' && request.method === 'PATCH' && id) {
					if (!('folderId' in data)) throw new CatalogError(400, 'Indica la carpeta de destino.')
					const placement: ResourcePlacement = { id: `resource:${id}`, resourceId: id, folderId: this.folder(data.folderId, 'resource-folder') }
					this.write('resource-placement', placement)
					return Response.json({ folderId: placement.folderId })
				}
				if (request.method === 'POST' && !id && collection === 'boards') {
					const now = Date.now()
					const board: Board = { id: crypto.randomUUID(), name: this.name(data.name ?? 'Sin título'), folderId: this.folder(data.folderId), favorite: false, createdAt: now, updatedAt: now, thumbnailAt: null, trashedAt: null }
					this.write('board', board)
					return Response.json(board, { status: 201 })
				}
				if (request.method === 'POST' && !id && collection === 'folders') {
					const folder: BoardFolder = { id: crypto.randomUUID(), name: this.name(data.name), parentId: this.folder(data.parentId) }
					this.write('folder', folder)
					return Response.json(folder, { status: 201 })
				}
				if (request.method === 'PATCH' && collection === 'boards' && id && isBoardId(id)) {
					const board = this.read<Board>(id, 'board')
					if (!board) throw new CatalogError(404, 'Este canvas no existe.')
					if ('name' in data) board.name = this.name(data.name)
					if ('folderId' in data) board.folderId = this.folder(data.folderId)
					if ('favorite' in data) {
						if (typeof data.favorite !== 'boolean') throw new CatalogError(400, 'Favorito inválido.')
						board.favorite = data.favorite
					}
					if ('trashed' in data) {
						if (typeof data.trashed !== 'boolean') throw new CatalogError(400, 'Estado inválido.')
						board.trashedAt = data.trashed ? Date.now() : null
					}
					if (data.touch === true) board.updatedAt = Date.now()
					if (data.thumbnail === true) board.thumbnailAt = Date.now()
					this.write('board', board)
					return Response.json(board)
				}
				if (request.method === 'PATCH' && collection === 'folders' && id) {
					const folder = this.read<BoardFolder>(id, 'folder')
					if (!folder) throw new CatalogError(404, 'La carpeta no existe.')
					if ('name' in data) folder.name = this.name(data.name)
					if ('parentId' in data) {
						const parent = this.folder(data.parentId)
						if (parent && folderDescendants(this.list<BoardFolder>('folder'), id).has(parent)) throw new CatalogError(400, 'Una carpeta no puede contenerse a sí misma.')
						folder.parentId = parent
					}
					this.write('folder', folder)
					return Response.json(folder)
				}
				throw new CatalogError(404, 'No encontrado.')
			})
		} catch (cause) {
			if (cause instanceof CatalogError) return Response.json({ error: cause.message }, { status: cause.status })
			console.error('Catalog error', cause)
			return Response.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 })
		}
	}
}
