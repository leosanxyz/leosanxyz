import { describe, expect, it } from 'vitest'
import { COSMETICS, cosmetic, cosmeticPrice, forSale, MATERIALS_FOR_SALE, ownsCosmetic, RARITY } from './cosmetics'
import { CARD_MATERIALS, defaultPass, validPass } from './pass'

describe('cosmetics catalog', () => {
	it('has unique ids, prices by rarity and every card material', () => {
		expect(new Set(COSMETICS.map((item) => item.id)).size).toBe(COSMETICS.length)
		expect(Object.values(RARITY).map((r) => r.price)).toEqual([100, 250, 500, 900])
		const materials = COSMETICS.filter((item) => item.kind === 'material')
		expect(materials.map((item) => item.material).sort()).toEqual(CARD_MATERIALS.filter((m) => m !== 'none').sort())
		expect(materials.filter((item) => item.rarity === 'legendaria').map((item) => item.material).sort()).toEqual(['fantasma', 'metal'])
		expect(materials.filter((item) => item.rarity === 'epica')).toHaveLength(6)
		for (const item of COSMETICS) expect(cosmeticPrice(item)).toBe(item.free ? 0 : RARITY[item.rarity].price)
	})
	it('follows the rarity rule: commons static, rares animated, epics and legendaries shaders', () => {
		for (const item of COSMETICS) {
			if (item.kind !== 'plate' && item.kind !== 'frame') continue
			const look = item.spec.look
			expect(look).toBe(item.rarity === 'comun' ? item.kind === 'plate' ? 'flat' : 'line' : item.rarity === 'rara' ? 'animated' : 'shader')
		}
	})
	it('gives the basics to everyone, keeps effects out of sale and materials open while the switch is off', () => {
		const none = new Set<string>()
		expect(COSMETICS.filter((item) => item.free).map((item) => item.id).sort()).toEqual(['frame:fino-gris', 'plate:grafito'])
		expect(ownsCosmetic(cosmetic('plate:grafito')!, none)).toBe(true)
		expect(ownsCosmetic(cosmetic('plate:aurora')!, none)).toBe(false)
		expect(ownsCosmetic(cosmetic('plate:aurora')!, new Set(['plate:aurora']))).toBe(true)
		for (const id of ['effect:orbita', 'effect:chispa', 'effect:eclipse']) {
			expect(forSale(cosmetic(id)!)).toBe(false)
			expect(ownsCosmetic(cosmetic(id)!, new Set([id]))).toBe(false)
		}
		expect(forSale(cosmetic('material:fuego')!)).toBe(MATERIALS_FOR_SALE)
		expect(ownsCosmetic(cosmetic('material:metal')!, none)).toBe(!MATERIALS_FOR_SALE)
		expect(forSale(cosmetic('plate:grafito')!)).toBe(false)
		expect(forSale(cosmetic('frame:oro-vivo')!)).toBe(true)
	})
	it('accepts only a plate in the plate slot, a frame in the frame slot and no effect yet', () => {
		const pass = defaultPass('Dana')
		expect(validPass({ ...pass, plate: 'plate:aurora', frame: 'frame:cinta', effect: null })).toBe(true)
		expect(validPass({ ...pass, plate: null, frame: null })).toBe(true)
		for (const change of [{ plate: 'frame:cinta' }, { frame: 'plate:aurora' }, { plate: 'aurora' }, { frame: 'frame:nope' }, { effect: 'effect:orbita' }, { plate: 3 }])
			expect(validPass({ ...pass, ...change })).toBe(false)
	})
})
