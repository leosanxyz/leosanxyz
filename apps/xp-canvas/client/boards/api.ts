export async function boardRequest<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal): Promise<T> {
	const response = await fetch(`/api/${path}`, { method, cache: 'no-store', signal,
		...(data !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}),
	})
	if (response.status === 204) return undefined as T
	const body = await response.json()
	if (!response.ok) throw new Error((body as { error?: string }).error ?? 'No se pudo guardar el cambio.')
	return body as T
}
