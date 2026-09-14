import { expect, it, vi } from 'vitest'
import type { IRequest } from 'itty-router'
import { createEditorCookie, type CanvasEnv } from './access'
import { removeResource, resourcePrefix, saveResourcePreview } from './resources'

const id = 'resource-test-123'
async function editorRequest(env: CanvasEnv, method: string, body?: unknown) {
	const url = `http://canvas.test/api/resources/${id}`
	return Object.assign(new Request(url, {
		method, headers: { cookie: await createEditorCookie(new Request(url), env), 'content-type': 'application/json' },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	}), { params: { resourceId: id } }) as unknown as IRequest
}

it('deletes only the library entry, never the original file or preview', async () => {
	const remove = vi.fn()
	const env = { EDITOR_SESSION_SECRET: 'test-only-secret', TLDRAW_BUCKET: { delete: remove } } as unknown as CanvasEnv
	expect((await removeResource(await editorRequest(env, 'DELETE'), env)).status).toBe(204)
	expect(remove).toHaveBeenCalledExactlyOnceWith(`${resourcePrefix}${id}`)
})

it('does not resurrect a removed resource when its thumbnail finishes saving', async () => {
	const put = vi.fn().mockResolvedValue(null)
	const env = { EDITOR_SESSION_SECRET: 'test-only-secret', TLDRAW_BUCKET: {
		head: vi.fn().mockResolvedValueOnce({ etag: 'original-entry', customMetadata: { resource: JSON.stringify({ id, kind: 'video' }) } })
			.mockResolvedValueOnce({ httpMetadata: { contentType: 'image/png' }, size: 100 }),
		put,
	} } as unknown as CanvasEnv
	const response = await saveResourcePreview(await editorRequest(env, 'PUT', { previewId: 'preview-test-123' }), env)
	expect(response.status).toBe(404)
	expect(put).toHaveBeenCalledWith(`${resourcePrefix}${id}`, '', expect.objectContaining({ onlyIf: { etagMatches: 'original-entry' } }))
})
