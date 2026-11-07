import { describe, expect, it } from 'vitest'
import { readEstado, sectionNumber } from './obs'

describe('section titles', () => {
	it('reads the number before the middle dot', () => {
		expect(sectionNumber('1 · haz el primer paso de tu plan')).toBe(1)
		expect(sectionNumber('12·repaso')).toBe(12)
		expect(sectionNumber('  3 ·  juega\nsegunda línea')).toBe(3)
	})
	it('ignores text that only mentions a number', () => {
		for (const text of ['el paso 1 de tu plan', '1. repaso', '1 - repaso', 'paso 2 · algo', '0 · intro', '123 · demasiado', '', undefined]) expect(sectionNumber(text)).toBeNull()
	})
})

describe('dock state', () => {
	it('keeps only what the canvas shows and drops non-https covers', () => {
		expect(readEstado({ tipo: 'estado', capitulo: 1, titulos: ['A', 7], visible: 'yes', sonando: { titulo: ' Song ', artista: 'Band', portada: 'http://x.test/a.jpg', extra: '<b>' }, otro: 1 }))
			.toEqual({ capitulo: 1, titulos: ['A', ''], visible: false, sonando: { titulo: 'Song', artista: 'Band' } })
		expect(readEstado({ tipo: 'estado', capitulo: 0, sonando: { titulo: 'S', artista: '', portada: 'https://x.test/a.jpg' } })?.sonando).toEqual({ titulo: 'S', artista: '', portada: 'https://x.test/a.jpg' })
		expect(readEstado({ tipo: 'estado', capitulo: 0, sonando: { titulo: '' } })?.sonando).toBeNull()
	})
	it('rejects anything that is not a valid state message', () => {
		for (const data of [null, 'x', { tipo: 'ir_a', capitulo: 1 }, { tipo: 'estado', capitulo: -1 }, { tipo: 'estado', capitulo: 1.5 }, { tipo: 'estado' }]) expect(readEstado(data)).toBeNull()
	})
})
