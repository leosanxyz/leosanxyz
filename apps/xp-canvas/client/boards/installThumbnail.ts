import type { Editor } from 'tldraw'
import { boardRequest } from './api'

/** Render after drawing stops, not on each pointer event. The document is already saved by sync. */
export function installThumbnail(editor: Editor, boardId: string) {
	let timer = 0, active = true, busy = false, dirty = true, lastRender = 0
	const abort = new AbortController()
	async function render() {
		timer = 0
		if (!active || editor.isDisposed || busy || !dirty) return
		// Finger navigation is handled outside the drawing tool's pointing state.
		if (editor.inputs.getIsPointing() || editor.getCameraState() === 'moving' || editor.getContainer().dataset.fingerNavigating === 'true') { schedule(); return }
		busy = true; dirty = false
		try {
			await boardRequest(`boards/${boardId}`, 'PATCH', { touch: true }, abort.signal)
			const ids = [...editor.getCurrentPageShapeIds()]
			let blob: Blob | null
			if (ids.length) {
				const bounds = editor.getCurrentPageBounds()
				const scale = bounds ? Math.min(1, 640 / (bounds.w + 48), 400 / (bounds.h + 48)) : 1
				blob = (await editor.toImage(ids, { format: 'png', scale, pixelRatio: 1, padding: 24, background: true })).blob
			} else {
				const canvas = document.createElement('canvas')
				canvas.width = 640; canvas.height = 400
				const context = canvas.getContext('2d')!
				context.fillStyle = '#fff'; context.fillRect(0, 0, 640, 400)
				blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
			}
			if (blob && active && blob.size <= 512 * 1024) {
				const response = await fetch(`/api/boards/${boardId}/thumbnail`, { method: 'PUT', body: blob, headers: { 'content-type': 'image/png' }, signal: abort.signal })
				if (!response.ok) throw new Error(`Preview upload failed: ${response.status}`)
			}
			lastRender = Date.now()
		} catch (cause) {
			if (!abort.signal.aborted) console.warn('Board preview unavailable', cause)
		} finally { busy = false; if (dirty && active) schedule() }
	}
	function schedule() {
		clearTimeout(timer)
		timer = window.setTimeout(() => { void render() }, Math.max(1500, 10_000 - (Date.now() - lastRender)))
	}
	const remove = editor.store.listen(() => { dirty = true; schedule() }, { source: 'user', scope: 'document' })
	schedule()
	return () => { active = false; clearTimeout(timer); abort.abort(); remove() }
}
