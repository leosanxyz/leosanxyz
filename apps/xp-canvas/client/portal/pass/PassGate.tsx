import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react'
import type { PassProfile } from '../../../shared/pass'
import { portalRequest } from '../api'
import { usePortal } from '../PortalProvider'
import { Onboarding } from './Onboarding'
import { navigate } from '../../navigation'

const PassContext = createContext<{
	profile: PassProfile | null
	refresh: () => Promise<void>
	accept: (profile: PassProfile) => void
}>({ profile: null, refresh: async () => {}, accept: () => {} })
export const usePass = () => useContext(PassContext)
export function PassGate({ children }: { children: ReactNode }) {
	const { mode, user, logout } = usePortal(),
		[profile, setProfile] = useState<PassProfile | null>(null),
		[error, setError] = useState('')
	const required = mode === 'portal' && user?.role === 'student'
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
	if (required && !profile)
		return (
			<main className="portal-entry">
				<section className="portal-entry-card">
					<h1>Preparando tu pase</h1>
					<p role={error ? 'alert' : 'status'}>{error || 'Un momento…'}</p>
					{error && (
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
					)}
					<button className="portal-link" onClick={() => void logout()}>
						Cerrar sesión
					</button>
				</section>
			</main>
		)
	return (
		<PassContext.Provider value={{ profile, refresh, accept: setProfile }}>
			{required && profile && !profile.completed ? (
				<Onboarding
					key={user!.id}
					profile={profile}
					onComplete={async () => {
						await refresh()
						navigate('/')
					}}
					onExit={logout}
				/>
			) : (
				children
			)}
		</PassContext.Provider>
	)
}
export function ReplayOnboarding() {
	const { profile, refresh } = usePass()
	if (!profile) return null
	return (
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
	)
}
