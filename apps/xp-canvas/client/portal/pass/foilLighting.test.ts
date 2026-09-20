import { describe, expect, it } from 'vitest'
import { foilLighting, foilPattern } from './foilLighting'
import { hologramMask } from './hologramMasks'
import { SKINS } from '../../../shared/pass'

describe('printed foil and reflected light', () => {
	it('changes the light color without dimming or moving the printed pattern', () => {
		const cool = foilLighting(0, 0, 195, 63, 19)
		const warm = foilLighting(0, 0, 20, 63, 19)
		expect(cool.spectrum).not.toBe(warm.spectrum)
		expect(cool.illumination).toBe(warm.illumination)
		expect(cool.glare).toBe(warm.glare)
		expect(cool.glare).toContain('at 63.00% 19.00%')
		expect(foilLighting(4, -5, 195, 63, 19).glare).toBe(cool.glare)
		expect(foilLighting(4, -5, 195, 63, 19).spectrum).not.toBe(cool.spectrum)
		expect(foilLighting(0, 0, 195, 15, 80).glare).not.toBe(cool.glare)
		expect(Object.keys(cool).sort()).toEqual([
			'glare',
			'illumination',
			'spectrum',
		])
	})
	it('lets the infinity control rotate and resize only the printed pattern', () => {
		expect(foilPattern(0.25).scale).toBeCloseTo(1.45)
		expect(foilPattern(0.75).scale).toBeCloseTo(0.65)
		expect(foilPattern(0.25).rotation).not.toBe(foilPattern(0.75).rotation)
	})
	it('uses the final endpoint for rainbow foil, not the red start color', () => {
		const rainbow = foilLighting(0, 0, 360, 63, 19)
		expect(rainbow.spectrum).not.toBe(foilLighting(0, 0, 0, 63, 19).spectrum)
		for (const hue of [0, 60, 120, 180, 240, 300])
			expect(rainbow.spectrum).toContain(`hsl(${hue.toFixed(1)} `)
		expect(rainbow.glare).toContain('at 63.00% 19.00%')
	})
	it('defines complementary subject and background masks for every cover', () => {
		for (const skin of SKINS) {
			expect(hologramMask(skin, 'all')).toBeUndefined()
			if (skin === 'xp') {
				const logo = hologramMask(skin, 'subject')
				expect(logo).toContain('xp-logo.png')
				expect(hologramMask(skin, 'background')).toBe(
					`linear-gradient(white, white), ${logo}`,
				)
				continue
			}
			const subject = decodeURIComponent(hologramMask(skin, 'subject')!)
			const background = decodeURIComponent(hologramMask(skin, 'background')!)
			expect(subject).toContain('<g fill="white" color="white">')
			expect(background).toContain('<g fill="black" color="black">')
			expect(subject.split('<g')[1].split('>')[1]).toBe(
				background.split('<g')[1].split('>')[1],
			)
		}
	})
})
