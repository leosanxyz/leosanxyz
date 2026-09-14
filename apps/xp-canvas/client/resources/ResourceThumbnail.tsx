import { useEffect, useRef, useState } from 'react'
import type { Resource } from '../../shared/resources'
import { Icon } from '../components/Icon'
import { uploadFile } from './files'
import { videoPreview } from './videoPreview'
import { boardRequest } from '../boards/api'

// Only visible videos enter this queue. Decode one at a time on the iPad.
let queue: Promise<unknown> = Promise.resolve()
const pending = new Map<string, Promise<string>>()
function ensurePreview(resource: Resource, signal: AbortSignal) {
	const existing = pending.get(resource.id)
	if (existing) return existing
	const result = queue.catch(() => {}).then(async () => {
		if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError')
		const preview = await videoPreview(resource.src, signal)
		if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError')
		const image = await uploadFile(preview.file)
		const saved = await boardRequest<{ previewSrc: string }>(`resources/${resource.id}/preview`, 'PUT', { previewId: image.id })
		return saved.previewSrc
	})
	pending.set(resource.id, result)
	queue = result.catch(() => { pending.delete(resource.id) })
	return result
}

export function ResourceThumbnail({ resource, onPreview }: { resource: Resource; onPreview: (src: string) => void }) {
	const root = useRef<HTMLSpanElement>(null), callback = useRef(onPreview)
	callback.current = onPreview
	const [fallback, setFallback] = useState(false)
	useEffect(() => {
		if (resource.kind !== 'video' || resource.previewSrc) return
		const abort = new AbortController()
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return
			observer.disconnect()
			void ensurePreview(resource, abort.signal).then((src) => {
				if (!abort.signal.aborted) callback.current(src)
			}).catch(() => { if (!abort.signal.aborted) setFallback(true) })
		})
		if (root.current) observer.observe(root.current)
		return () => { observer.disconnect(); abort.abort() }
	}, [resource.id, resource.src, resource.kind, resource.previewSrc])
	return <span ref={root} className="resource-card__preview">
		{resource.previewSrc || resource.kind === 'image' ? <img src={resource.previewSrc ?? resource.src} alt="" loading="lazy" decoding="async" draggable={false} />
			: resource.kind === 'video' && fallback ? <video src={`${resource.src}#t=0.2`} muted playsInline preload="metadata" aria-hidden="true" />
			: <Icon name={resource.kind === 'video' ? 'play' : 'file'} size={32} />}
		<span className="resource-card__kind" role="img" title={kindLabel(resource)} aria-label={kindLabel(resource)}>
			<Icon name={resource.kind === 'video' ? 'play' : resource.kind === 'image' ? 'image' : resource.kind === 'audio' ? 'audio' : 'file'} size={16} />
		</span>
	</span>
}

function kindLabel(resource: Resource) {
	return resource.kind === 'video' ? 'Video' : resource.mimeType === 'image/gif' ? 'GIF' : resource.kind === 'image' ? 'Imagen' : resource.kind === 'audio' ? 'Audio' : resource.mimeType === 'application/pdf' ? 'PDF' : 'Documento'
}
