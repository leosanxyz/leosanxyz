import { GridToggle } from './GridToggle'
import { ImageToolbarWithDelete, SelectionActions, VideoToolbarWithDelete } from './SelectionActions'
import { Icon } from '../components/Icon'
import {
	DefaultStylePanel,
	DefaultMenuPanel,
	DefaultQuickActions,
	type TLUiQuickActionsProps,
	useValue,
	DefaultToolbar,
	HandToolbarItem,
	MobileStylePanel,
	TldrawUiButtonIcon,
	TldrawUiOrientationProvider,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	type Editor,
	type TLComponents,
	type TLUiStylePanelProps,
	useActions,
	useCanRedo,
	useCanUndo,
	useEditor,
	useIsToolSelected,
	useTools,
} from 'tldraw'
import { createPortal } from 'react-dom'
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react'

const SIDE_TOOLBAR_MEDIA_QUERY = '(min-width: 600px)'
const IPAD_TOOLS = [
	{ id: 'select', label: 'Seleccionar' },
	{ id: 'draw', label: 'Lápiz' },
	{ id: 'eraser', label: 'Borrador' },
	{ id: 'laser', label: 'Puntero láser' },
	{ id: 'line', label: 'Línea' },
	{ id: 'arrow', label: 'Flecha' },
	{ id: 'rectangle', label: 'Rectángulo' },
	{ id: 'ellipse', label: 'Elipse' },
	{ id: 'triangle', label: 'Triángulo' },
	{ id: 'text', label: 'Texto' },
	{ id: 'asset', label: 'Imagen' },
	{ id: 'hand', label: 'Mano' },
] as const

interface IpadToolbarState {
	isEditor: boolean
	headerTarget: HTMLElement | null
	quickShape: boolean
	onQuickShapeChange: (enabled: boolean) => void
	onSnapHeldChange: (held: boolean) => void
	onSnapContactChange: (held: boolean) => void
	onResourcesToggle: () => void
	resourcesOpen: boolean
	onEmojisToggle: () => void
	emojisOpen: boolean
}

const IpadToolbarContext = createContext<IpadToolbarState | null>(null)

export const XP_CANVAS_COMPONENTS: TLComponents = {
	Toolbar: ResponsiveToolbar,
	InFrontOfTheCanvas: CanvasOverlayControls,
	ImageToolbar: ImageToolbarWithDelete,
	VideoToolbar: VideoToolbarWithDelete,
	MenuPanel: HeaderMenuPanel,
	QuickActions: ResponsiveQuickActions,
	StylePanel: ResponsiveStylePanel,
}

function CanvasOverlayControls() {
	const { isEditor } = useIpadToolbarState()
	return isEditor ? <><GridToggle /><SelectionActions /></> : null
}

export function IpadToolbarProvider({
	children,
	value,
}: {
	children: ReactNode
	value: IpadToolbarState
}) {
	return <IpadToolbarContext.Provider value={value}>{children}</IpadToolbarContext.Provider>
}

function HeaderMenuPanel() {
	const { headerTarget } = useIpadToolbarState()
	const editor = useEditor()
	const colorMode = useValue('header color mode', () => editor.getColorMode(), [editor])
	if (!headerTarget) return null
	return createPortal(
		<div className={`canvas-page-settings tl-container tl-theme__${colorMode}`}>
			<DefaultMenuPanel />
		</div>,
		headerTarget
	)
}

function ResponsiveQuickActions(props: TLUiQuickActionsProps) {
	const hasSideToolbar = useSideToolbar(), { isEditor } = useIpadToolbarState()
	return hasSideToolbar || !isEditor ? null : <DefaultQuickActions {...props} />
}

function ResponsiveToolbar() {
	const hasSideToolbar = useSideToolbar()
	const { isEditor } = useIpadToolbarState()

	if (!isEditor) return <DefaultToolbar minItems={1} minSizePx={44}><HandToolbarItem /></DefaultToolbar>
	if (!hasSideToolbar) return <DefaultToolbar />

	return <IpadToolRail />
}

function ResponsiveStylePanel(props: TLUiStylePanelProps) {
	const hasSideToolbar = useSideToolbar()
	const { isEditor } = useIpadToolbarState()

	if (!isEditor || hasSideToolbar && !props.isMobile) return null
	return <DefaultStylePanel {...props} />
}

function IpadToolRail() {
	const editor = useEditor()
	const railRef = useRef<HTMLElement>(null)
	const actions = useActions()
	const canUndo = useCanUndo()
	const canRedo = useCanRedo()
	const { quickShape, onQuickShapeChange, onSnapHeldChange, onSnapContactChange, onResourcesToggle, resourcesOpen, onEmojisToggle, emojisOpen } = useIpadToolbarState()

	useEffect(() => {
		const rail = railRef.current
		if (!rail) return
		// Keep native touch events out of tldraw's edge-navigation guard.
		// Do not preventDefault: Safari needs the native click, and tools need scrolling.
		const isolateTouch = (event: TouchEvent) => {
			editor.markEventAsHandled(event)
			event.stopPropagation()
		}
		const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const
		for (const name of events) rail.addEventListener(name, isolateTouch, { passive: true })
		return () => {
			for (const name of events) rail.removeEventListener(name, isolateTouch)
		}
	}, [editor])

	const isolatePointer = useCallback(
		(event: { nativeEvent: Event; stopPropagation: () => void }) => {
			editor.markEventAsHandled(event)
			event.stopPropagation()
		},
		[editor]
	)

	return (
		<aside
			ref={railRef}
			className="ipad-toolbar"
			data-testid="ipad-toolbar"
			aria-label="Herramientas del canvas"
		>
			<TldrawUiOrientationProvider orientation="vertical" tooltipSide="right">
				<div className="ipad-toolbar__body">
					<div className="ipad-toolbar__tools-scroll">
						<TldrawUiToolbar
							className="ipad-toolbar__tools"
							orientation="vertical"
							label="Herramientas de dibujo"
						>
							{IPAD_TOOLS.map((tool) => (
								<IpadToolButton key={tool.id} {...tool} />
							))}
							<TldrawUiToolbarButton type="icon" title="Recursos" aria-label="Recursos" aria-expanded={resourcesOpen}
								data-testid="ipad-toolbar.resources" onPointerDown={isolatePointer} onClick={onResourcesToggle}>
								<Icon name="folder" size={20} />
							</TldrawUiToolbarButton>
							<TldrawUiToolbarButton type="icon" title="Emojis" aria-label="Emojis" aria-expanded={emojisOpen}
								data-testid="ipad-toolbar.emojis" onPointerDown={isolatePointer} onClick={onEmojisToggle}>
								<Icon name="smile" size={21} />
							</TldrawUiToolbarButton>
						</TldrawUiToolbar>
					</div>

					<TldrawUiToolbar
						className="ipad-toolbar__properties"
						orientation="vertical"
						label="Propiedades"
					>
						<MobileStylePanel />
						<TldrawUiToolbarButton
							type="icon"
							title="QuickShape"
							aria-pressed={quickShape}
							isActive={quickShape}
							data-testid="ipad-toolbar.quick-shape"
							onPointerDown={isolatePointer}
							onClick={() => onQuickShapeChange(!quickShape)}
						>
							<TldrawUiButtonIcon icon="check-circle" />
						</TldrawUiToolbarButton>
					</TldrawUiToolbar>

					<TldrawUiToolbar
						className="ipad-toolbar__footer"
						orientation="vertical"
						label="Historial y ajuste"
					>
						<TldrawUiToolbarButton
							type="icon"
							title="Deshacer"
							disabled={!canUndo}
							data-testid="ipad-toolbar.undo"
							onPointerDown={isolatePointer}
							onClick={() => actions.undo.onSelect('toolbar')}
						>
							<TldrawUiButtonIcon icon="undo" />
						</TldrawUiToolbarButton>
						<TldrawUiToolbarButton
							type="icon"
							title="Rehacer"
							disabled={!canRedo}
							data-testid="ipad-toolbar.redo"
							onPointerDown={isolatePointer}
							onClick={() => actions.redo.onSelect('toolbar')}
						>
							<TldrawUiButtonIcon icon="redo" />
						</TldrawUiToolbarButton>
						<SnapHoldButton
							editor={editor}
							disabled={!quickShape}
							compact
							onHeldChange={onSnapHeldChange}
							onContactChange={onSnapContactChange}
						/>
					</TldrawUiToolbar>
				</div>
			</TldrawUiOrientationProvider>
		</aside>
	)
}

function IpadToolButton({ id, label }: (typeof IPAD_TOOLS)[number]) {
	const editor = useEditor()
	const tools = useTools()
	const tool = tools[id]
	const isSelected = useIsToolSelected(tool)

	if (!tool) return null

	return (
		<TldrawUiToolbarButton
			type="tool"
			title={label}
			aria-pressed={isSelected}
			isActive={isSelected}
			data-testid={`tools.${id}`}
			data-value={id}
			onPointerDown={(event) => {
				editor.markEventAsHandled(event)
				event.stopPropagation()
			}}
			onClick={() => tool.onSelect('toolbar')}
		>
			<TldrawUiButtonIcon icon={tool.icon} />
		</TldrawUiToolbarButton>
	)
}

export function SnapHoldButton({
	editor,
	disabled,
	compact = false,
	onHeldChange,
	onContactChange,
}: {
	editor: Editor | null
	disabled: boolean
	compact?: boolean
	onHeldChange: (held: boolean) => void
	onContactChange: (held: boolean) => void
}) {
	const [held, setHeld] = useState(false)
	const [latched, setLatchedState] = useState(false)
	const latchedRef = useRef(false)
	const heldRef = useRef(false)
	const touchStart = useRef({ time: 0, x: 0, y: 0, moved: false })
	const setLatched = useCallback((next: boolean) => {
		latchedRef.current = next
		setLatchedState(next)
		onHeldChange(heldRef.current || next)
	}, [onHeldChange])
	const pointerId = useRef<number | null>(null)
	const touchId = useRef<number | null>(null)
	const buttonRef = useRef<HTMLButtonElement>(null)

	const updateHeld = useCallback(
		(nextHeld: boolean) => {
			heldRef.current = nextHeld
			setHeld(nextHeld)
			onContactChange(nextHeld)
			onHeldChange(nextHeld || latchedRef.current)
		},
		[onHeldChange, onContactChange]
	)
	const isolateFromCanvas = useCallback(
		(event: { nativeEvent: Event; stopPropagation: () => void }) => {
			editor?.markEventAsHandled(event)
			event.stopPropagation()
		},
		[editor]
	)
	const releaseHeld = useCallback(
		(ownerPointerId?: number) => {
			if (ownerPointerId !== undefined && pointerId.current !== ownerPointerId) return
			const activePointerId = pointerId.current
			touchId.current = null
			pointerId.current = null
			if (
				activePointerId !== null &&
				buttonRef.current?.hasPointerCapture(activePointerId)
			) {
				buttonRef.current.releasePointerCapture(activePointerId)
			}
			updateHeld(false)
		},
		[updateHeld]
	)
	useEffect(() => {
		if (disabled) {
			setLatched(false)
			releaseHeld()
		}
	}, [disabled, releaseHeld, setLatched])

	useEffect(() => {
		const release = () => releaseHeld()
		window.addEventListener('blur', release)
		document.addEventListener('visibilitychange', release)
		return () => {
			window.removeEventListener('blur', release)
			document.removeEventListener('visibilitychange', release)
			const activePointerId = pointerId.current
			if (
				activePointerId !== null &&
				buttonRef.current?.hasPointerCapture(activePointerId)
			) {
				buttonRef.current.releasePointerCapture(activePointerId)
			}
			pointerId.current = null
			touchId.current = null
			onHeldChange(false)
			onContactChange(false)
		}
	}, [onHeldChange, onContactChange, releaseHeld])

	useEffect(() => {
		const button = buttonRef.current
		if (!button) return
		// Safari can suppress the Pencil stream while a finger touch is cancelled.
		// Use the native touch identifier for the held finger, without cancelling
		// default behavior or explicitly capturing its PointerEvent stream.
		const start = (event: TouchEvent) => {
			editor?.markEventAsHandled(event)
			event.stopPropagation()
			if (disabled || touchId.current !== null || pointerId.current !== null) return
			const touch = Array.from(event.changedTouches).find(touch =>
				(touch as Touch & { touchType?: string }).touchType !== 'stylus')
			if (!touch) return
			touchId.current = touch.identifier
			touchStart.current = { time: performance.now(), x: touch.clientX, y: touch.clientY, moved: false }
			updateHeld(true)
		}
		const move = (event: TouchEvent) => {
			const touch = Array.from(event.changedTouches).find(touch => touch.identifier === touchId.current)
			if (touch && Math.hypot(touch.clientX - touchStart.current.x, touch.clientY - touchStart.current.y) > 12) {
				touchStart.current.moved = true
			}
			editor?.markEventAsHandled(event)
			event.stopPropagation()
		}
		const end = (event: TouchEvent) => {
			if (!Array.from(event.changedTouches).some(touch => touch.identifier === touchId.current)) return
			editor?.markEventAsHandled(event)
			event.stopPropagation()
			if (event.type === 'touchend' && !touchStart.current.moved &&
				performance.now() - touchStart.current.time < 300) {
				setLatched(!latchedRef.current)
			}
			releaseHeld()
		}
		button.addEventListener('touchstart', start, { passive: true })
		button.addEventListener('touchmove', move, { passive: true })
		window.addEventListener('touchend', end, { capture: true, passive: true })
		window.addEventListener('touchcancel', end, { capture: true, passive: true })
		return () => {
			button.removeEventListener('touchstart', start)
			button.removeEventListener('touchmove', move)
			window.removeEventListener('touchend', end, true)
			window.removeEventListener('touchcancel', end, true)
		}

	}, [editor, disabled, updateHeld, releaseHeld, setLatched])

	return (
		<button
			ref={buttonRef}
			type="button"
			className={`snap-hold${compact ? ' snap-hold--compact tlui-button tlui-button__icon' : ''}`}
			disabled={disabled}
			aria-label="Snap"
			aria-pressed={held || latched}
			data-latched={latched}
			aria-keyshortcuts="Shift"
			data-testid={compact ? 'ipad-toolbar.snap' : undefined}
			title="Toca para activar o desactivar Snap. También puedes mantener presionado o usar Shift."
			onPointerDown={(event) => {
				isolateFromCanvas(event)
				if (event.pointerType === 'touch') return
				if (disabled || event.button !== 0 || pointerId.current !== null) return
				event.preventDefault()
				pointerId.current = event.pointerId
				try {
					event.currentTarget.setPointerCapture(event.pointerId)
				} catch {
					// Synthetic pointer events may not be capturable. The held state still works.
				}
				updateHeld(true)
			}}
			onPointerMove={(event) => {
				isolateFromCanvas(event)
				if (pointerId.current === event.pointerId) event.preventDefault()
			}}
			onPointerUp={(event) => {
				isolateFromCanvas(event)
				releaseHeld(event.pointerId)
			}}
			onPointerCancel={(event) => {
				isolateFromCanvas(event)
				releaseHeld(event.pointerId)
			}}
			onLostPointerCapture={(event) => {
				isolateFromCanvas(event)
				releaseHeld(event.pointerId)
			}}
			onKeyDown={(event) => {
				event.stopPropagation()
				if (event.key !== ' ' && event.key !== 'Enter') return
				event.preventDefault()
				if (!event.repeat) updateHeld(true)
			}}
			onKeyUp={(event) => {
				event.stopPropagation()
				if (event.key !== ' ' && event.key !== 'Enter') return
				event.preventDefault()
				updateHeld(false)
			}}
			onBlur={() => {
				if (touchId.current === null && pointerId.current === null) releaseHeld()
			}}
			onClick={(event) => {
				event.preventDefault()
				// Assistive technology may activate a button with a click but no pointer sequence.
				if (event.detail === 0 && pointerId.current === null) setLatched(!latchedRef.current)
			}}
			onContextMenu={(event) => event.preventDefault()}
		>
			<span className="snap-hold__glyph" aria-hidden="true">⌜</span>
			<span className="snap-hold__label">Snap</span>
		</button>
	)
}

function useIpadToolbarState() {
	const state = useContext(IpadToolbarContext)
	if (!state) throw new Error('IpadToolbarProvider is missing')
	return state
}

function useSideToolbar() {
	const [matches, setMatches] = useState(() =>
		typeof window === 'undefined' ? false : window.matchMedia(SIDE_TOOLBAR_MEDIA_QUERY).matches
	)

	useEffect(() => {
		const media = window.matchMedia(SIDE_TOOLBAR_MEDIA_QUERY)
		const update = () => setMatches(media.matches)
		update()
		media.addEventListener('change', update)
		return () => media.removeEventListener('change', update)
	}, [])

	return matches
}
