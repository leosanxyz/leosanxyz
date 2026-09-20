export async function portalRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
	const response = await fetch(`/api/portal/${path}`, {
		method, cache: 'no-store',
		...(data === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
	})
	const result = await response.json() as T & { error?: string }
	if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.')
	return result
}
