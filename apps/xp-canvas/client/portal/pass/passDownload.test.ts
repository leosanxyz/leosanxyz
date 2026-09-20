import { describe, expect, it } from 'vitest'
import { passFilename } from './PassDownload'

describe('pass image filename', () => {
	it('keeps a readable name without paths or punctuation', () => {
		expect(passFilename('María / ../ Ana')).toBe('pase-xp-maria-ana.png')
		expect(passFilename('🎮')).toBe('pase-xp.png')
	})
})
