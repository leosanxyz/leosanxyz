export interface PortalUser {
	id: string
	username: string
	name: string
	role: 'teacher' | 'student'
	mustChangePassword: boolean
}

export interface PortalSession {
	mode: 'local' | 'portal'
	user: PortalUser | null
}

export interface Student extends PortalUser {
	points: number
	groupId: string | null
	disabled: boolean
}

export interface StudentGroup { id: string; name: string }
export interface BoardGrant { kind: 'user' | 'group'; subjectId: string }
export interface Roster { students: Student[]; groups: StudentGroup[] }
