import { describe, expect, it, vi } from 'vitest'
import { BoardCatalog } from './BoardCatalog'

vi.mock('cloudflare:workers', () => ({
	DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} },
}))

function fixture() {
	const rows = new Map<string, { kind: string; data: string }>()
	const ctx = { storage: {
		sql: { exec(query: string, ...params: string[]) {
			if (query.startsWith('DELETE')) { if (rows.get(params[0])?.kind === params[1]) rows.delete(params[0]) }
			if (query.startsWith('INSERT')) {
				const [id, kind, data] = params
				if (!query.includes('OR IGNORE') || !rows.has(id)) rows.set(id, { kind, data })
			}
			const result = query.includes('WHERE id =') ? [rows.get(params[0])].filter(row => row?.kind === params[1])
				: query.includes('WHERE kind =') ? [...rows.values()].filter(row => row.kind === params[0]) : []
			return { toArray: () => result }
		} },
		transactionSync: (fn: () => unknown) => fn(),
	} } as unknown as DurableObjectState
	const snapshot = { documents: [], schema: { schemaVersion: 2, sequences: {} } }
	const exportSnapshot = vi.fn(async () => snapshot)
	const initialize = vi.fn(async (_snapshot: unknown) => {})
	const get = vi.fn((id: string) => id === 'principal' ? { getDocumentSnapshot: exportSnapshot } : { initializeCopy: initialize })
	const env = { TLDRAW_DURABLE_OBJECT: { idFromName: (id: string) => id, get }, TLDRAW_BUCKET: { get: vi.fn(), put: vi.fn() } } as unknown as Env
	const catalog = new BoardCatalog(ctx, env)
	const requestCopy = () => catalog.fetch(new Request('http://catalog/api/boards/principal/copy', { method: 'POST' }))
	return { catalog, rows, snapshot, exportSnapshot, initialize, requestCopy }
}

describe('board copy publication', () => {
	it('publishes a fresh catalog entry only after its document is initialized', async () => {
		const f = fixture()
		const original = f.rows.get('principal')!.data
		f.initialize.mockImplementation(async snapshot => {
			expect(snapshot).toEqual(f.snapshot)
			expect(f.rows.size).toBe(1)
		})
		const response = await f.requestCopy()
		expect(response.status).toBe(201)
		const copy = await response.json() as { id: string; name: string }
		expect(copy.id).not.toBe('principal')
		expect(copy.name).toBe('Copia de Principal')
		expect(f.rows.size).toBe(2)
		expect(f.rows.get('principal')!.data).toBe(original)
	})

	it('does not publish an empty copy if document initialization fails', async () => {
		const f = fixture(), log = vi.spyOn(console, 'error').mockImplementation(() => {})
		f.initialize.mockRejectedValueOnce(new Error('Storage unavailable'))
		try {
			expect((await f.requestCopy()).status).toBe(500)
			expect(f.rows.size).toBe(1)
		} finally { log.mockRestore() }
	})

	it('does not publish a copy if the source is trashed during initialization', async () => {
		const f = fixture()
		f.initialize.mockImplementation(async () => {
			const row = f.rows.get('principal')!
			row.data = JSON.stringify({ ...JSON.parse(row.data), trashedAt: Date.now() })
		})
		expect((await f.requestCopy()).status).toBe(404)
		expect(f.rows.size).toBe(1)
	})
})

describe('folder deletion', () => {
	it('removes nested folders and trashes their canvases into the parent, leaving siblings alone', async () => {
		const { catalog, rows } = fixture()
		const send = async (path: string, method: string, body?: unknown) => (await catalog.fetch(new Request(`http://catalog/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }))).json() as Promise<Record<string, unknown>>
		const term = await send('folders', 'POST', { name: 'Semestre' })
		const unit = await send('folders', 'POST', { name: 'Unidad', parentId: term.id })
		const lesson = await send('folders', 'POST', { name: 'Clase', parentId: unit.id })
		const sibling = await send('folders', 'POST', { name: 'Otra', parentId: term.id })
		const inUnit = await send('boards', 'POST', { name: 'A', folderId: unit.id })
		const inLesson = await send('boards', 'POST', { name: 'B', folderId: lesson.id })
		const alreadyTrashed = await send('boards', 'POST', { name: 'C', folderId: lesson.id })
		await send(`boards/${alreadyTrashed.id}`, 'PATCH', { trashed: true })
		const kept = await send('boards', 'POST', { name: 'D', folderId: sibling.id })

		expect(await send(`folders/${unit.id}`, 'DELETE')).toEqual({ trashed: [inUnit.id, inLesson.id] })
		const board = (id: unknown) => JSON.parse(rows.get(id as string)!.data)
		expect([unit.id, lesson.id].some((id) => rows.has(id as string))).toBe(false)
		expect(rows.has(sibling.id as string)).toBe(true)
		for (const id of [inUnit.id, inLesson.id, alreadyTrashed.id]) expect(board(id)).toMatchObject({ folderId: term.id, trashedAt: expect.any(Number) })
		expect(board(kept.id)).toMatchObject({ folderId: sibling.id, trashedAt: null })
	})
})
