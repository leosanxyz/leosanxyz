import { useEffect, useRef, useState } from 'react'
import { type Editor } from 'tldraw'
import { insertEmoji } from './insertEmoji'
import { Icon } from '../components/Icon'
import data from './emoji-data.json'
import './emojis.css'

const categories = [
	['Caras y emociones', '☺'], ['Personas', '☝'], ['Animales y naturaleza', '♧'],
	['Comida', '♨'], ['Viajes y lugares', '♜'], ['Actividades', '⚽'],
	['Objetos', '♧'], ['Símbolos', 'Ω'], ['Banderas', '⚑'],
]
const tones = ['', '🏻', '🏼', '🏽', '🏾', '🏿']
type EmojiEntry = { e: string; n: string; v?: string[] }

export default function EmojiPicker({ editor, onClose }: { editor: Editor; onClose: () => void }) {
	const panelRef = useRef<HTMLElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const [active, setActive] = useState(0)
	const [tone, setTone] = useState(() => { try { return localStorage.getItem('xp-emoji-tone') ?? '' } catch { return '' } })
	const [recent, setRecent] = useState<string[]>(() => {
		try { const value = JSON.parse(localStorage.getItem('xp-emoji-recent') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 15) : [] } catch { return [] }
	})
	useEffect(() => {
		const previousFocus = document.activeElement
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Element && !panelRef.current?.contains(event.target) && !event.target.closest('[data-testid="ipad-toolbar.emojis"], .header-emojis')) onClose()
		}
		document.addEventListener('pointerdown', outside)
		panelRef.current?.focus()
		return () => { document.removeEventListener('pointerdown', outside); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus() }
	}, [onClose])
	function insert(emoji: string) {
		if (editor.getIsReadonly()) return
		const bounds = editor.getViewportScreenBounds(), panel = panelRef.current?.getBoundingClientRect()
		const point = editor.screenToPage({ x: ((panel?.right ?? bounds.x) + bounds.maxX) / 2, y: bounds.y + bounds.h / 2 })
		insertEmoji(editor, emoji, point)
		const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 15)
		setRecent(next)
		try { localStorage.setItem('xp-emoji-recent', JSON.stringify(next)) } catch { /* The picker also works in private mode. */ }
	}
	function glyph(entry: EmojiEntry) {
		if (!tone || !entry.v) return entry.e
		return entry.v.find((variant) => { const modifiers = variant.match(/\p{Emoji_Modifier}/gu); return modifiers?.every((modifier) => modifier === tone) }) ?? entry.e
	}
	function goTo(index: number) {
		setActive(index)
		const section = panelRef.current?.querySelector<HTMLElement>(`[data-emoji-group="${index}"]`)
		if (section && scrollRef.current) scrollRef.current.scrollTop = section.offsetTop - scrollRef.current.offsetTop
	}
	return <aside ref={panelRef} className="emoji-picker" data-testid="emoji-picker" aria-label="Emojis" tabIndex={-1}
		onPointerDown={(event) => { editor.markEventAsHandled(event); event.stopPropagation() }}
		onTouchStart={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()}
		onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') onClose() }}>
		<div className="emoji-picker__heading"><h2>Emojis</h2><button className="xp-icon-button" aria-label="Cerrar emojis" onClick={onClose}><Icon name="close" size={20} /></button></div>
		<div className="emoji-picker__tones" aria-label="Tono de piel">{tones.map((value, index) => <button key={index} aria-label={`Tono de piel ${index === 0 ? 'predeterminado' : index}`} aria-pressed={tone === value} onClick={() => { setTone(value); try { localStorage.setItem('xp-emoji-tone', value) } catch { /* Optional preference. */ } }}>{`👋${value}`}</button>)}</div>
		<div className="emoji-picker__scroll" ref={scrollRef}>
			{recent.length > 0 && <section className="emoji-picker__section"><h3>Recientes</h3><div className="emoji-picker__grid">{recent.map((emoji) => <button key={emoji} aria-label={`Insertar ${emoji}`} onClick={() => insert(emoji)}>{emoji}</button>)}</div></section>}
			{data.map((group, index) => <section key={group.name} data-emoji-group={index} className="emoji-picker__section"><h3>{categories[index][0]}</h3><div className="emoji-picker__grid">{group.emoji.map((entry) => {
				const emoji = glyph(entry)
				return <button key={entry.e} aria-label={`Insertar ${emoji}`} title={entry.n} onClick={() => insert(emoji)}>{emoji}</button>
			})}</div></section>)}
		</div>
		<nav className="emoji-picker__categories" aria-label="Categorías de emojis">{categories.map(([name, icon], index) => <button key={name} aria-label={name} aria-pressed={active === index} onClick={() => goTo(index)}>{icon}</button>)}</nav>
	</aside>
}
