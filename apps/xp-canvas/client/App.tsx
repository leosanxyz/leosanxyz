import { lazy, Suspense } from 'react'
import { usePathname, navigate } from './navigation'
import { isBoardId } from '../shared/boards'
import BoardManager from './pages/BoardManager'

const Room = lazy(() => import('./pages/Room').then((module) => ({ default: module.Room })))

export function App() {
	const path = usePathname()
	if (path === '/') return <BoardManager />
	const match = /^\/board\/([^/]+)\/?$/.exec(path)
	if (!match || !isBoardId(match[1])) return <div className="board-welcome"><h1>Este canvas no existe</h1><button className="xp-primary" onClick={() => navigate('/')}>Mis canvases</button></div>
	return <Suspense fallback={<div className="board-loading">Abriendo canvas…</div>}><Room key={match[1]} roomId={match[1]} /></Suspense>
}
