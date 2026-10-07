// Shared by the portal routes: JSON responses that never cache and a bounded JSON body reader.
export class PortalError extends Error { constructor(readonly status: number, message: string) { super(message) } }
export const json = (data: unknown, status = 200, cookie?: string) => Response.json(data, {
	status, headers: { 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) },
})
export async function body(request: Request, limit = 4096): Promise<Record<string, unknown>> {
	if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PortalError(415, 'Envía una solicitud JSON.')
	if (Number(request.headers.get('content-length')) > limit) throw new PortalError(413, 'Solicitud demasiado grande.')
	const reader = request.body?.getReader()
	if (!reader) throw new PortalError(400, 'Solicitud inválida.')
	const decoder = new TextDecoder(), chunks: string[] = []
	let length = 0
	while (true) {
		const { value, done } = await reader.read()
		if (done) break
		length += value.byteLength
		if (length > limit) { await reader.cancel(); throw new PortalError(413, 'Solicitud demasiado grande.') }
		chunks.push(decoder.decode(value, { stream: true }))
	}
	const text = chunks.join('') + decoder.decode()
	try {
		const result = JSON.parse(text)
		if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error()
		return result
	} catch { throw new PortalError(400, 'Solicitud inválida.') }
}
