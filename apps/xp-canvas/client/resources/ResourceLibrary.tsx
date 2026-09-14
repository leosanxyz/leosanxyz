import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { DropdownMenu } from 'radix-ui'
import type { Editor } from 'tldraw'
import type { Resource, ResourceFolder, ResourceFolders } from '../../shared/resources'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { boardRequest } from '../boards/api'
import { insertResource } from './insertResource'
import { uploadLibraryFile } from './files'
import { ResourceThumbnail } from './ResourceThumbnail'
import './resources.css'

type FolderDialog = { kind: 'new' | 'rename'; name: string; folder?: ResourceFolder }
type MoveDialog = { kind: 'move'; resource: Resource; destination: string | null }
type DeleteDialog = { kind: 'delete'; resource: Resource }

export default function ResourceLibrary({ editor, onClose }: { editor: Editor; onClose: () => void }) {
	const [resources, setResources] = useState<Resource[]>([])
	const [folders, setFolders] = useState<ResourceFolder[]>([])
	const [folderId, setFolderId] = useState<string | null>(null)
	const [dialog, setDialog] = useState<FolderDialog | MoveDialog | DeleteDialog | null>(null)
	const [saving, setSaving] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const panelRef = useRef<HTMLElement>(null), listRef = useRef<HTMLDivElement>(null), sentinelRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null), ghostRef = useRef<HTMLDivElement>(null)
	const cancelButtonRef = useRef<HTMLButtonElement>(null)
	const mounted = useRef(true), loading = useRef(false), uploading = useRef(false), skipClick = useRef(false)
	const cursor = useRef<string | null | undefined>(undefined)
	const removed = useRef(new Set<string>())
	const loadMore = useRef<() => void>(() => {})
	const drag = useRef<{ resource: Resource; pointerId: number; x: number; y: number; active: boolean } | null>(null)
	const folder = folders.find((item) => item.id === folderId)
	const visibleResources = resources.filter((resource) => (resource.folderId ?? null) === folderId)
	const childFolders = folders.filter((item) => item.parentId === folderId)

	useEffect(() => {
		mounted.current = true
		const abort = new AbortController(), previousFocus = document.activeElement
		void boardRequest<ResourceFolders>('resource-folders', 'GET', undefined, abort.signal)
			.then((data) => { if (mounted.current) setFolders(data.folders) })
			.catch((cause) => { if (!abort.signal.aborted) setError(errorText(cause)) })
		async function load() {
			if (loading.current || cursor.current === null || abort.signal.aborted) return
			loading.current = true
			try {
				const response = await fetch(`/api/resources${cursor.current ? `?cursor=${encodeURIComponent(cursor.current)}` : ''}`, { signal: abort.signal, cache: 'no-store' })
				if (!response.ok) throw new Error('No pude cargar los archivos.')
				const data = await response.json() as { resources: Resource[]; cursor: string | null }
				if (!mounted.current) return
				cursor.current = data.cursor
				setResources((items) => [...new Map([...items, ...data.resources.filter((r) => r.kind !== 'emoji' && !removed.current.has(r.id))].map((r) => [r.id, r])).values()])
				requestAnimationFrame(() => { if (listRef.current && sentinelRef.current && sentinelRef.current.getBoundingClientRect().top < listRef.current.getBoundingClientRect().bottom + 120) void load() })
			} catch (cause) { if (!abort.signal.aborted) setError(errorText(cause)) }
			finally { loading.current = false }
		}
		loadMore.current = () => { void load() }
		const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void load() }, { root: listRef.current, rootMargin: '120px' })
		if (sentinelRef.current) observer.observe(sentinelRef.current)
		void load()
		const cancel = () => { drag.current = null; if (ghostRef.current) ghostRef.current.hidden = true }
		const outside = (event: PointerEvent) => {
			const target = event.target
			if (target instanceof Element && !panelRef.current?.contains(target) && !target.closest('[data-testid="ipad-toolbar.resources"], .header-resources, .xp-dialog, .xp-dialog-overlay, .xp-menu')) onClose()
		}
		window.addEventListener('blur', cancel); document.addEventListener('pointerdown', outside)
		panelRef.current?.focus()
		return () => {
			mounted.current = false; abort.abort(); observer.disconnect()
			window.removeEventListener('blur', cancel); document.removeEventListener('pointerdown', outside)
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
		}
	}, [onClose])

	useEffect(() => {
		if (listRef.current) listRef.current.scrollTop = 0
		loadMore.current()
	}, [folderId])

	// A folder can have files beyond the first R2 page. Continue until its panel is filled.
	useEffect(() => {
		const list = listRef.current
		if (list && list.scrollHeight <= list.clientHeight + 120) loadMore.current()
	}, [resources, folders, folderId])

	async function moveTo(resource: Resource, destination: string | null) {
		await boardRequest(`resources/${resource.id}`, 'PATCH', { folderId: destination })
		if (mounted.current) setResources((items) => items.map((item) => item.id === resource.id ? { ...item, folderId: destination } : item))
	}

	async function saveDialog() {
		if (!dialog || saving) return
		setSaving(true); setError('')
		try {
			if (dialog.kind === 'move') await moveTo(dialog.resource, dialog.destination)
			else if (dialog.kind === 'delete') {
				await boardRequest<void>(`resources/${dialog.resource.id}`, 'DELETE')
				removed.current.add(dialog.resource.id)
				if (mounted.current) setResources((items) => items.filter((item) => item.id !== dialog.resource.id))
			}
			else {
				const result = await boardRequest<ResourceFolder>(dialog.kind === 'new' ? 'resource-folders' : `resource-folders/${dialog.folder!.id}`,
					dialog.kind === 'new' ? 'POST' : 'PATCH', { name: dialog.name, ...(dialog.kind === 'new' ? { parentId: folderId } : {}) })
				setFolders((items) => [...items.filter((item) => item.id !== result.id), result])
			}
			setDialog(null)
		} catch (cause) { setError(errorText(cause)) }
		finally { setSaving(false) }
	}

	async function upload(files: File[]) {
		if (uploading.current || !files.length) return
		if (files.length > 20) { setError('Elige hasta 20 archivos a la vez.'); return }
		uploading.current = true; setBusy(true); setError('')
		const failures: string[] = []
		for (const file of files) {
			try {
				const resource = await uploadLibraryFile(file)
				if (folderId) {
					await boardRequest(`resources/${resource.id}`, 'PATCH', { folderId })
					resource.folderId = folderId
				}
				if (mounted.current) setResources((items) => [resource, ...items.filter((item) => item.id !== resource.id)])
			} catch (cause) { failures.push(`${file.name}: ${errorText(cause)}`) }
		}
		uploading.current = false
		if (mounted.current) { setBusy(false); setError(failures.join(' · ')) }
	}
	function place(resource: Resource, point?: { x: number; y: number }) {
		try {
			const bounds = editor.getViewportScreenBounds(), panel = panelRef.current?.getBoundingClientRect()
			const screen = point ?? { x: ((panel?.right ?? bounds.x) + bounds.maxX) / 2, y: bounds.y + bounds.h / 2 }
			insertResource(editor, resource, editor.screenToPage(screen))
		} catch (cause) { setError(errorText(cause)) }
	}
	function start(event: ReactPointerEvent, resource: Resource) {
		if (event.button !== 0) return
		event.stopPropagation(); editor.markEventAsHandled(event)
		if (event.pointerType !== 'touch') event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		skipClick.current = false
		drag.current = { resource, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false }
	}
	function move(event: ReactPointerEvent) {
		const current = drag.current
		if (!current || current.pointerId !== event.pointerId) return
		event.stopPropagation()
		if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return
		current.active = true; skipClick.current = true
		const ghost = ghostRef.current!
		ghost.hidden = false; ghost.textContent = current.resource.name
		ghost.style.transform = `translate3d(${event.clientX + 12}px, ${event.clientY + 12}px, 0)`
	}
	function end(event: ReactPointerEvent, cancelled = false) {
		const current = drag.current
		if (!current || current.pointerId !== event.pointerId) return
		drag.current = null; ghostRef.current!.hidden = true
		event.stopPropagation()
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
		if (cancelled || !current.active) return
		const target = document.elementFromPoint(event.clientX, event.clientY)
		const folderTarget = target?.closest('[data-resource-folder]')
		if (folderTarget) {
			void moveTo(current.resource, folderTarget.getAttribute('data-resource-folder') || null).catch((cause) => setError(errorText(cause)))
			return
		}
		if (!target?.closest('.tl-canvas') || target.closest('.resource-library, .emoji-picker, .ipad-toolbar, .tlui-layout')) return
		place(current.resource, { x: event.clientX, y: event.clientY })
	}
	return <aside ref={panelRef} className="resource-library" aria-label="Recursos" data-testid="resource-library" tabIndex={-1}
		onKeyDown={(event) => {
			event.stopPropagation()
			if (event.key === 'Escape') { if (dialog) { if (!saving) setDialog(null) } else if (!(event.target instanceof Element && event.target.closest('.xp-menu'))) onClose() }
		}}
		onPointerDown={(event) => { editor.markEventAsHandled(event); event.stopPropagation() }}
		onTouchStart={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()}
		onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation() } }}
		onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void upload(Array.from(event.dataTransfer.files)) }}>
		<div className="resource-library__heading">
			{folder && <button className="xp-icon-button" aria-label="Carpeta anterior" data-resource-folder={folder.parentId ?? ''} onClick={() => setFolderId(folder.parentId)}><Icon name="back" size={20} /></button>}
			<h2 title={folder?.name}>{folder?.name ?? 'Recursos'}</h2>
			<button className="xp-icon-button" aria-label="Nueva carpeta de recursos" title="Nueva carpeta" onClick={() => setDialog({ kind: 'new', name: '' })}><Icon name="folderPlus" size={20} /></button>
			<button type="button" className="xp-icon-button" aria-label="Cerrar recursos" onClick={onClose}><Icon name="close" size={20} /></button>
		</div>
		<button type="button" className="resource-upload" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Subiendo…' : 'Subir archivos'}</button>
		<input ref={inputRef} type="file" multiple hidden aria-label="Archivos para recursos" onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
		{error && <p className="resource-library__error" role="alert">{error}</p>}
		<div ref={listRef} className="resource-library__list" aria-busy={busy}>
			{childFolders.map((child) => <div key={child.id} className="resource-entry" data-resource-folder={child.id}>
				<button className="resource-card resource-folder" aria-label={`Abrir carpeta ${child.name}`} onClick={() => setFolderId(child.id)}><span className="resource-card__preview"><Icon name="folder" size={52} /></span><span className="resource-card__name">{child.name}</span></button>
				<DropdownMenu.Root><DropdownMenu.Trigger className="xp-icon-button resource-entry__menu" aria-label={`Opciones de carpeta ${child.name}`}><Icon name="more" size={18} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="xp-menu" align="end"><DropdownMenu.Item className="xp-menu-item" onSelect={() => setDialog({ kind: 'rename', name: child.name, folder: child })}>Renombrar carpeta</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
			</div>)}
			{visibleResources.map((resource) => <div key={resource.id} className="resource-entry">
			<button type="button" className="resource-card" data-resource-id={resource.id} aria-label={`Insertar ${resource.name}`}
				onPointerDown={(event) => start(event, resource)} onPointerMove={move} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)} onLostPointerCapture={(event) => end(event, true)}
				onClick={() => { if (!skipClick.current) place(resource) }}>
				<ResourceThumbnail resource={resource} onPreview={(previewSrc) => setResources((items) => items.map((item) => item.id === resource.id ? { ...item, previewSrc } : item))} />
				<span className="resource-card__name" title={resource.name}>{resource.name}</span>
			</button>
			<DropdownMenu.Root><DropdownMenu.Trigger className="xp-icon-button resource-entry__menu" aria-label={`Opciones de ${resource.name}`}><Icon name="more" size={18} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="xp-menu" align="end">
				<DropdownMenu.Item className="xp-menu-item" onSelect={() => setDialog({ kind: 'move', resource, destination: resource.folderId ?? null })}>Mover a carpeta</DropdownMenu.Item>
				<DropdownMenu.Separator className="xp-menu-separator" />
				<DropdownMenu.Item className="xp-menu-item xp-menu-item--danger" onSelect={() => { setError(''); setDialog({ kind: 'delete', resource }) }}><Icon name="trash" size={18} />Eliminar</DropdownMenu.Item>
			</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
			</div>)}
			<div ref={sentinelRef} className="resource-library__sentinel" />
		</div>
		<div ref={ghostRef} className="resource-drag-ghost" hidden aria-hidden="true" />
		{dialog && <Modal title={dialog.kind === 'delete' ? 'Eliminar de Recursos' : dialog.kind === 'move' ? 'Mover archivo' : dialog.kind === 'new' ? 'Nueva carpeta' : 'Renombrar carpeta'} initialFocusRef={dialog.kind === 'delete' ? cancelButtonRef : undefined} onClose={() => { if (!saving) setDialog(null) }}>
			<form className="xp-form" onSubmit={(event) => { event.preventDefault(); void saveDialog() }}>
				{dialog.kind === 'delete' ? <div className="resource-delete-message"><p>¿Eliminar <strong>{dialog.resource.name}</strong> de Recursos?</p><p>Las copias que ya están en tus canvases se conservarán.</p></div>
					: dialog.kind === 'move' ? <label>Carpeta de destino<select value={dialog.destination ?? ''} onChange={(event) => setDialog({ ...dialog, destination: event.target.value || null })}><option value="">Recursos</option>{folders.map((item) => <option key={item.id} value={item.id}>{folderPath(item, folders)}</option>)}</select></label>
					: <label>Nombre<input autoFocus maxLength={120} value={dialog.name} onChange={(event) => setDialog({ ...dialog, name: event.target.value })} /></label>}
				{error && <p role="alert" className="xp-error">{error}</p>}
				<div className="xp-dialog-actions"><button ref={cancelButtonRef} type="button" disabled={saving} onClick={() => setDialog(null)}>Cancelar</button><button className={dialog.kind === 'delete' ? 'xp-danger' : 'xp-primary'} disabled={saving || ((dialog.kind === 'new' || dialog.kind === 'rename') && !dialog.name.trim())}>{dialog.kind === 'delete' ? saving ? 'Eliminando…' : 'Eliminar' : dialog.kind === 'move' ? 'Mover' : 'Guardar'}</button></div>
			</form>
		</Modal>}
	</aside>
}
function errorText(cause: unknown) { return cause instanceof Error ? cause.message : 'No se pudo guardar el archivo.' }
function folderPath(folder: ResourceFolder, folders: ResourceFolder[]) {
	const names = [folder.name], seen = new Set([folder.id])
	let parent = folders.find((item) => item.id === folder.parentId)
	while (parent && !seen.has(parent.id)) {
		names.unshift(parent.name); seen.add(parent.id)
		parent = folders.find((item) => item.id === parent?.parentId)
	}
	return names.join(' / ')
}
