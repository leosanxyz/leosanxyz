export type StudentDraw = { type: 'student-draw'; id: string; userIds: string[]; winnerId: string; startedAt: number }

// Fast at first, with progressively longer pauses before the final student.
export const DRAW_TIMES = Array.from({ length: 24 }, (_, index) =>
	Math.round(90 * index + 3300 * (index / 23) ** 4)
)
export const DRAW_DURATION = DRAW_TIMES[23]
export function drawStudentAt(draw: StudentDraw, step: number) {
	const winner = draw.userIds.indexOf(draw.winnerId)
	return draw.userIds[((winner - 23 + step) % draw.userIds.length + draw.userIds.length) % draw.userIds.length]
}
export function isStudentDraw(value: unknown): value is StudentDraw {
	const data = value as Partial<StudentDraw> | null
	return data?.type === 'student-draw' && typeof data.id === 'string' &&
		Array.isArray(data.userIds) && data.userIds.length > 0 && data.userIds.every((id) => typeof id === 'string') &&
		typeof data.winnerId === 'string' && data.userIds.includes(data.winnerId) && typeof data.startedAt === 'number' && Number.isFinite(data.startedAt)
}
