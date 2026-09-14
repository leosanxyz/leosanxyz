import { HTMLContainer, VideoShapeUtil, useEditor, useImageOrVideoAsset, useValue, type TLVideoAsset, type TLVideoShape } from 'tldraw'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '../components/Icon'
import { onFirstVideoFrame } from './firstVideoFrame'
import './video.css'

/** Preserve the native video schema/assets/export, but expose playback without edit mode. */
export class CanvasVideoShapeUtil extends VideoShapeUtil {
	override canEdit() { return false }
	override component(shape: TLVideoShape) { return <CanvasVideo key={shape.props.assetId} shape={shape} /> }
}

function CanvasVideo({ shape }: { shape: TLVideoShape }) {
	const editor = useEditor()
	const { url } = useImageOrVideoAsset({ shapeId: shape.id, assetId: shape.props.assetId, width: shape.props.w })
	// The URL resolver deliberately keeps its previous asset when the URL is
	// unchanged. Poster-only metadata updates need their own reactive subscription.
	const asset = useValue('video metadata', () => shape.props.assetId ? editor.getAsset<TLVideoAsset>(shape.props.assetId) : undefined, [editor, shape.props.assetId])
	const videoRef = useRef<HTMLVideoElement>(null)
	const cancelFirstFrame = useRef<(() => void) | null>(null)
	const [playing, setPlaying] = useState(false)
	const [activated, setActivated] = useState(false)
	const [frameReady, setFrameReady] = useState(false)
	const [controls, setControls] = useState(false)
	const [error, setError] = useState('')
	const visible = useValue('video visibility', () => !editor.getCulledShapes().has(shape.id), [editor, shape.id])
	const poster = typeof asset?.meta.previewSrc === 'string' ? asset.meta.previewSrc : undefined
	useEffect(() => () => cancelFirstFrame.current?.(), [])
	useEffect(() => { if (!visible) { videoRef.current?.pause(); setControls(false) } }, [visible])
	const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()
	function stopWaitingForFrame() {
		cancelFirstFrame.current?.()
		cancelFirstFrame.current = null
	}
	function waitForFrame(video: HTMLVideoElement) {
		if (frameReady || cancelFirstFrame.current) return
		cancelFirstFrame.current = onFirstVideoFrame(video, () => {
			cancelFirstFrame.current = null
			setFrameReady(true)
		})
	}
	async function play() {
		// Mount synchronously inside the tap so Safari keeps user-gesture permission.
		flushSync(() => setActivated(true))
		const video = videoRef.current
		if (!video) return
		waitForFrame(video)
		setError('')
		try {
			// Start without native controls. On iOS enabling them here covers the entire
			// clip with its dark transport overlay, even when the user only pressed Play.
			setControls(false)
			await video.play()
		} catch (error) {
			// Panning the video offscreen or pausing during loading can abort Play.
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				stopWaitingForFrame()
				setError('No se pudo reproducir este formato.')
			}
		}
	}
	return <HTMLContainer className="canvas-video">
		{poster && !frameReady && <img className="canvas-video__poster" src={poster} alt={asset?.props.name ?? 'Video'} draggable={false} decoding="async" />}
		{url && (activated || !poster) && <video ref={videoRef} src={url} poster={poster} playsInline preload={poster ? 'none' : 'metadata'} controls={controls} draggable={false}
			aria-label={asset?.props.name ?? 'Video'} tabIndex={playing || controls ? 0 : -1} className={playing || controls ? 'canvas-video__media is-interactive' : 'canvas-video__media'}
			onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} onDoubleClick={stop}
			onClick={(event) => { event.stopPropagation(); if (playing && !controls) setControls(true) }}
			onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setControls(true) } }}
			onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
			onPlay={(event) => { waitForFrame(event.currentTarget); setPlaying(true) }} onPause={() => { setPlaying(false); stopWaitingForFrame() }}
			onError={() => { stopWaitingForFrame(); setPlaying(false); setControls(false); setError('Este navegador no puede reproducir el video.') }} />}
		{!playing && !controls && <button type="button" className="canvas-video__play" aria-label="Reproducir video" data-testid={`video-play-${shape.id}`}
			onPointerDown={stop} onTouchStart={stop} onTouchEnd={stop} onDoubleClick={stop}
			onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }} onClick={(event) => { event.stopPropagation(); void play() }}>
			<Icon name="play" size={24} />
		</button>}
		{error && <span className="canvas-video__error" role="alert">{error}</span>}
	</HTMLContainer>
}
