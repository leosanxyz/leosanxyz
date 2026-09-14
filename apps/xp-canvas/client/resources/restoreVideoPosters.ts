import type { Editor } from 'tldraw'
import type { Resource } from '../../shared/resources'

/** Copy missing or repaired posters without re-decoding videos or changing shapes. */
export function restoreVideoPosters(editor: Editor) {
	const referenced = new Set(editor.store.allRecords().flatMap((record) =>
		record.typeName === 'shape' && record.type === 'video' ? [record.props.assetId] : []))
	const videos = editor.getAssets().filter((asset) => asset.type === 'video' && referenced.has(asset.id))
	if (!videos.length) return
	const pending = new Set(videos.map((asset) => asset.id))
	const abort = new AbortController()
	void (async () => {
		let cursor: string | null = null
		do {
			const response = await fetch(`/api/resources${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: abort.signal, cache: 'no-store' })
			if (!response.ok) return
			const data = await response.json() as { resources: Resource[]; cursor: string | null }
			if (abort.signal.aborted || editor.isDisposed || editor.getIsReadonly()) return
			editor.run(() => {
				for (const video of videos) {
					const resource = data.resources.find((item) => item.src === video.props.src && item.previewSrc)
					const current = editor.getAsset(video.id)
					if (resource) pending.delete(video.id)
					if (resource && current?.type === 'video' && current.props.src === resource.src && current.meta.previewSrc !== resource.previewSrc) {
						editor.updateAssets([{ id: video.id, type: 'video', meta: { ...current.meta, previewSrc: resource.previewSrc! } }])
					}
				}
			}, { history: 'ignore' })
			cursor = data.cursor
		} while (cursor && pending.size)
	})().catch(() => { /* A later visit can retry without affecting the video. */ })
	return () => abort.abort()
}
