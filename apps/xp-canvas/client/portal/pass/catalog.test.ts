import { expect, it } from 'vitest'
import { SKINS, STICKERS, defaultPass, validPass } from '../../../shared/pass'
import { packs, skins } from './catalog'
import { subjectLabel } from './hologramMasks'

it('keeps every published cover selectable, valid and complete', () => {
	expect(skins.map((skin) => skin.id)).toEqual([...SKINS])
	expect(new Set(SKINS).size).toBe(SKINS.length)
	for (const skin of skins) {
		expect(skin.image).toBeTruthy()
		expect(subjectLabel(skin.id)).toBeTruthy()
		expect([...packs[skin.id]].sort()).toEqual([...STICKERS].sort())
		expect(validPass(defaultPass('Prueba', skin.id))).toBe(true)
	}
})
