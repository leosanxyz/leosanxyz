import { useSync } from '@tldraw/sync'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	Editor,
	getUserPreferences,
	serializeTldrawJsonBlob,
	setUserPreferences,
	Tldraw,
	type TLUiAssetUrlOverrides,
} from 'tldraw'
import {
	closeEditorSession,
	getEditorSession,
	getViewerUrl,
} from '../access'
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

const ResourceLibrary = lazy(() => import('../resources/ResourceLibrary'))
const EmojiPicker = lazy(() => import('../emojis/EmojiPicker'))

const TLDRAW_ASSET_URLS = {
	translations: {
		es: '/translations/es.json',
	},
} satisfies TLUiAssetUrlOverrides

type AccessState = 'checking' | 'viewer' | 'editor'

export function Room({ roomId }: { roomId: string }) {
	const [access, setAccess] = useState<AccessState>('checking')
	const [board, setBoard] = useState<Board | null>(null)
	const [error, setError] = useState('')
	const onAccessChange = useCallback((isEditor: boolean) => setAccess(isEditor ? 'editor' : 'viewer'), [])

	useEffect(() => {
		let cancelled = false
		getEditorSession()
			.then((isEditor) => {
				if (!cancelled) setAccess(isEditor ? 'editor' : 'viewer')
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
			onAccessChange={onAccessChange}
		/>
	)
}

function CanvasRoom({
	board,
	onBoardChange,
	isEditor,
	onAccessChange,
}: {
	board: Board
	onBoardChange: (board: Board) => void
	isEditor: boolean
	onAccessChange: (isEditor: boolean) => void
}) {
	const roomId = board.id
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
	const store = useSync({ uri: syncUri, assets, shapeUtils: CANVAS_SHAPE_UTILS })

	useEffect(() => {
		if (!isEditor) return
		let disposed = false
		const check = async () => {
			if (document.hidden) return
			try { if (!(await getEditorSession()) && !disposed) onAccessChange(false) }
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

	async function copy(text: string, message: string) {
		try {
			await navigator.clipboard.writeText(text)
			setNotice(message)
		} catch {
			setNotice('No pude copiar el enlace')
		}
	}

	async function exportRoom() {
		if (!editor) return
		try {
		const blob = await serializeTldrawJsonBlob(editor)
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = `${roomId}.tldr`
		link.click()
		window.setTimeout(() => URL.revokeObjectURL(url), 0)
		setNotice('Copia descargada')
		} catch { setNotice('No pude exportar la copia. Comprueba la conexión y vuelve a intentar.') }
	}

	function followLeo() {
		if (!editor) return
		const leo = editor
			.getCollaborators()
			.find((collaborator) => collaborator.userName.trim().toLocaleLowerCase() === 'leo')
		if (!leo) {
			setNotice('Leo no está conectado')
			return
		}
		editor.startFollowingUser(leo.userId)
		setNotice('Siguiendo a Leo')
	}

	const handleMount = useCallback((nextEditor: Editor) => {
		const preferences = getUserPreferences()
		const name = isEditor ? 'Leo' : preferences.name?.trim() || 'Visitante'
		if (preferences.name !== name || preferences.locale !== 'es') {
			setUserPreferences({ ...preferences, name, locale: 'es' })
		}
		setEditor(nextEditor)
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
	}, [isEditor])

	return (
		<div className="canvas-room">
			<header className="canvas-header">
				<div className="canvas-identity"><button className="xp-icon-button" aria-label="Mis canvases" onClick={() => navigate('/')}><Icon name="back" /></button><button className="canvas-board-title" disabled={!isEditor} onClick={() => setRename(board.name)}>{board.name}</button><div ref={setHeaderTarget} className="canvas-header-settings" /></div>

				<nav className="canvas-actions" aria-label="Acciones del canvas">
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
					<button
						type="button"
						className="canvas-action--share"
						onClick={() => copy(getViewerUrl(), 'Enlace para observar copiado')}
					>
						Compartir
					</button>
					<button
						type="button"
						className="canvas-action--secondary"
						onClick={exportRoom}
						disabled={!editor}
					>
						Guardar copia
					</button>
					{isEditor ? (
						<details className="access-menu">
							<summary data-testid="editor-menu.trigger">Editor</summary>
							<div className="access-menu__panel">
								<button
									type="button"
									data-testid="editor-menu.exit"
										onClick={async () => {
										try { await closeEditorSession(); onAccessChange(false) }
										catch { setNotice('No pude cerrar la sesión. Comprueba la conexión.') }
									}}
								>
									Salir de edición
								</button>
							</div>
						</details>
					) : (
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

			{showUnlock && (
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
function LoadingScreen() {
	return (
		<div className="app-loading">
			<span className="canvas-mark" aria-hidden="true" />
			<p>Abriendo el canvas…</p>
		</div>
	)
}
