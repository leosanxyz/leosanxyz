import { afterEach, expect, it, vi } from 'vitest'
import { boardRequest } from './api'

afterEach(() => vi.unstubAllGlobals())

it('accepts an empty successful DELETE response', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
	await expect(boardRequest<void>('resources/test-resource', 'DELETE')).resolves.toBeUndefined()
})

it('keeps server errors available for retry', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'No se pudo eliminar.' }, { status: 503 })))
	await expect(boardRequest<void>('resources/test-resource', 'DELETE')).rejects.toThrow('No se pudo eliminar.')
})
