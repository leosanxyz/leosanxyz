import { lazy, Suspense } from 'react'
import { usePathname, navigate } from './navigation'
import { isBoardId } from '../shared/boards'
import BoardManager from './pages/BoardManager'
import { PortalProvider, usePortal } from './portal/PortalProvider'
import { StudentBoards } from './portal/StudentBoards'
import { PassGate, ReplayOnboarding } from './portal/pass/PassGate'
import { CanvasSkeleton, LibrarySkeleton } from './components/Skeleton'

const DemoOnboarding = import.meta.env.DEV ? lazy(() => import('./portal/pass/Onboarding').then((m) => ({ default: m.DemoOnboarding }))) : null
const ReviewOnboarding = import.meta.env.DEV ? lazy(() => import('./portal/pass/ReviewOnboarding')) : null

const Room = lazy(() => import('./pages/Room').then((module) => ({ default: module.Room })))
const Students = lazy(() => import('./portal/Students'))
const Profile = lazy(() => import('./portal/Profile'))
const Shop = lazy(() => import('./shop/Shop'))

export function App() {
	const path = usePathname()
	if (path === '/bienvenida/demo' && DemoOnboarding) return <Suspense fallback={<div>Preparando el pase…</div>}><DemoOnboarding /></Suspense>
	return <PortalProvider><PassGate><Routes /></PassGate></PortalProvider>
}

function Routes() {
	const path = usePathname()
	const { mode, user } = usePortal()
	if (path === '/bienvenida/revision' && user?.role === 'teacher' && ReviewOnboarding) return <Suspense fallback={<div>Preparando las bienvenidas…</div>}><ReviewOnboarding /></Suspense>
	if (path === '/perfil' && mode === 'portal') return <Suspense fallback={<LibrarySkeleton />}><Profile /></Suspense>
	if (path === '/mi-pase' && mode === 'portal' && user?.role === 'student') return <Suspense fallback={<LibrarySkeleton />}><Profile initiallyEditing /></Suspense>
	if (path === '/tienda' && mode === 'portal' && user) return <Suspense fallback={<LibrarySkeleton />}><Shop /></Suspense>
	if (path === '/bienvenida' && mode === 'portal' && user?.role === 'student') return <ReplayOnboarding />
	if (path === '/') return mode === 'portal' && user?.role === 'student' ? <StudentBoards /> : <BoardManager />
	if (path === '/alumnos' && mode === 'portal' && user?.role === 'teacher') return <Suspense fallback={<LibrarySkeleton />}><Students /></Suspense>
	const match = /^\/board\/([^/]+)\/?$/.exec(path)
	if (!match || !isBoardId(match[1])) return <div className="board-welcome"><h1>Este canvas no existe</h1><button className="xp-primary" onClick={() => navigate('/')}>Mis canvases</button></div>
	return <Suspense fallback={<CanvasSkeleton />}><Room key={match[1]} roomId={match[1]} /></Suspense>
}
