import { useSync } from '@tldraw/sync'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	Editor,
	atom,
	createUserId,
	UserRecordType,
	useValue,
	getUserPreferences,
	react,
	setUserPreferences,
	Tldraw,
	type TLUiAssetUrlOverrides,
	type TLUiOverrides,
} from 'tldraw'
import { getEditorSession } from '../access'
import {
	IpadToolbarProvider,
	SnapHoldButton,
	XP_CANVAS_COMPONENTS,
} from '../ipad/IpadToolbar'
import { createMultiplayerAssetStore, MAX_ASSET_BYTES } from '../multiplayerAssetStore'
import { PencilHoverPreview } from '../pencil/PencilHoverPreview'
import { installQuickShape } from '../quickShape/installQuickShape'
import { installFingerInput } from '../ipad/installFingerInput'
import { installInputDiagnostic } from '../ipad/installInputDiagnostic'
import { IMAGE_TYPES, VIDEO_TYPES } from '../../shared/resources'
import { CANVAS_SHAPE_UTILS } from '../resources/ResourceShapeUtil'
import { insertResource } from '../resources/insertResource'
import { restoreVideoPosters } from '../resources/restoreVideoPosters'
import { uploadLibraryFile } from '../resources/files'
import type { Board } from '../../shared/boards'
import { boardRequest } from '../boards/api'
import { installThumbnail } from '../boards/installThumbnail'
import { EditorCodeDialog } from '../components/EditorCodeDialog'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { navigate } from '../navigation'
import { CANVAS_TOOLS } from '../eraser/PartialEraserTool'
import { usePortal } from '../portal/PortalProvider'

const ResourceLibrary = lazy(() => import('../resources/ResourceLibrary'))
const EmojiPicker = lazy(() => import('../emojis/EmojiPicker'))

const TLDRAW_ASSET_URLS = {
	translations: {
		es: '/translations/es.json',
	},
} satisfies TLUiAssetUrlOverrides

const CANVAS_OPTIONS = { camera: { wheelBehavior: 'zoom' as const } }
const VIEWER_OVERRIDES: TLUiOverrides = {
	tools: (_editor, tools) => ({ hand: tools.hand }),
	actions: (_editor, actions) => Object.fromEntries(Object.entries(actions).filter(([id]) => id !== 'toggle-grid' && id !== 'select-all')),
}

type AccessState = 'checking' | 'viewer' | 'editor'

export function Room({ roomId }: { roomId: string }) {
	const [access, setAccess] = useState<AccessState>('checking')
	const [authRequired, setAuthRequired] = useState(true)
	const [board, setBoard] = useState<Board | null>(null)
	const [error, setError] = useState('')
	const onAccessChange = useCallback((isEditor: boolean) => setAccess(isEditor ? 'editor' : 'viewer'), [])

	useEffect(() => {
		let cancelled = false
		getEditorSession()
			.then(({ isEditor, authRequired }) => {
				if (!cancelled) { setAccess(isEditor ? 'editor' : 'viewer'); setAuthRequired(authRequired) }
			})
			.catch(() => {
				if (!cancelled) setAccess('viewer')
			})

		return () => {
			cancelled = true
		}
	}, [])

	useEffect(() => {
		const abort = new AbortController()
		void boardRequest<Board>(`boards/${roomId}`, 'GET', undefined, abort.signal).then(setBoard).catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'No pude abrir el canvas.') })
		return () => abort.abort()
	}, [roomId])

	if (error) return <div className="board-welcome"><p role="alert">{error}</p><button className="xp-primary" onClick={() => navigate('/')}>Mis canvases</button></div>
	if (access === 'checking' || !board) return <LoadingScreen />

	return (
		<CanvasRoom
			key={`${roomId}:${access}`}
			board={board}
			onBoardChange={setBoard}
			isEditor={access === 'editor'}
			authRequired={authRequired}
			onAccessChange={onAccessChange}
		/>
	)
}

function CanvasRoom({
	board,
	onBoardChange,
	isEditor,
	authRequired,
	onAccessChange,
}: {
	board: Board
	onBoardChange: (board: Board) => void
	isEditor: boolean
	authRequired: boolean
	onAccessChange: (isEditor: boolean) => void
}) {
	const roomId = board.id
	const { mode, user } = usePortal()
	const [editor, setEditor] = useState<Editor | null>(null)
	const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null)
	const [quickShape, setQuickShape] = useState(() => {
		try {
			return localStorage.getItem('xp-canvas-quick-shape') !== 'off'
		} catch {
			return true
		}
	})
	const [showUnlock, setShowUnlock] = useState(false)
	const [showResources, setShowResources] = useState(false)
	const [showEmojis, setShowEmojis] = useState(false)
	const [rename, setRename] = useState<string | null>(null)
	const [renaming, setRenaming] = useState(false)
	const closeResources = useCallback(() => setShowResources(false), [])
	const closeEmojis = useCallback(() => setShowEmojis(false), [])
	const toggleResources = useCallback(() => { setShowEmojis(false); setShowResources((open) => !open) }, [])
	const toggleEmojis = useCallback(() => { setShowResources(false); setShowEmojis((open) => !open) }, [])
	const [notice, setNotice] = useState<string | null>(null)
	const stageRef = useRef<HTMLElement>(null)
	const snapHeldRef = useRef(false)
	const snapContactRef = useRef(false)
	const handleSnapContactChange = useCallback((held: boolean) => {
		snapContactRef.current = held
	}, [])
	const handleSnapHeldChange = useCallback((held: boolean) => {
		snapHeldRef.current = held
	}, [])

	const assets = useMemo(() => createMultiplayerAssetStore(isEditor), [isEditor])
	const syncUri = useMemo(() => {
		return new URL(`/api/connect/${encodeURIComponent(roomId)}`, window.location.origin).toString()
	}, [roomId])
	const users = useMemo(() => user ? { currentUser: atom('portal user', UserRecordType.create({ id: createUserId(user.id), name: user.name, color: user.role === 'teacher' ? '#078aa3' : '#7555cc' })) } : undefined, [user?.id, user?.name, user?.role])
	const store = useSync({ uri: syncUri, assets, shapeUtils: CANVAS_SHAPE_UTILS, users })

	useEffect(() => {
		if (!isEditor) return
		let disposed = false
		const check = async () => {
			if (document.hidden) return
			try { if (!(await getEditorSession()).isEditor && !disposed) onAccessChange(false) }
			catch { /* A network failure should not masquerade as logging out. */ }
		}
		const interval = window.setInterval(check, 60_000)
		document.addEventListener('visibilitychange', check)
		return () => { disposed = true; clearInterval(interval); document.removeEventListener('visibilitychange', check) }
	}, [isEditor, onAccessChange])


	useEffect(() => {
		try {
			localStorage.setItem('xp-canvas-quick-shape', quickShape ? 'on' : 'off')
		} catch {
			// Private browsing can disable localStorage. The toggle still works for this session.
		}
	}, [quickShape])

	useEffect(() => {
		if (!import.meta.env.DEV || !editor || !isEditor ||
			new URLSearchParams(location.search).get('input-debug') !== '1') return
		return installInputDiagnostic(editor, () => snapHeldRef.current)
	}, [editor, isEditor])

	useEffect(() => {
		if (!editor) return
		return installFingerInput(editor, () => snapContactRef.current)
	}, [editor])

	useEffect(() => {
		if (!editor || !isEditor) return
		return installThumbnail(editor, roomId)
	}, [editor, isEditor, roomId])
	useEffect(() => {
		if (!editor || !isEditor) return
		return restoreVideoPosters(editor)
	}, [editor, isEditor])

	useEffect(() => {
		if (!editor || !isEditor || !quickShape) return
		return installQuickShape(editor, () => quickShape, () => snapHeldRef.current)
	}, [editor, isEditor, quickShape])

	useEffect(() => {
		if (!import.meta.env.DEV || !editor) return
		window.__xpCanvasEditor = editor
		return () => {
			if (window.__xpCanvasEditor === editor) delete window.__xpCanvasEditor
		}
	}, [editor])

	useEffect(() => {
		if (!notice) return
		const timeout = window.setTimeout(() => setNotice(null), 2600)
		return () => window.clearTimeout(timeout)
	}, [notice])

	function followLeo() {
		if (!editor) return
		const leo = editor
			.getCollaborators()
			.find((collaborator) => mode === 'portal' ? collaborator.userId === createUserId('teacher') : collaborator.userName.trim().toLocaleLowerCase() === 'leo')
		if (!leo) {
			setNotice('Leo no está conectado')
			return
		}
		editor.startFollowingUser(leo.userId)
		setNotice('Siguiendo a Leo')
	}

	const handleMount = useCallback((nextEditor: Editor) => {
		const preferences = getUserPreferences()
		const name = user?.name ?? (isEditor && authRequired ? 'Leo' : preferences.name?.trim() || 'Visitante')
		if (preferences.name !== name || preferences.locale !== 'es' || preferences.inputMode !== 'mouse' || user && preferences.id !== user.id) {
			setUserPreferences({ ...preferences, ...(user ? { id: user.id } : {}), name, locale: 'es', inputMode: 'mouse' })
		}
		setEditor(nextEditor)
		if (!isEditor) {
			nextEditor.updateInstanceState({ isReadonly: true, isGridMode: false })
			nextEditor.setCurrentTool('hand')
			// Escape in tldraw's hand tool normally returns to selection.
			return react('viewer navigation', () => {
				if (nextEditor.getCurrentToolId() !== 'hand') nextEditor.setCurrentTool('hand')
			})
		}
		if (isEditor) nextEditor.registerExternalContentHandler('files', async ({ files, point }) => {
			if (files.length > 20) { setNotice('Sube hasta 20 archivos a la vez.'); return }
			const center = point ?? nextEditor.getViewportPageBounds().center
			for (const [index, file] of files.entries()) {
				setNotice(`Guardando ${file.name}…`)
				try {
					const resource = await uploadLibraryFile(file)
					if (nextEditor.isDisposed) return
					insertResource(nextEditor, resource, { x: center.x + index * 24, y: center.y + index * 24 })
					setNotice('Archivo añadido al lienzo y a Recursos')
				} catch (cause) { setNotice(cause instanceof Error ? cause.message : 'No pude guardar el archivo.') }
			}
		})
	}, [isEditor, authRequired, user?.id, user?.name])

	if (mode === 'portal' && store.status === 'error') return <div className="board-welcome"><h1>No pude abrir este canvas</h1><p>Tu sesión o tus permisos pueden haber cambiado.</p><button className="xp-primary" onClick={() => navigate('/')}>Mis clases</button></div>

	return (
		<div className="canvas-room">
			<header className="canvas-header">
				<div className="canvas-identity"><button className="xp-icon-button" aria-label="Mis canvases" onClick={() => navigate('/')}><Icon name="back" /></button><button className="canvas-board-title" disabled={!isEditor} onClick={() => setRename(board.name)}>{board.name}</button><div ref={setHeaderTarget} className="canvas-header-settings" /></div>

				<nav className="canvas-actions" aria-label="Acciones del canvas">
					{mode === 'portal' && isEditor && <ConnectedStudents editor={editor} />}
					{isEditor && <><button type="button" className="header-resources" aria-expanded={showResources} disabled={!editor} onClick={toggleResources}>Recursos</button><button type="button" className="header-emojis" aria-expanded={showEmojis} disabled={!editor} onClick={toggleEmojis} aria-label="Emojis"><Icon name="smile" size={20} /></button></>}
					{isEditor && (
						<>
							<label
								className="quick-shape-toggle header-quick-shape"
								title="Convierte un trazo sostenido en una figura"
							>
								<input
									type="checkbox"
									checked={quickShape}
									onChange={(event) => setQuickShape(event.target.checked)}
								/>
								<span>QuickShape</span>
							</label>
							<SnapHoldButton
								editor={editor}
								disabled={!quickShape}
								onHeldChange={handleSnapHeldChange}
							onContactChange={handleSnapContactChange}
							/>
						</>
					)}
					<button
						type="button"
						className="canvas-action--secondary"
						onClick={followLeo}
						disabled={!editor}
					>
						Seguir a Leo
					</button>
					{authRequired && !isEditor && mode !== 'portal' && (
						<button type="button" className="primary-action" onClick={() => setShowUnlock(true)}>
							Editar
						</button>
					)}
				</nav>
			</header>

			<main ref={stageRef} className="canvas-stage">
				<IpadToolbarProvider
					value={{
						isEditor,
						headerTarget,
						quickShape,
						onQuickShapeChange: setQuickShape,
						onSnapHeldChange: handleSnapHeldChange,
						onSnapContactChange: handleSnapContactChange,
							onResourcesToggle: toggleResources,
							resourcesOpen: showResources,
							onEmojisToggle: toggleEmojis,
							emojisOpen: showEmojis,
					}}
				>
					<Tldraw
						store={store}
						assetUrls={TLDRAW_ASSET_URLS}
						components={XP_CANVAS_COMPONENTS}
						options={CANVAS_OPTIONS}
						overrides={isEditor ? undefined : VIEWER_OVERRIDES}
						initialState={isEditor ? 'select' : 'hand'}
						shapeUtils={CANVAS_SHAPE_UTILS}
						tools={CANVAS_TOOLS}
						licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY || undefined}
						locale="es"
						maxAssetSize={MAX_ASSET_BYTES}
						acceptedImageMimeTypes={IMAGE_TYPES}
						acceptedVideoMimeTypes={VIDEO_TYPES}
						onMount={handleMount}
					/>
				</IpadToolbarProvider>
				<PencilHoverPreview stageRef={stageRef} />
				{isEditor && editor && showResources && <Suspense fallback={<div className="canvas-notice">Abriendo recursos…</div>}>
					<ResourceLibrary editor={editor} onClose={closeResources} />
				</Suspense>}
				{isEditor && editor && showEmojis && <Suspense fallback={null}><EmojiPicker editor={editor} onClose={closeEmojis} /></Suspense>}
			</main>

			{showUnlock && mode !== 'portal' && (
				<EditorCodeDialog
					onClose={() => setShowUnlock(false)}
					onUnlock={() => {
						setShowUnlock(false)
						onAccessChange(true)
					}}
				/>
			)}
			{notice && <div className="canvas-notice">{notice}</div>}
			{rename !== null && <Modal title="Renombrar canvas" onClose={() => { if (!renaming) setRename(null) }}><form className="xp-form" onSubmit={(event) => {
				event.preventDefault(); if (!rename.trim() || renaming) return
				setRenaming(true)
				void boardRequest<Board>(`boards/${roomId}`, 'PATCH', { name: rename }).then((updated) => { onBoardChange(updated); setRename(null) }).catch((cause) => setNotice(cause instanceof Error ? cause.message : 'No pude renombrar el canvas.')).finally(() => setRenaming(false))
			}}><label>Nombre<input value={rename} onChange={(event) => setRename(event.target.value)} autoFocus maxLength={120} onFocus={(event) => event.target.select()} /></label><div className="xp-dialog-actions"><button type="button" onClick={() => setRename(null)} disabled={renaming}>Cancelar</button><button className="xp-primary" disabled={renaming || !rename.trim()}>Guardar</button></div></form></Modal>}
		</div>
	)
}
function ConnectedStudents({ editor }: { editor: Editor | null }) {
	const students = useValue('connected students', () => [...new Map((editor?.getCollaborators() ?? []).filter((peer) => peer.userId !== createUserId('teacher')).map((peer) => [peer.userId, peer])).values()], [editor])
	return <details className="portal-presence"><summary>{students.length} {students.length === 1 ? 'alumno conectado' : 'alumnos conectados'}</summary><ul>{students.length ? students.map((student) => <li key={student.userId}>{student.userName}</li>) : <li>Todavía no hay alumnos conectados.</li>}</ul></details>
}
function LoadingScreen() {
	return (
		<div className="app-loading">
			<span className="canvas-mark" aria-hidden="true" />
			<p>Abriendo el canvas…</p>
		</div>
	)
}
