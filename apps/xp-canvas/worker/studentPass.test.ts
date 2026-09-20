import { describe, expect, it } from 'vitest'
import { defaultPass, passHologram, passStickers, updatePassDraft, validPass, type PassSticker } from '../shared/pass'

describe('student pass validation', () => {
	it('preserves independent stickers for every cover, including legacy passes', () => {
		const sticker: PassSticker = { id: 'frog-1', art: 'frog', x: 50, y: 45, rotation: -8, scale: 1 }
		const legacy = { ...defaultPass('Prueba', 'slime'), stickers: [sticker] }
		const other = updatePassDraft(legacy, { skin: 'halo' })
		expect(other.stickers).toEqual([])
		expect(passStickers(other, 'slime')).toEqual([sticker])
		expect(validPass(other)).toBe(true)
		expect(updatePassDraft(JSON.parse(JSON.stringify(other)), { skin: 'slime' }).stickers).toEqual([sticker])
		expect(legacy.stickers).toEqual([sticker])
		for (const stickersBySkin of [null, [], { unknown: [] }, { xp: 'bad' }, { xp: [{ ...sticker, x: 200 }] }, { xp: [sticker, sticker] }])
			expect(validPass({ ...other, stickersBySkin })).toBe(false)
	})
	it('accepts the default and a bounded editable sticker', () => {
		expect(validPass(defaultPass('Prueba', 'slime'))).toBe(true)
		expect(
			validPass({
				...defaultPass('Prueba'),
				stickers: [
					{
						id: 'unique-1',
						art: 'frog',
						x: 8,
						y: 92,
						rotation: -180,
						scale: 1.6,
					},
				],
			}),
		).toBe(true)
	})
	it('rejects invalid names, injected asset URLs and non-finite or out of range values', () => {
		for (const change of [
			{ name: '' },
			{ name: '   ' },
			{ name: 'a'.repeat(33) },
			{ name: 'a\nb' },
			{ skin: 'https://untrusted.test/image' },
			{ finish: 'unknown' },
			{ brightness: NaN },
			{ brightness: 21 },
			{ step: 1.2 },
			{ step: 5 },
			{ opened: 'true' },
		])
			expect(validPass({ ...defaultPass('Prueba'), ...change })).toBe(false)
	})
	it('keeps old passes readable and accepts drawn or accessible typed signatures', () => {
		const legacy = defaultPass('Prueba')
		delete legacy.signature
		expect(validPass(legacy)).toBe(true)
		expect(
			validPass({ ...legacy, signature: { kind: 'typed', name: 'Prueba' } }),
		).toBe(true)
		expect(
			validPass({
				...legacy,
				signature: {
					kind: 'drawn',
					strokes: [
						[
							[0, 0],
							[600, 340],
						],
					],
				},
			}),
		).toBe(true)
		const maximum = {
			...legacy,
			signature: {
				kind: 'drawn',
				strokes: [Array.from({ length: 512 }, () => [600, 340])],
			},
		}
		expect(validPass(maximum)).toBe(true)
		expect(
			new TextEncoder().encode(JSON.stringify(maximum)).length,
		).toBeLessThan(6500)
	})
	it('keeps legacy finishes and bounds the independent hologram controls', () => {
		const legacy = defaultPass('Prueba')
		delete legacy.hologram
		expect(validPass(legacy)).toBe(true)
		expect(
			validPass({
				...legacy,
				hologram: { pattern: 'rings', intensity: 100, phase: 0.75 },
			}),
		).toBe(true)
		expect(
			validPass({
				...legacy,
				hologram: {
					pattern: 'stars',
					intensity: 65,
					phase: 0.5,
					area: 'subject',
					hue: 360,
				},
			}),
		).toBe(true)
		for (const hologram of [
			null,
			{ pattern: 'arbitrary-url', intensity: 50, phase: 0 },
			{ pattern: 'grid', intensity: 101, phase: 0 },
			{ pattern: 'flow', intensity: -1, phase: 0 },
			{ pattern: 'grid', intensity: 60, phase: NaN },
			{ pattern: 'rings', intensity: 40, phase: 1.1 },
			{
				pattern: 'grid',
				intensity: 65,
				phase: 0.5,
				area: 'https://untrusted.test/mask',
			},
			{ pattern: 'grid', intensity: 65, phase: 0.5, hue: 361 },
			{ pattern: 'grid', intensity: 65, phase: 0.5, hue: NaN },
		])
			expect(validPass({ ...legacy, hologram })).toBe(false)
	})
	it('maps older star finishes without changing their saved data', () => {
		const hologram = { pattern: 'rings' as const, intensity: 82, phase: 0.42 }
		const resolved = passHologram({ finish: 'stars', hologram })
		expect(resolved).toEqual({
			...hologram,
			pattern: 'stars',
			area: 'all',
			hue: 195,
		})
		expect(hologram.pattern).toBe('rings')
		expect(
			passHologram({
				finish: 'prism',
				hologram: { ...hologram, area: 'background', hue: 45 },
			}),
		).toMatchObject({ area: 'background', hue: 45, pattern: 'rings' })
	})
	it('rejects arbitrary signature markup, unbounded strokes and invalid coordinates', () => {
		for (const signature of [
			'<svg onload="alert(1)">',
			{ kind: 'typed', name: '' },
			{ kind: 'typed', name: 'x'.repeat(33) },
			{ kind: 'typed', name: 'x\ny' },
			{ kind: 'drawn', strokes: [] },
			{ kind: 'drawn', strokes: [[[0, 0]]] },
			{
				kind: 'drawn',
				strokes: [
					[
						[1.5, 0],
						[3, 3],
					],
				],
			},
			{
				kind: 'drawn',
				strokes: [
					[
						[0, 0],
						[601, 341],
					],
				],
			},
			{
				kind: 'drawn',
				strokes: [
					[
						[0, 0],
						[NaN, 0],
					],
				],
			},
			{ kind: 'drawn', strokes: [Array.from({ length: 513 }, () => [0, 0])] },
			{
				kind: 'drawn',
				strokes: Array.from({ length: 13 }, () => [
					[0, 0],
					[1, 1],
				]),
			},
		])
			expect(validPass({ ...defaultPass('Prueba'), signature })).toBe(false)
	})
	it('bounds and uniquely identifies stickers instead of allowing arbitrary markup or coordinates', () => {
		const sticker = {
			id: 'one',
			art: 'star',
			x: 50,
			y: 50,
			rotation: 0,
			scale: 1,
		}
		for (const change of [
			{ art: '<script>' },
			{ x: Infinity },
			{ x: 7 },
			{ y: 93 },
			{ scale: 3 },
			{ rotation: 181 },
			{ id: 'a/b' },
		])
			expect(
				validPass({
					...defaultPass('Prueba'),
					stickers: [{ ...sticker, ...change }],
				}),
			).toBe(false)
		expect(
			validPass({ ...defaultPass('Prueba'), stickers: [sticker, sticker] }),
		).toBe(false)
		expect(
			validPass({
				...defaultPass('Prueba'),
				stickers: Array.from({ length: 9 }, (_, i) => ({
					...sticker,
					id: String(i),
				})),
			}),
		).toBe(false)
	})
})
