import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useIsPresent, useMotionValue } from 'motion/react'
import { passHologram, updatePassDraft, type PassDraft, type PassProfile } from '../../../shared/pass'
import { Icon } from '../../components/Icon'
import { portalRequest } from '../api'
import { usePass } from './PassGate'
import { PassCarousel } from './PassCarousel'
import { PassDownload } from './PassDownload'
import { StickerEditor } from './StickerEditor'
import { HologramControls } from './HologramControls'
import { usePassSounds } from './usePassSounds'
import { usePassReducedMotion } from './usePassReducedMotion'

export function ProfilePass({ profile, account, initiallyEditing = false }: {
	profile: PassProfile
	account: ReactNode
	initiallyEditing?: boolean
}) {
	const { accept } = usePass()
	const [draft, setDraft] = useState(profile.draft)
	const [editing, setEditing] = useState(initiallyEditing), [back, setBack] = useState(false)
	const [announcement, announce] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
	const stage = useRef<HTMLDivElement>(null), editButton = useRef<HTMLButtonElement>(null), saving = useRef(false)
	const phase = useMotionValue(passHologram(draft).phase)
	const sounds = usePassSounds(), reduced = usePassReducedMotion()
	const dirty = editing && JSON.stringify(draft) !== JSON.stringify(profile.draft)
	const shownDraft = editing ? draft : profile.draft
	useEffect(() => {
		if (!dirty) return
		const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
		const leave = (event: Event) => {
			if (saving.current || !window.confirm('¿Salir sin guardar los cambios de tu pase?')) event.preventDefault()
		}
		window.addEventListener('beforeunload', warn)
		window.addEventListener('xp-before-navigation', leave)
		return () => {
			window.removeEventListener('beforeunload', warn)
			window.removeEventListener('xp-before-navigation', leave)
		}
	}, [dirty])
	function update(change: Partial<PassDraft>) { setDraft((current) => updatePassDraft(current, change)) }
	function begin() {
		setDraft(profile.draft)
		phase.set(passHologram(profile.draft).phase)
		setBack(false); setError(''); setEditing(true)
		requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>('.pass-carousel-card[data-selected="true"]')?.focus({ preventScroll: true }))
	}
	function finish() {
		setEditing(false)
		requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true }))
	}
	function cancel() {
		setDraft(profile.draft)
		phase.set(passHologram(profile.draft).phase)
		setError(''); finish()
	}
	async function save() {
		if (saving.current) return
		if (!dirty) { finish(); return }
		saving.current = true; setBusy(true); setError('')
		try {
			const saved = await portalRequest<PassProfile>('pass', 'PUT', { draft, revision: profile.revision, completed: true })
			accept(saved); setDraft(saved.draft); finish()
			announce('Pase guardado.')
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No pude guardar el pase. Tus cambios siguen aquí.')
		} finally { saving.current = false; setBusy(false) }
	}
	return <MotionConfig reducedMotion="user"><div className="portal-profile portal-profile-grid" data-has-pass="true" data-editing={editing}
		onPointerDownCapture={editing ? sounds.unlock : undefined} onKeyDownCapture={editing ? sounds.unlock : undefined}>
		<StickerEditor draft={shownDraft} active={editing && !back && !busy} inventoryVisible={editing} stationaryInventory
			onChange={(stickers) => update({ stickers })} announce={announce} onSound={sounds.play}>
			{(stickerCard) => <section className="profile-pass-panel" aria-labelledby="profile-pass-title">
				<h2 id="profile-pass-title" className="xp-sr-only">Mi pase</h2>
				<div className="profile-card-stage" ref={stage} inert={busy}>
					<PassCarousel unlockedSkins={profile.unlockedSkins} draft={shownDraft} phase={phase} design={editing && !back} mode={editing ? 'design' : 'celebration'} align="start"
						stickerCard={stickerCard} onSelect={(skin) => { if (skin !== draft.skin) update({ skin }) }}
						cardControls={{ back, actions: <div className="profile-pass-toolbar" role="group" aria-label="Opciones del pase">
							{!editing && <button ref={editButton} className="xp-icon-button" aria-label="Personalizar mi pase" title="Personalizar mi pase" onClick={begin}><Icon name="edit" size={20} /></button>}
							<PassDownload stage={stage} name={shownDraft.name} iconOnly side={back ? 'back' : 'front'} />
						</div>}} />
				</div>
				<button className="profile-pass-flip" aria-label="Girar pase" title="Girar pase" aria-pressed={back} disabled={busy} onClick={() => setBack(!back)}><Icon name="rotate" size={24} /></button>
				<AnimatePresence initial={false}>
					{editing && <ProfilePanel className="profile-edit-controls" key="tuning" reduced={reduced}>
						<div inert={busy}><HologramControls draft={draft} phase={phase} onChange={update} /></div>
						<div className="profile-save xp-dialog-actions">
							<button disabled={busy} onClick={cancel}>Cancelar</button>
							<button className="xp-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
							{error && <p className="xp-error" role="alert">{error}</p>}
						</div>
					</ProfilePanel>}
				</AnimatePresence>
			</section>}
		</StickerEditor>
		<AnimatePresence initial={false}>
			{!editing && <ProfilePanel key="account" className="profile-account-panel" reduced={reduced}>{account}</ProfilePanel>}
		</AnimatePresence>
		<div className="pass-sr-only" role="status" aria-live="polite">{announcement}</div>
	</div></MotionConfig>
}

function ProfilePanel({ children, className, reduced }: { children: ReactNode; className: string; reduced: boolean }) {
	const present = useIsPresent()
	return <motion.div className={className} inert={!present} aria-hidden={!present}
		initial={{ opacity: 0, filter: reduced ? 'none' : 'blur(4px)' }}
		animate={{ opacity: 1, filter: reduced ? 'none' : 'blur(0px)' }}
		exit={{ opacity: 0, filter: reduced ? 'none' : 'blur(4px)', transition: { duration: 0.16 } }}
		transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
	>{children}</motion.div>
}
