import { createUserId } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { collectConnectedStudents } from './studentPresence'

describe('student hand presence', () => {
	it('keeps one student and a raised hand when another tab has its hand down', () => {
		const raised = { userId: createUserId('ana'), userName: 'Ana', meta: { handRaised: true } }
		const lowered = { ...raised, meta: { handRaised: false } }
		for (const peers of [[raised, lowered], [lowered, raised]]) {
			expect(collectConnectedStudents(peers)).toEqual([{ userId: createUserId('ana'), userName: 'Ana', handRaised: true }])
		}
		expect(collectConnectedStudents([lowered])[0].handRaised).toBe(false)
		expect(collectConnectedStudents([])).toEqual([])
	})
	it('excludes the teacher and treats missing or non-boolean flags as lowered hands', () => {
		expect(collectConnectedStudents([
			{ userId: createUserId('luis'), userName: 'Luis', meta: {} },
			{ userId: createUserId('teacher'), userName: 'Leo', meta: { handRaised: true } },
			{ userId: createUserId('ana'), userName: 'Ana', meta: { handRaised: 'true' } },
		])).toEqual([
			{ userId: createUserId('ana'), userName: 'Ana', handRaised: false },
			{ userId: createUserId('luis'), userName: 'Luis', handRaised: false },
		])
	})
})
