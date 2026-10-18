import { lazy, Suspense, useEffect } from 'react'
import { usePathname, navigate } from './navigation'
import { isBoardId } from '../shared/boards'
import BoardManager from './pages/BoardManager'
import { PortalProvider, usePortal } from './portal/PortalProvider'
import { StudentBoards } from './portal/StudentBoards'
import { PassGate, ReplayOnboarding } from './portal/pass/PassGate'
import { RouteSkeleton } from './components/Skeleton'

const DemoOnboarding = import.meta.env.DEV ? lazy(() => import('./portal/pass/Onboarding').then((m) => ({ default: m.DemoOnboarding }))) : null
const ReviewOnboarding = import.meta.env.DEV ? lazy(() => import('./portal/pass/ReviewOnboarding')) : null

const loadRoom = () => import('./pages/Room').then((module) => ({ default: module.Room }))
const loadStudents = () => import('./portal/Students')
const loadProfile = () => import('./portal/Profile')
const loadShop = () => import('./shop/Shop')
const Room = lazy(loadRoom)
const Students = lazy(loadStudents)
const Profile = lazy(loadProfile)
const Shop = lazy(loadShop)

export function App() {
	const path = usePathname()
	if (path === '/bienvenida/demo' && DemoOnboarding) return <Suspense fallback={<div>Preparando el pase…</div>}><DemoOnboarding /></Suspense>
	// One boundary for every section: once a page is on screen, moving to another keeps it there until the next is ready.
	return <PortalProvider><PassGate><Suspense fallback={<RouteSkeleton />}><Routes /></Suspense></PassGate></PortalProvider>
}

function Routes() {
	const path = usePathname()
	const { mode, user } = usePortal()
	// Fetch the other sections' code in the background, so moving to them is immediate.
	useEffect(() => {
		const timer = window.setTimeout(() => { for (const load of [loadRoom, loadProfile, loadShop, loadStudents]) void load().catch(() => {}) }, 1000)
		return () => clearTimeout(timer)
	}, [])
	if (path === '/bienvenida/revision' && user?.role === 'teacher' && ReviewOnboarding) return <Suspense fallback={<div>Preparando las bienvenidas…</div>}><ReviewOnboarding /></Suspense>
	if (path === '/perfil' && mode === 'portal') return <Profile />
	if (path === '/mi-pase' && mode === 'portal' && user?.role === 'student') return <Profile initiallyEditing />
	if (path === '/tienda' && mode === 'portal' && user) return <Shop />
	if (path === '/bienvenida' && mode === 'portal' && user?.role === 'student') return <ReplayOnboarding />
	if (path === '/') return mode === 'portal' && user?.role === 'student' ? <StudentBoards /> : <BoardManager />
	if (path === '/alumnos' && mode === 'portal' && user?.role === 'teacher') return <Students />
	const match = /^\/board\/([^/]+)\/?$/.exec(path)
	if (!match || !isBoardId(match[1])) return <div className="board-welcome"><h1>Este canvas no existe</h1><button className="xp-primary" onClick={() => navigate('/')}>Mis canvases</button></div>
	return <Room key={match[1]} roomId={match[1]} />
}
