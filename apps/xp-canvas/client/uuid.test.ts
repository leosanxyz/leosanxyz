import { expect, test } from 'vitest'
import { uuidFallback } from './uuid'

test('the fallback makes a version 4 UUID', () => expect(uuidFallback()).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/))
