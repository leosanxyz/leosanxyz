import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
	AnimatePresence,
	MotionConfig,
	motion,
	useIsPresent,
	useMotionValue,
} from 'motion/react'
import {
	defaultPass,
	defaultHologram,
	validPass,
	updatePassDraft,
	type PassDraft,
	type PassProfile,
} from '../../../shared/pass'
import { portalRequest } from '../api'
import { PassCard } from './PassCard'
import { StickerEnvelope } from './StickerEnvelope'
import { StickerEditor } from './StickerEditor'
import { PassCarousel } from './PassCarousel'
import { HologramControls } from './HologramControls'
import { IdentityControls } from './IdentityControls'
import { PassReader } from './PassReader'
import { PassNavigation } from './PassNavigation'
import { PassCelebration } from './PassCelebration'
import { PassDownload } from './PassDownload'
import { usePassReducedMotion } from './usePassReducedMotion'
import { usePassSounds } from './usePassSounds'
import { skins } from './catalog'
import './pass.css'

const steps = [
	'Bienvenida',
	'Nombre y firma',
	'Diseño',
	'Stickers',
	'Tu tarjeta',
	'Entrada',
]
export function Onboarding({
	profile,
	preview = false,
	previewKey = 'xp-pass-preview-v2',
	onComplete,
	onExit,
}: {
	profile: PassProfile
	preview?: boolean
	previewKey?: string
	onComplete: () => void | Promise<void>
	onExit?: () => void | Promise<void>
}) {
	const [draft, setDraft] = useState<PassDraft>(profile.draft)
	const [saving, setSaving] = useState(false),
		[error, setError] = useState(''),
		[status, setStatus] = useState('')
	const [entering, setEntering] = useState(false),
		[unsaved, setUnsaved] = useState(false)
	const [back, setBack] = useState(false),
		[naming, setNaming] = useState(false)
	const [inserting, setInserting] = useState(false)
	const [packRevealed, setPackRevealed] = useState(false)
	const [stickersReady, setStickersReady] = useState(profile.draft.opened)
	const [readerActive, setReaderActive] = useState(false)
	const [lastStep, setLastStep] = useState(profile.draft.step)
	const cardStage = useRef<HTMLDivElement>(null)
	const sounds = usePassSounds()
	const reduced = usePassReducedMotion(),
		revision = useRef(profile.revision),
		queue = useRef(Promise.resolve(true)),
		dirty = useRef(false),
		pending = useRef(0)
	const alive = useRef(true),
		latest = useRef(draft),
		done = useRef(false),
		heading = useRef<HTMLHeadingElement>(null)
	const holoPhase = useMotionValue((draft.hologram ?? defaultHologram()).phase)
	const step = draft.step
	const viewStep = step === 4 && readerActive ? 5 : step
	const mode =
		step === 1
			? 'identity'
			: step === 2
				? 'design'
				: step === 3
					? 'stickers'
					: readerActive
						? 'reader'
						: 'celebration'
	useEffect(() => {
		if (step !== 3 || draft.opened || packRevealed) return
		const timer = setTimeout(() => setPackRevealed(true), 1800)
		return () => clearTimeout(timer)
	}, [step, draft.opened, packRevealed])
	useEffect(() => {
		alive.current = true
		return () => {
			alive.current = false
		}
	}, [])
	useEffect(() => {
		heading.current?.focus({ preventScroll: true })
	}, [viewStep])
	function update(value: Partial<PassDraft>) {
		dirty.current = true
		setUnsaved(true)
		latest.current = updatePassDraft(latest.current, value)
		setDraft(latest.current)
	}
	function save(value: PassDraft, completed = false): Promise<boolean> {
		pending.current++
		setSaving(true)
		queue.current = queue.current.then(async () => {
			try {
				if (!preview) {
					const result = await portalRequest<PassProfile>('pass', 'PUT', {
						draft: value,
						completed,
						revision: revision.current,
					})
					revision.current = result.revision
				} else sessionStorage.setItem(previewKey, JSON.stringify(value))
				if (alive.current) {
					setError('')
					if (value === latest.current) setUnsaved(false)
					setStatus('Cambios guardados')
				}
				return true
			} catch (cause) {
				if (alive.current)
					setError(
						cause instanceof Error ? cause.message : 'No pude guardar tu pase.',
					)
				return false
			} finally {
				pending.current--
				if (alive.current) setSaving(pending.current > 0)
			}
		})
		return queue.current
	}
	useEffect(() => {
		if (!dirty.current || entering) return
		const timer = setTimeout(() => {
			if (!done.current) void save(draft)
		}, 600)
		return () => clearTimeout(timer)
		// Save requests are serialized, reading the latest revision when they run.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [draft, entering])
	useEffect(() => {
		const warn = (e: BeforeUnloadEvent) => {
			if (saving || error || unsaved) {
				e.preventDefault()
				e.returnValue = ''
			}
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [saving, error, unsaved])
	async function exit() {
		if (entering || ((unsaved || saving) && !(await save(latest.current))))
			return
		try {
			await onExit?.()
		} catch {
			setError('No pude salir. Inténtalo de nuevo.')
		}
	}
	function go(to: number) {
		if (done.current) return
		sounds.stop()
		if (to === 4) sounds.play('celebrate', 0.16)
		setBack(false)
		setNaming(false)
		setError('')
		setLastStep(step)
		setReaderActive(false)
		update({ step: to })
	}
	function next() {
		if (step === 1 && (!draft.name.trim() || !draft.signature)) return
		if (step === 3 && !draft.opened) return
		if (back) {
			setBack(false)
			return
		}
		if (step === 4) {
			sounds.stop()
			setReaderActive(true)
			return
		}
		go(Math.min(4, step + 1))
	}
	async function finish(onSaved: () => Promise<void>): Promise<boolean> {
		if (done.current) return false
		done.current = true
		setEntering(true)
		const value = {
			...latest.current,
			name: latest.current.name.trim(),
			step: 4,
		}
		latest.current = value
		setDraft(value)
		if (!(await save(value, true))) {
			done.current = false
			setEntering(false)
			return false
		}
		if (alive.current) {
			try {
				await sounds.finish()
				if (!alive.current) return false
				await onSaved()
				await onComplete()
			} catch {
				done.current = false
				setEntering(false)
				setError(
					'Tu pase se guardó, pero no pude abrir tus clases. Vuelve a intentar.',
				)
				return false
			}
		}
		return true
	}
	const scene =
		step === 0
			? 'letter'
			: step === 3 && !draft.opened
				? packRevealed
					? 'envelope'
					: 'one-more'
				: 'card'
	return (
		<MotionConfig
			reducedMotion={reduced ? 'always' : 'never'}
			transition={{ type: 'spring', stiffness: 260, damping: 30 }}
		>
			<main
				className="pass-experience"
				data-testid="pass-onboarding"
				data-step={viewStep}
				onPointerDownCapture={sounds.unlock}
				onPointerUpCapture={sounds.unlock}
				onKeyDownCapture={sounds.unlock}
				onClickCapture={sounds.unlock}
			>
				<PassCelebration active={viewStep === 4} stage={cardStage} />
				<nav className="pass-progress" aria-label="Pasos de tu pase">
					{steps.map((label, i) => (
						<span
							key={label}
							aria-label={label}
							aria-current={viewStep === i ? 'step' : undefined}
							data-done={i < viewStep}
						/>
					))}
				</nav>
				<div className="pass-utilities">
					<button
						className="pass-sound-toggle"
						role="switch"
						aria-label="Efectos de sonido"
						aria-checked={!sounds.muted}
						title={sounds.muted ? 'Activar sonidos' : 'Silenciar sonidos'}
						onClick={sounds.toggle}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M11 5 6 9H3v6h3l5 4Z" />
							{sounds.muted ? (
								<path d="m16 9 5 6m0-6-5 6" />
							) : (
								<>
									<path d="M15 8a6 6 0 0 1 0 8" />
									<path d="M18 5a10 10 0 0 1 0 14" />
								</>
							)}
						</svg>
					</button>
					{onExit && profile.completed && (
						<button
							className="pass-exit pass-text-button"
							disabled={entering || inserting}
							onClick={() => void exit()}
						>
							Cerrar
						</button>
					)}
				</div>
				<div className="pass-scene">
					<h1 ref={heading} tabIndex={-1} className="pass-sr-only">
						{steps[viewStep]}
					</h1>
					<AnimatePresence mode="wait">
						<motion.div
							key={scene}
							className={`pass-scene-content pass-scene-${scene}`}
							initial={{
								opacity: 0,
								y: reduced ? 0 : 22,
								filter: reduced ? 'none' : 'blur(4px)',
							}}
							animate={{
								opacity: 1,
								y: 0,
								filter: reduced ? 'none' : 'blur(0px)',
							}}
							exit={{
								opacity: 0,
								y: reduced ? 0 : -20,
								filter: reduced ? 'none' : 'blur(4px)',
								transition: { duration: 0.23, ease: [0.22, 1, 0.36, 1] },
							}}
							transition={{
								duration: reduced ? 0.16 : 0.42,
								ease: [0.22, 1, 0.36, 1],
							}}
							onAnimationComplete={() => {
								if (
									scene === 'card' &&
									latest.current.step === 3 &&
									latest.current.opened
								)
									setStickersReady(true)
							}}
						>
							{scene === 'letter' ? (
								<div className="pass-letter">
									<h2>Qué gusto verte, {profile.intro.name}.</h2>
									<p>{profile.intro.message}</p>
									<span className="pass-letter-signature">Leo</span>
								</div>
							) : scene === 'one-more' ? (
								<h2 className="pass-one-more">Una cosa más.</h2>
							) : scene === 'envelope' ? (
									<StickerEnvelope
										skin={draft.skin}
										onSound={sounds.play}
										onTear={sounds.tear}
									onOpen={() => {
										update({ opened: true })
										setStatus('Sobre abierto. Arrastra un sticker al pase.')
									}}
								/>
							) : (
								<div
									ref={cardStage}
									className="pass-card-stage"
									data-mode={mode}
								>
									<StickerEditor
										draft={draft}
										active={mode === 'stickers'}
										onChange={(stickers) => update({ stickers })}
										announce={setStatus}
										onSound={sounds.play}
									>
										{(stickerCard) => (
											<PassReader
												active={mode === 'reader'}
												onInsert={finish}
												onBusy={setInserting}
												onSound={sounds.play}
											>
												{(reader) => (
													<PassCarousel
														draft={draft}
														phase={holoPhase}
														onSelect={(skin) => {
															if (skin === draft.skin) return
															update({ skin })
														}}
														design={step === 2}
														mode={mode}
														reader={reader}
														stickerCard={stickerCard}
														identity={
															step === 1
																? {
																		back,
																		signing: back,
																		naming,
																		onSignature: (signature) =>
																			update({ signature }),
																		onName: (name) => update({ name }),
																		onNameDone: () => setNaming(false),
																		onErase: () => update({ signature: null }),
																	}
																: undefined
														}
													/>
												)}
											</PassReader>
										)}
									</StickerEditor>
								</div>
							)}
						</motion.div>
					</AnimatePresence>
				</div>
				<div className="pass-controls">
					<div className="pass-tuning">
						<AnimatePresence initial={false} mode="wait">
							{(step === 1 || step === 2) && (
								<TuningPanel
									key={step === 1 ? 'identity' : 'hologram'}
									reduced={reduced}
									delay={step === 2 && lastStep === 3 ? 0.14 : 0}
								>
									{step === 1 ? (
										<IdentityControls
											signing={back}
											naming={naming}
											signed={Boolean(draft.signature)}
											onName={() => setNaming(!naming)}
											onSign={() => {
												setNaming(false)
												setBack(!back)
											}}
										/>
									) : (
										<HologramControls
											draft={draft}
											phase={holoPhase}
											onChange={update}
										/>
									)}
								</TuningPanel>
							)}
							{step === 4 && !readerActive && (
								<TuningPanel key="download" reduced={reduced}>
									<PassDownload stage={cardStage} name={draft.name} />
								</TuningPanel>
							)}
						</AnimatePresence>
					</div>
					<PassNavigation
						visible={!back && (step !== 3 || stickersReady)}
						wide={readerActive}
						canBack={step > 0}
						disabled={entering || inserting}
						nextDisabled={
							step === 1 && (!draft.name.trim() || !draft.signature)
						}
						first={step === 0}
						onBack={() => {
							if (readerActive) {
								sounds.stop()
								sounds.play('celebrate', 0.16)
								setReaderActive(false)
							} else if (back || naming) {
								setBack(false)
								setNaming(false)
							} else go(step - 1)
						}}
						onNext={next}
					/>
					<div
						className={error ? 'pass-save-error' : 'pass-sr-only'}
						role="status"
						aria-live="polite"
					>
						{error ? (
							<>
								{error}
								<button
									className="pass-text-button"
									onClick={() =>
										readerActive
											? void finish(async () => {})
											: void save(latest.current)
									}
								>
									{readerActive ? 'Reintentar entrada' : 'Reintentar guardado'}
								</button>
							</>
						) : saving ? (
							'Guardando…'
						) : (
							status
						)}
					</div>
				</div>
			</main>
		</MotionConfig>
	)
}

function TuningPanel({
	children,
	reduced,
	delay = 0,
}: {
	children: ReactNode
	reduced: boolean
	delay?: number
}) {
	const present = useIsPresent()
	return (
		<motion.div
			className="pass-tuning-panel"
			inert={!present}
			aria-hidden={!present}
			initial={{ opacity: 0, filter: reduced ? 'none' : 'blur(4px)' }}
			animate={{ opacity: 1, filter: reduced ? 'none' : 'blur(0px)' }}
			exit={{
				opacity: 0,
				filter: reduced ? 'none' : 'blur(4px)',
				transition: { type: 'tween', duration: 0.16 },
			}}
			transition={{
				type: 'tween',
				duration: 0.24,
				delay,
				ease: [0.22, 1, 0.36, 1],
			}}
		>
			{children}
		</motion.div>
	)
}

export function DemoOnboarding() {
	const [version, setVersion] = useState(0),
		[complete, setComplete] = useState(false),
		[demo, setDemo] = useState('slime')
	const demos: Record<string, PassProfile['intro']> = {
		slime: {
			name: 'Sam',
			skin: 'slime',
			message:
				'Me contaste que te gustan los juegos cozy, así que pensé en crear algo para ti. Qué gusto compartir este espacio contigo. Ojalá te acompañe con las ideas que vienen.',
		},
		'long-dark': {
			name: 'Alex',
			skin: 'long-dark',
			message:
				'Me quedé pensando en lo que me contaste sobre dibujar y escribir historias. Quise crear algo para darte la bienvenida. Ojalá aquí encuentres herramientas para darles forma.',
		},
		halo: {
			name: 'Dani',
			skin: 'halo',
			message:
				'Me quedé con tus ganas de dibujar y trabajar en 3D, así que pensé en crear algo para ti. Tengo ganas de conocer las ideas que traigas a clase. Qué gusto compartir este espacio contigo.',
		},
	}
	const intro = demos[demo],
		previewKey = `xp-pass-demo-v2-${demo}`
	let draft = defaultPass(intro.name, intro.skin)
	try {
		const saved = JSON.parse(sessionStorage.getItem(previewKey) || 'null')
		if (validPass(saved)) draft = saved
	} catch {
		/* Optional local preview storage. */
	}
	function restart() {
		try {
			sessionStorage.removeItem(previewKey)
		} catch {
			/* Reset in memory too. */
		}
		setComplete(false)
		setVersion((v) => v + 1)
	}
	return (
		<>
			<details className="pass-review-bar">
				<summary>Prueba</summary>
				<div>
					<label htmlFor="demo-profile">Perfil ficticio</label>
					<select
						id="demo-profile"
						value={demo}
						onChange={(e) => {
							setDemo(e.target.value)
							setComplete(false)
							setVersion((v) => v + 1)
						}}
					>
						{Object.entries(demos).map(([id, d]) => (
							<option key={id} value={id}>
								{d.name} · {skins.find((s) => s.id === id)?.name}
							</option>
						))}
					</select>
					<button onClick={restart}>Repetir</button>
				</div>
			</details>
			{complete ? (
				<main className="pass-demo-complete">
					<h1>Ya estás dentro.</h1>
					<div className="pass-object">
						<PassCard draft={draft} />
					</div>
					<p>En el portal, aquí aparecen tus clases.</p>
					<button className="pass-primary" onClick={restart}>
						Volver a probar
					</button>
				</main>
			) : (
				<Onboarding
					key={`${demo}-${version}`}
					preview
					previewKey={previewKey}
					profile={{ intro, draft, completed: false, revision: 0 }}
					onComplete={() => setComplete(true)}
				/>
			)}
		</>
	)
}
