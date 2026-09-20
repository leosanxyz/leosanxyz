import { afterEach, describe, expect, it, vi } from 'vitest'
import { PassAudio } from './PassAudio'

function setup(
	bytes: Promise<ArrayBuffer> = Promise.resolve(new ArrayBuffer(8)),
) {
	const sources: Array<{
		buffer: AudioBuffer | null
		loop: boolean
		onended: (() => void) | null
		connect: ReturnType<typeof vi.fn>
		disconnect: ReturnType<typeof vi.fn>
		start: ReturnType<typeof vi.fn>
		stop: ReturnType<typeof vi.fn>
	}> = []
	const context = {
		state: 'running',
		currentTime: 10,
		destination: {},
		resume: vi.fn(async () => {}),
		suspend: vi.fn(async () => {}),
		close: vi.fn(async () => {}),
		decodeAudioData: vi.fn(async () => ({ duration: 1 }) as AudioBuffer),
		createBufferSource: vi.fn(() => {
			const source = {
				buffer: null,
				loop: false,
				onended: null,
				connect: vi.fn(),
				disconnect: vi.fn(),
				start: vi.fn(),
				stop: vi.fn(),
			}
			sources.push(source)
			return source
		}),
		createGain: vi.fn(() => ({
			gain: {
				setValueAtTime: vi.fn(),
				linearRampToValueAtTime: vi.fn(),
				cancelScheduledValues: vi.fn(),
				setTargetAtTime: vi.fn(),
			},
			connect: vi.fn(),
			disconnect: vi.fn(),
		})),
	}
	const createContext = vi.fn(() => context as unknown as AudioContext)
	const fetchSound = vi.fn(async () => ({ ok: true, arrayBuffer: () => bytes }))
	vi.stubGlobal('fetch', fetchSound)
	const engine = new PassAudio(createContext, () => true)
	return { engine, context, createContext, sources, fetchSound }
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe('pass sounds', () => {
	it('waits for a gesture, caches the six files and suppresses duplicate hits', async () => {
		const { engine, sources, createContext, fetchSound } = setup()
		await engine.play('pop')
		expect(createContext).not.toHaveBeenCalled()
		engine.unlock()
		engine.unlock()
		await engine.play('pop')
		await engine.play('pop')
		expect(createContext).toHaveBeenCalledTimes(1)
		expect(fetchSound).toHaveBeenCalledTimes(6)
		expect(sources).toHaveLength(1)
		expect(sources[0].start).toHaveBeenCalledTimes(1)
		await engine.dispose()
	})

	it('replaces the preceding accent while allowing one paper sound alongside it', async () => {
		const { engine, sources } = setup()
		engine.unlock()
		await engine.play('reveal')
		await engine.play('card')
		await engine.play('celebrate', 0.16)
		expect(sources).toHaveLength(3)
		expect(sources[0].stop).toHaveBeenCalledTimes(1)
		expect(sources[1].stop).not.toHaveBeenCalled()
		expect(sources[2].start.mock.calls[0][0]).toBeGreaterThan(10.1)
		engine.setMuted(true)
		await engine.play('rip')
		expect(sources).toHaveLength(3)
		expect(sources[1].stop).toHaveBeenCalledTimes(1)
		expect(sources[2].stop).toHaveBeenCalledTimes(1)
		await engine.dispose()
	})

	it('discards a pending cue when leaving its scene', async () => {
		let decode = (_: ArrayBuffer) => {}
		const bytes = new Promise<ArrayBuffer>((resolve) => {
			decode = resolve
		})
		const { engine, sources } = setup(bytes)
		engine.unlock()
		const playing = engine.play('celebrate')
		engine.stop()
		decode(new ArrayBuffer(8))
		await playing
		expect(sources).toHaveLength(0)
		await engine.dispose()
	})

	it('sustains one tear voice during movement, stops at rest and resumes on the next pull', async () => {
		vi.useFakeTimers()
		const { engine, sources, createContext } = setup()
		engine.setTearing(true)
		expect(createContext).not.toHaveBeenCalled()
		engine.unlock()
		engine.setTearing(true)
		await vi.advanceTimersByTimeAsync(0)
		for (let frame = 0; frame < 60; frame++) {
			engine.setTearing(true)
			await vi.advanceTimersByTimeAsync(16)
		}
		expect(sources).toHaveLength(1)
		expect(sources[0].loop).toBe(true)
		expect(sources[0].start).toHaveBeenCalledTimes(1)
		expect(sources[0].stop).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(100)
		expect(sources[0].stop).toHaveBeenCalledTimes(1)
		engine.setTearing(true)
		await vi.advanceTimersByTimeAsync(0)
		expect(sources).toHaveLength(2)
		engine.setTearing(false)
		expect(sources[1].stop).toHaveBeenCalledTimes(1)
		await engine.play('reveal')
		engine.setTearing(false)
		expect(sources[2].loop).toBe(false)
		expect(sources[2].stop).not.toHaveBeenCalled()
		await engine.dispose()
	})

	it('does not play a tear after cancellation or while muted', async () => {
		vi.useFakeTimers()
		let decode = (_: ArrayBuffer) => {}
		const bytes = new Promise<ArrayBuffer>((resolve) => {
			decode = resolve
		})
		const { engine, sources } = setup(bytes)
		engine.unlock()
		engine.setTearing(true)
		engine.setTearing(false)
		decode(new ArrayBuffer(8))
		await vi.advanceTimersByTimeAsync(0)
		expect(sources).toHaveLength(0)
		engine.setTearing(true)
		await vi.advanceTimersByTimeAsync(0)
		expect(sources).toHaveLength(1)
		engine.setMuted(true)
		engine.setTearing(true)
		await vi.advanceTimersByTimeAsync(150)
		expect(sources[0].stop).toHaveBeenCalledTimes(1)
		expect(sources).toHaveLength(1)
		await engine.dispose()
	})

	it('lets the confirmed-entry chime finish after navigation, then releases audio', async () => {
		const { engine, sources, context } = setup()
		engine.unlock()
		await engine.play('enter')
		const disposed = engine.dispose()
		expect(context.close).not.toHaveBeenCalled()
		await engine.play('card')
		expect(sources).toHaveLength(1)
		sources[0].onended?.()
		await disposed
		expect(context.close).toHaveBeenCalledTimes(1)
	})

	it('keeps failed or unsupported audio optional', async () => {
		const { engine, sources, context } = setup()
		context.decodeAudioData.mockRejectedValue(new Error('Unsupported audio'))
		engine.unlock()
		await expect(engine.play('pop')).resolves.toBeUndefined()
		expect(sources).toHaveLength(0)
		await engine.dispose()
		const blocked = new PassAudio(
			() => {
				throw new Error('Device blocked')
			},
			() => true,
		)
		expect(() => blocked.unlock()).not.toThrow()
		await expect(blocked.play('enter')).resolves.toBeUndefined()
		await blocked.dispose()
	})
})
