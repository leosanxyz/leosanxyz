/** Reveal the video only once a decoded frame reaches the compositor. */
export function onFirstVideoFrame(video: HTMLVideoElement, ready: () => void) {
	let cancelled = false, videoFrame: number | undefined, animationFrame = 0
	const finish = () => { if (!cancelled) ready() }
	const afterPlaying = () => {
		// Older browsers lack video-frame callbacks. Give their first frame a paint
		// after playback starts instead of revealing the empty media element on Play.
		animationFrame = requestAnimationFrame(() => { animationFrame = requestAnimationFrame(finish) })
	}
	if (typeof video.requestVideoFrameCallback === 'function') {
		videoFrame = video.requestVideoFrameCallback(finish)
	} else if (!video.paused && video.readyState >= 2) {
		afterPlaying()
	} else {
		video.addEventListener('playing', afterPlaying, { once: true })
	}
	return () => {
		cancelled = true
		if (videoFrame !== undefined) video.cancelVideoFrameCallback(videoFrame)
		cancelAnimationFrame(animationFrame)
		video.removeEventListener('playing', afterPlaying)
	}
}
