import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Board } from '../../shared/boards'
import { Icon } from '../components/Icon'
import { shimmerPhase } from '../components/Skeleton'

const STAGGER_MS = 60

interface Entry { index: number; loaded: boolean; shown: boolean; show: () => void }

/** Thumbnails download in any order but appear left to right: each waits for the ones before it. */
class RevealOrder {
	private entries = new Set<Entry>()
	private lastShownAt = -Infinity
	private timer = 0

	add(index: number, show: () => void) {
		const entry: Entry = { index, loaded: false, shown: false, show }
		this.entries.add(entry)
		return {
			loaded: () => { entry.loaded = true; this.flush() },
			// Already in the browser cache: it shows at once and stops holding back the next ones.
			shownAtOnce: () => { entry.loaded = entry.shown = true; show(); this.flush() },
			remove: () => { this.entries.delete(entry); this.flush() },
		}
	}

	private flush() {
		clearTimeout(this.timer)
		for (const entry of [...this.entries].sort((a, b) => a.index - b.index)) {
			if (entry.shown) continue
			if (!entry.loaded) return
			const wait = this.lastShownAt + STAGGER_MS - performance.now()
			if (wait > 0) {
				this.timer = window.setTimeout(() => this.flush(), wait)
				return
			}
			entry.shown = true
			this.lastShownAt = performance.now()
			entry.show()
		}
	}
}

export function useRevealOrder() {
	return useState(() => new RevealOrder())[0]
}

/**
 * Card preview. While the thumbnail downloads, the preview keeps the skeleton shimmer; then the image
 * crossfades over it, in card order. An image already complete when it mounts shows at once.
 */
export function BoardPreview({ board, index, order }: { board: Board; index: number; order: RevealOrder }) {
	const image = useRef<HTMLImageElement>(null)
	const reveal = useRef<ReturnType<RevealOrder['add']>>(null)
	const [shown, setShown] = useState(false)
	const [style] = useState(() => ({ '--skeleton-phase': shimmerPhase() }) as CSSProperties)
	const src = board.thumbnailAt ? `/api/boards/${board.id}/thumbnail?v=${board.thumbnailAt}` : null
	useLayoutEffect(() => {
		if (!src) return
		const entry = order.add(index, () => setShown(true))
		reveal.current = entry
		// Before the first paint, so a cached image never shows its shimmer.
		if (image.current?.complete && image.current.naturalWidth) entry.shownAtOnce()
		return () => { entry.remove(); reveal.current = null }
	}, [order, index, src])
	if (!src) return <div className="board-card-preview"><Icon name="boards" size={44} /></div>
	return <div className="board-card-preview" data-loading={!shown || undefined} style={style}>
		<img ref={image} src={src} alt="" loading="lazy" decoding="async" draggable={false}
			onLoad={() => reveal.current?.loaded()} onError={() => reveal.current?.loaded()} />
	</div>
}
