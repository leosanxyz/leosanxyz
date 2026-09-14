import { afterEach, describe, expect, it, vi } from 'vitest'
import { onFirstVideoFrame } from './firstVideoFrame'

afterEach(() => vi.unstubAllGlobals())

describe('first video frame', () => {
	it('waits for a video frame, not the Play event', () => {
		const ready = vi.fn()
		let frame!: () => void
		const video = Object.assign(new EventTarget(), {
			requestVideoFrameCallback: (callback: () => void) => { frame = callback; return 1 },
		}) as unknown as HTMLVideoElement
		onFirstVideoFrame(video, ready)
		video.dispatchEvent(new Event('playing'))
		expect(ready).not.toHaveBeenCalled()
		frame()
		expect(ready).toHaveBeenCalledOnce()
	})

	it('cancels a pending frame when paused or unmounted', () => {
		const ready = vi.fn(), cancel = vi.fn()
		let frame!: () => void
		vi.stubGlobal('cancelAnimationFrame', vi.fn())
		const video = Object.assign(new EventTarget(), {
			requestVideoFrameCallback: (callback: () => void) => { frame = callback; return 0 },
			cancelVideoFrameCallback: cancel,
		}) as unknown as HTMLVideoElement
		const stop = onFirstVideoFrame(video, ready)
		stop(); frame()
		expect(cancel).toHaveBeenCalledWith(0)
		expect(ready).not.toHaveBeenCalled()
	})

	it('uses two paint frames after playing as an older-browser fallback', () => {
		const ready = vi.fn(), cancel = vi.fn()
		const frames: Array<() => void> = []
		vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frames.push(callback); return frames.length })
		vi.stubGlobal('cancelAnimationFrame', cancel)
		const video = Object.assign(new EventTarget(), { paused: true, readyState: 0 }) as unknown as HTMLVideoElement
		const stop = onFirstVideoFrame(video, ready)
		expect(frames).toHaveLength(0)
		video.dispatchEvent(new Event('playing'))
		frames[0]()
		expect(ready).not.toHaveBeenCalled()
		frames[1]()
		expect(ready).toHaveBeenCalledOnce()
		stop()
		expect(cancel).toHaveBeenCalledWith(2)
	})
})
