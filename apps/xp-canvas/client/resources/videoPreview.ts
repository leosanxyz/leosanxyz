import { hasVisiblePixels, previewSampleTimes } from './previewFrames'

/** Copy a decoded frame, without audible playback or native media controls. */
export async function videoPreview(src: string, signal?: AbortSignal): Promise<{ file: File; w: number; h: number }> {
	const video = document.createElement('video')
	video.muted = true; video.playsInline = true; video.preload = 'auto'
	video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
	video.setAttribute('aria-hidden', 'true')
	document.body.appendChild(video)
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d', { willReadFrequently: true })!
	const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function'
	let timeout = 0, decodeFallback = 0, paintFrame = 0, videoFrame: number | undefined
	try {
		await new Promise<void>((resolve, reject) => {
			let settled = false, sample = 0, targets: number[] = []
			const finish = (cause?: unknown) => {
				if (settled) return
				settled = true; signal?.removeEventListener('abort', abort)
				clearTimeout(timeout); clearTimeout(decodeFallback)
				if (cause) reject(cause); else resolve()
			}
			const abort = () => finish(new DOMException('Preview cancelled', 'AbortError'))
			const capture = (mediaTime = video.currentTime) => {
				if (settled || !targets.length || video.readyState < 2 || video.seeking || mediaTime < targets[sample] - .05) return
				try {
					// In Safari, seeked/loadeddata can precede a frame that drawImage can
					// actually copy. Capture inside rVFC, before pausing the decoder.
					context.clearRect(0, 0, canvas.width, canvas.height)
					context.drawImage(video, 0, 0, canvas.width, canvas.height)
					if (hasVisiblePixels(context.getImageData(0, 0, canvas.width, canvas.height).data)) { finish(); return }
					if (++sample === targets.length) { finish(new Error('No se encontró un fotograma visible.')); return }
					video.currentTime = targets[sample]
				} catch (cause) { finish(cause) }
			}
			const frame: VideoFrameRequestCallback = (_now, metadata) => {
				capture(metadata.mediaTime)
				if (!settled) videoFrame = video.requestVideoFrameCallback(frame)
			}
			const ready = () => {
				if (hasFrameCallback || settled) return
				cancelAnimationFrame(paintFrame)
				paintFrame = requestAnimationFrame(() => { paintFrame = requestAnimationFrame(() => capture()) })
			}
			video.onloadedmetadata = () => {
				targets = previewSampleTimes(video.duration)
				const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
				canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
				canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
				try { video.currentTime = targets[0] } catch (cause) { finish(cause) }
			}
			video.onloadeddata = ready; video.onseeked = ready; video.ontimeupdate = ready
			video.onerror = () => finish(new Error('No se pudo leer el video.'))
			timeout = window.setTimeout(() => finish(new Error('No se pudo generar la miniatura.')), 12_000)
			// Some Safari versions fetch metadata but defer decoding until play(). Muted
			// inline playback is only a fallback; it stops as soon as one frame is ready.
			decodeFallback = window.setTimeout(() => { if (!settled) void video.play().catch(() => {}) }, 1800)
			signal?.addEventListener('abort', abort, { once: true })
			if (signal?.aborted) { abort(); return }
			// Install before loading, including the first decoded frame and every seek.
			if (hasFrameCallback) videoFrame = video.requestVideoFrameCallback(frame)
			video.src = src; video.load()
		})
		video.pause()
		const w = video.videoWidth, h = video.videoHeight
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .8))
		if (!blob) throw new Error('No se pudo generar la miniatura.')
		return { file: new File([blob], 'video-preview.jpg', { type: blob.type }), w, h }
	} finally {
		clearTimeout(timeout); clearTimeout(decodeFallback)
		cancelAnimationFrame(paintFrame)
		if (videoFrame !== undefined) video.cancelVideoFrameCallback(videoFrame)
		canvas.width = canvas.height = 0
		video.onloadedmetadata = null; video.onloadeddata = null; video.onseeked = null; video.ontimeupdate = null; video.onerror = null
		video.pause(); video.removeAttribute('src'); video.load(); video.remove()
	}
}
