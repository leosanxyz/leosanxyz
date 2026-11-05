import { expect, it } from 'vitest'
import { artName, chooseMaps, fitRect } from './maps'

const files = {
	'../designs/capsula/materiales/mapas/rengoku/mask.png': '/m/rengoku-mask.png',
	'../designs/capsula/materiales/mapas/rengoku/depth.png': '/m/rengoku-depth.png',
	'../designs/capsula/materiales/mapas/attack-titan/depth.png': '/m/titan-depth.png',
	'../designs/capsula/materiales/mapas/long-dark-cabin/mask.png': '/m/cabin.png',
}

it('names a cover by its artwork file', () => {
	expect(artName('../../../../design/gachapon/web/attack-titan.webp')).toBe('attack-titan')
	expect(artName('/design/pass-skins/web/the-long-dark-cabin.webp')).toBe('the-long-dark-cabin')
	expect(artName('/assets/the-long-dark-cabin-BwisbKaj.webp', true)).toBe('the-long-dark-cabin')
	expect(artName('/assets/attack-titan-3Pl_y-9N.webp?v=1', true)).toBe('attack-titan')
	// without a hash, a final word of eight letters stays
	expect(artName('/design/pass-skins/cult-of-the-lamb.jpg')).toBe('cult-of-the-lamb')
})

it('prefers painted maps, then the vector mask, then an oval; relief falls back to the art', () => {
	expect(chooseMaps('rengoku', files, true)).toEqual({ mask: { kind: 'png', url: '/m/rengoku-mask.png' }, depth: { kind: 'png', url: '/m/rengoku-depth.png' } })
	expect(chooseMaps('attack-titan', files, true)).toEqual({ mask: { kind: 'vector' }, depth: { kind: 'png', url: '/m/titan-depth.png' } })
	expect(chooseMaps('sunset-riders', files, false)).toEqual({ mask: { kind: 'oval' }, depth: { kind: 'luminance' } })
	expect(chooseMaps(undefined, files, true)).toEqual({ mask: { kind: 'vector' }, depth: { kind: 'luminance' } })
	// a folder only matches its exact name
	expect(chooseMaps('the-long-dark-cabin', files, true).mask).toEqual({ kind: 'vector' })
})

it('places art like CSS object-fit with object-position', () => {
	expect(fitRect(1000, 500, 100, 100, '79% center')).toEqual({ x: -79, y: 0, w: 200, h: 100 })
	expect(fitRect(100, 200, 100, 100, '50% 100%')).toEqual({ x: 0, y: -100, w: 100, h: 200 })
	expect(fitRect(200, 100, 100, 100, '50% 42%', 'contain')).toEqual({ x: 0, y: 21, w: 100, h: 50 })
})
