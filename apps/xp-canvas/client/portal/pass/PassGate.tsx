import {
	createContext,
	lazy,
	Suspense,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react'
import type { PassProfile } from '../../../shared/pass'
import { portalRequest } from '../api'
import { usePortal } from '../PortalProvider'
import { navigate } from '../../navigation'
// Profile, gachapon and onboarding share these styles; keep them out of the lazy onboarding chunk.
import './pass.css'

const Onboarding = lazy(() => import('./Onboarding').then((module) => ({ default: module.Onboarding })))

const PassContext = createContext<{
	profile: PassProfile | null
	error: string
	refresh: () => Promise<void>
	accept: (profile: PassProfile) => void
}>({ profile: null, error: '', refresh: async () => {}, accept: () => {} })
export const usePass = () => useContext(PassContext)
export function PassGate({ children }: { children: ReactNode }) {
	const { mode, user, passCompleted, logout } = usePortal(),
		[profile, setProfile] = useState<PassProfile | null>(null),
		[error, setError] = useState('')
	const required = mode === 'portal' && user?.role === 'student'
	// The session already says whether the welcome is finished, so class does not wait for the pass.
	// Once loaded, the profile wins: finishing the welcome updates it before the session refreshes.
	const onboarding = required && (profile ? !profile.completed : !passCompleted)
	async function refresh() {
		const p = await portalRequest<PassProfile>('pass')
		setProfile(p)
		setError('')
	}
	useEffect(() => {
		setProfile(null)
		setError('')
		if (required)
			void refresh().catch(() =>
				setError('No pude cargar tu pase. Puedes volver a intentar.'),
			)
		// Account changes reset the entire pass, never reuse another student's draft.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [required, user?.id])
	useEffect(() => {
		if (!required) return
		const unlock = (event: Event) => { if ((event as CustomEvent).detail?.userId === user?.id) void refresh().catch(() => {}) }
		window.addEventListener('xp-skin-unlocked', unlock)
		return () => window.removeEventListener('xp-skin-unlocked', unlock)
	}, [required, user?.id])
	if (onboarding && !profile && !error) return <PassSkeleton />
	if (onboarding && !profile)
		return (
			<main className="portal-entry">
				<section className="portal-entry-card">
					<h1>No pude abrir tu pase</h1>
					<p role="alert">{error}</p>
					<button
						className="xp-primary"
						onClick={() =>
							void refresh().catch(() =>
								setError('No pude cargar tu pase. Inténtalo de nuevo.'),
							)
						}
					>
						Reintentar
					</button>
					<button className="portal-link" onClick={() => void logout()}>
						Cerrar sesión
					</button>
				</section>
			</main>
		)
	return (
		<PassContext.Provider value={{ profile, error, refresh, accept: setProfile }}>
			{onboarding && profile ? (
				<Suspense fallback={<PassSkeleton />}>
					<Onboarding
						key={user!.id}
						profile={profile}
						onComplete={async () => {
							await refresh()
							navigate('/')
						}}
						onExit={logout}
					/>
				</Suspense>
			) : (
				children
			)}
		</PassContext.Provider>
	)
}
/** The welcome's own background, empty, while its pass loads. */
function PassSkeleton() {
	return <main className="pass-experience" aria-busy="true" />
}
/** Pages that need the pass show their skeleton here; finished students reach them before it loads. */
export function PassPending({ children }: { children: ReactNode }) {
	const { error, refresh } = usePass()
	if (!error) return children
	return (
		<div className="board-welcome" role="alert">
			{error}
			<button className="xp-primary" onClick={() => void refresh().catch(() => {})}>
				Reintentar
			</button>
			<button className="portal-link" onClick={() => navigate('/')}>
				Mis clases
			</button>
		</div>
	)
}
export function ReplayOnboarding() {
	const { profile, refresh } = usePass()
	const loading = <PassPending><PassSkeleton /></PassPending>
	if (!profile) return loading
	return (
		<Suspense fallback={loading}>
			<Onboarding
				profile={{ ...profile, draft: { ...profile.draft, step: 0, opened: false } }}
				onExit={async () => {
					await refresh()
					navigate('/perfil')
				}}
				onComplete={async () => {
					await refresh()
					navigate('/perfil')
				}}
			/>
		</Suspense>
	)
}
