import { useEffect, useState } from 'react'
import { defaultPass, type PassProfile } from '../../../shared/pass'
import { portalRequest } from '../api'
import { Onboarding } from './Onboarding'
import { navigate } from '../../navigation'

export default function ReviewOnboarding() {
	const [students, setStudents] = useState<
		{ username: string; name: string; profile: PassProfile }[]
	>([])
	const [selected, setSelected] = useState(''),
		[version, setVersion] = useState(0),
		[error, setError] = useState(''),
		[complete, setComplete] = useState(false)
	useEffect(() => {
		void portalRequest<{ students: typeof students }>('review-passes')
			.then((data) => {
				setStudents(data.students)
				setSelected(
					data.students.find((s) => s.profile.intro.skin === 'slime')
						?.username ??
						data.students[0]?.username ??
						'',
				)
			})
			.catch((cause) => setError(cause.message))
	}, [])
	const student = students.find((s) => s.username === selected)
	if (!student)
		return (
			<main className="portal-page">
				<h1>Revisar bienvenidas</h1>
				<p>{error || 'Cargando las bienvenidas locales…'}</p>
				<button className="portal-button" onClick={() => navigate('/')}>
					Volver al portal
				</button>
			</main>
		)
	return (
		<>
			<details className="pass-review-bar">
				<summary>Revisión</summary>
				<div>
					<p>Notas en borrador. No cambia las cuentas.</p>
					<label className="pass-sr-only" htmlFor="review-student">
						Alumno
					</label>
					<select
						id="review-student"
						value={selected}
						onChange={(e) => {
							setSelected(e.target.value)
							setComplete(false)
							setVersion((v) => v + 1)
						}}
					>
						{students.map((s) => (
							<option key={s.username} value={s.username}>
								{s.name}
							</option>
						))}
					</select>
					<button
						onClick={() => {
							setComplete(false)
							setVersion((v) => v + 1)
						}}
					>
						Repetir
					</button>
					<button onClick={() => navigate('/')}>Cerrar revisión</button>
				</div>
			</details>
			{complete ? (
				<main className="pass-demo-complete">
					<h1>Pase listo.</h1>
					<p>
						La prueba terminó sin modificar el pase ni la cuenta del alumno.
					</p>
					<button
						className="pass-primary"
						onClick={() => {
							setComplete(false)
							setVersion((v) => v + 1)
						}}
					>
						Volver a revisar
					</button>
				</main>
			) : (
				<Onboarding
					key={`${selected}-${version}`}
					profile={{
						...student.profile,
						completed: false,
						draft: defaultPass(
							student.profile.intro.name,
							student.profile.intro.skin,
						),
					}}
					preview
					onComplete={() => setComplete(true)}
				/>
			)}
		</>
	)
}
