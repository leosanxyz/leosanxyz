import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { ContextMenu, Dialog, DropdownMenu } from 'radix-ui'
import type { BoardFolder } from '../../shared/boards'
import { Icon } from '../components/Icon'
import { navigate } from '../navigation'
import { usePortal } from '../portal/PortalProvider'
import { useShopNotice } from '../shop/shopNotice'
import './boards.css'

export interface FolderAction { label: string; onSelect: () => void; danger?: boolean }

export const BOARD_DRAG = 'application/x-xp-board', FOLDER_DRAG = 'application/x-xp-folder'

interface LibraryShellProps {
	title: ReactNode
	view: string
	folders: BoardFolder[]
	onViewChange: (view: string) => void
	children: ReactNode
	actions?: ReactNode
	testId?: string
	onBack?: () => void
	onNewFolder?: () => void
	onDropBoard?: (boardId: string, folderId: string | null) => void
	onDropFolder?: (folderId: string, parentId: string | null) => void
	folderActions?: (folder: BoardFolder) => FolderAction[]
	/** Folder whose name is being edited in place, started by double click or the folder menu. */
	renamingFolder?: string | null
	onRenameStart?: (folderId: string) => void
	/** `null` cancels the edit. */
	onRenameEnd?: (folderId: string, name: string | null) => void
	onLeaveLocal?: () => void
}

export function LibraryShell({ title, view, folders, onViewChange, children, actions, testId, onBack, onNewFolder, onDropBoard, onDropFolder, folderActions, renamingFolder, onRenameStart, onRenameEnd, onLeaveLocal }: LibraryShellProps) {
	const { user } = usePortal()
	const student = user?.role === 'student'
	const { hasNews } = useShopNotice(student ? user.id : undefined), newsId = useId()
	const [open, setOpen] = useState(false), [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 650px)').matches)
	const [collapsed, setCollapsed] = useState(new Set<string>()), [error, setError] = useState('')
	const [dropTarget, setDropTarget] = useState<string | null>(null)
	// Touch keeps long-press for the folder menu; dragging folders is a mouse and trackpad gesture.
	const [dragFolders] = useState(() => Boolean(onDropFolder) && window.matchMedia('(hover: hover) and (pointer: fine)').matches)
	useEffect(() => {
		const query = window.matchMedia('(max-width: 650px)')
		const update = () => { setMobile(query.matches); if (!query.matches) setOpen(false) }
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])
	// The folder being renamed must be on screen: open the mobile sidebar and expand its ancestors.
	useEffect(() => {
		if (!renamingFolder) return
		if (mobile) setOpen(true)
		setCollapsed((previous) => {
			const next = new Set(previous)
			let folder = folders.find((item) => item.id === renamingFolder)
			while (folder?.parentId && next.delete(folder.parentId)) folder = folders.find((item) => item.id === folder?.parentId)
			return next.size === previous.size ? previous : next
		})
	}, [renamingFolder, mobile, folders])
	function chooseView(next: string) { setOpen(false); onViewChange(next) }
	/** Drop handlers for a folder row, or for "Todos" when `folderId` is null. */
	function dropZone(folderId: string | null) {
		if (!onDropBoard && !onDropFolder) return {}
		const key = folderId ?? 'all'
		const accepts = (event: DragEvent) => (onDropBoard && event.dataTransfer.types.includes(BOARD_DRAG)) || (onDropFolder && event.dataTransfer.types.includes(FOLDER_DRAG))
		return {
			'data-drop-target': dropTarget === key || undefined,
			onDragOver: (event: DragEvent) => { if (accepts(event)) { event.preventDefault(); setDropTarget(key) } },
			onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) },
			onDrop: (event: DragEvent) => {
				event.preventDefault(); setDropTarget(null)
				const board = event.dataTransfer.getData(BOARD_DRAG), folder = event.dataTransfer.getData(FOLDER_DRAG)
				if (board) onDropBoard?.(board, folderId)
				else if (folder && folder !== folderId) onDropFolder?.(folder, folderId)
			},
		}
	}
	function folderTree(parentId: string | null, depth = 0): ReactNode {
		return folders.filter((folder) => folder.parentId === parentId).map((folder) => {
			const hasChildren = folders.some((child) => child.parentId === folder.id)
			const row = <div className="board-folder-row xp-reveal" style={{ paddingLeft: depth * 14 }} data-active={view === folder.id}>
				{renamingFolder === folder.id ? <div className="board-nav-item board-folder-editing">
					<Icon name="folder" size={20} /><FolderNameInput name={folder.name} onDone={(name) => onRenameEnd?.(folder.id, name)} />
				</div> : <button className="board-nav-item" aria-current={view === folder.id ? 'page' : undefined} onClick={() => chooseView(folder.id)} {...dropZone(folder.id)}
					onDoubleClick={onRenameStart ? () => onRenameStart(folder.id) : undefined}
					draggable={dragFolders} onDragStart={dragFolders ? (event) => event.dataTransfer.setData(FOLDER_DRAG, folder.id) : undefined}>
					<Icon name="folder" size={20} /><span>{folder.name}</span>
				</button>}
				{hasChildren && <button className="board-folder-toggle" aria-label={`${collapsed.has(folder.id) ? 'Expandir' : 'Contraer'} ${folder.name}`} aria-expanded={!collapsed.has(folder.id)} onClick={() => setCollapsed((previous) => { const next = new Set(previous); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next })}><Icon name="chevron" size={15} style={{ transform: collapsed.has(folder.id) ? undefined : 'rotate(90deg)' }} /></button>}
			</div>
			return <div key={folder.id}>
				{folderActions ? <ContextMenu.Root><ContextMenu.Trigger asChild>{row}</ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className="xp-menu board-folder-menu" aria-label={`Opciones de ${folder.name}`} onCloseAutoFocus={(event) => event.preventDefault()}>
					{folderActions(folder).map((action) => <FolderMenuItem key={action.label} action={action} onSelect={() => { setOpen(false); action.onSelect() }} />)}
				</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root> : row}
				{!collapsed.has(folder.id) && folderTree(folder.id, depth + 1)}
			</div>
		})
	}
	const sidebar = <>
		<div className="board-sidebar-heading"><span>{student ? 'Clases' : 'Canvases'}</span><div>
			{onNewFolder && <button className="xp-icon-button" aria-label="Nueva carpeta" title="Nueva carpeta" onClick={() => { setOpen(false); onNewFolder() }}><Icon name="folderPlus" /></button>}
			{mobile && <Dialog.Close className="xp-icon-button" aria-label="Cerrar carpetas"><Icon name="close" /></Dialog.Close>}
		</div></div>
		<nav className="board-navigation" aria-label={student ? 'Clases' : 'Canvases'}>
			<button className="board-nav-item" aria-current={view === 'all' ? 'page' : undefined} onClick={() => chooseView('all')} {...dropZone(null)}><Icon name="boards" /><span>{student ? 'Todas' : 'Todos'}</span></button>
			<button className="board-nav-item" aria-current={view === 'recent' ? 'page' : undefined} onClick={() => chooseView('recent')}><Icon name="recent" /><span>Recientes</span></button>
			{!student && <button className="board-nav-item" aria-current={view === 'favorites' ? 'page' : undefined} onClick={() => chooseView('favorites')}><Icon name="star" /><span>Favoritos</span></button>}
			{(folders.length > 0 || !student) && <div className={student ? 'board-folder-heading xp-reveal' : 'board-folder-heading'}>Carpetas</div>}
			{folderTree(null)}
		</nav>
		{student && <button className="board-nav-item board-nav-shop" aria-current={view === 'shop' ? 'page' : undefined} onClick={() => { setOpen(false); navigate('/tienda') }}>
			<Icon name="shop" /><span>Tienda</span>{hasNews && <i className="board-nav-dot" role="img" aria-label="Hay novedades en la tienda" />}
		</button>}
		<AccountMenu onNavigate={() => setOpen(false)} onTrash={!student ? () => chooseView('trash') : undefined} onLeaveLocal={onLeaveLocal} onError={setError} />
	</>
	return <Dialog.Root open={open} onOpenChange={setOpen}><main className="board-manager" data-testid={testId}>
		{mobile ? <Dialog.Portal><Dialog.Overlay className="board-sidebar-scrim" /><Dialog.Content className="board-sidebar board-sidebar-mobile" aria-describedby={undefined}>
			<Dialog.Title className="xp-sr-only">Carpetas de canvases</Dialog.Title>{sidebar}
		</Dialog.Content></Dialog.Portal> : <aside className="board-sidebar" aria-label="Carpetas de canvases">{sidebar}</aside>}
		<section className="board-main">
			<header className="board-header">
				{mobile && <Dialog.Trigger className="xp-icon-button board-sidebar-trigger" aria-label="Mostrar carpetas" aria-describedby={hasNews ? newsId : undefined}><Icon name="menu" />{hasNews && <i className="board-nav-dot" id={newsId} role="img" aria-label="Hay novedades en la tienda" />}</Dialog.Trigger>}
				{onBack && <button className="xp-icon-button" aria-label="Volver" title="Volver" onClick={onBack}><Icon name="arrowLeft" /></button>}
				<h1>{title}</h1>
				{actions && <div className="board-header-actions">{actions}</div>}
			</header>
			{error && <p className="xp-error board-error" role="alert">{error}</p>}
			{children}
		</section>
	</main></Dialog.Root>
}

function FolderNameInput({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
	const input = useRef<HTMLInputElement>(null), done = useRef(false)
	// Wait a frame so a closing menu cannot take the focus back.
	useEffect(() => { const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select() }); return () => cancelAnimationFrame(frame) }, [])
	function finish(value: string | null) {
		if (done.current) return
		done.current = true
		onDone(value === null || !value.trim() || value.trim() === name ? null : value)
	}
	return <input ref={input} className="board-folder-input" defaultValue={name} maxLength={120} aria-label="Nombre de la carpeta"
		onKeyDown={(event) => { if (event.key === 'Enter') finish(event.currentTarget.value); else if (event.key === 'Escape') finish(null) }}
		onBlur={(event) => finish(event.currentTarget.value)} />
}

function FolderMenuItem({ action, onSelect }: { action: FolderAction; onSelect: () => void }) {
	return <>
		{action.danger && <ContextMenu.Separator className="xp-menu-separator" />}
		<ContextMenu.Item className={action.danger ? 'xp-menu-item xp-menu-item--danger' : 'xp-menu-item'} onSelect={onSelect}>{action.label}</ContextMenu.Item>
	</>
}

function AccountMenu({ onNavigate, onTrash, onLeaveLocal, onError }: { onNavigate: () => void; onTrash?: () => void; onLeaveLocal?: () => void; onError: (error: string) => void }) {
	const { mode, user, logout } = usePortal()
	const [animate, setAnimate] = useState(false)
	const name = user?.name ?? 'Espacio local'
	const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase()
	const go = (path: string) => { onNavigate(); navigate(path) }
	return <DropdownMenu.Root><DropdownMenu.Trigger className="board-account-trigger" aria-label={`Cuenta de ${name}`} onPointerDown={() => setAnimate(true)} onKeyDown={() => setAnimate(false)}>
		<span className="board-account-avatar" aria-hidden="true">{initials}</span><span className="board-account-name">{name}</span><Icon name="chevron" size={16} />
	</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="xp-menu board-account-menu" data-animate={animate} onKeyDown={() => setAnimate(false)} side="top" align="start" sideOffset={8} collisionPadding={12}>
		{mode === 'portal' && <DropdownMenu.Item className="xp-menu-item" onSelect={() => go('/perfil')}><Icon name="user" size={19} />Mi perfil</DropdownMenu.Item>}
		{user?.role === 'teacher' && <DropdownMenu.Item className="xp-menu-item" onSelect={() => go('/alumnos')}><Icon name="users" size={19} />Alumnos</DropdownMenu.Item>}
		{user?.role === 'teacher' && mode === 'portal' && <DropdownMenu.Item className="xp-menu-item" onSelect={() => go('/tienda')}><Icon name="shop" size={19} />Ver la tienda</DropdownMenu.Item>}
		{onTrash && <DropdownMenu.Item className="xp-menu-item" onSelect={onTrash}><Icon name="trash" size={19} />Papelera</DropdownMenu.Item>}
		{import.meta.env.DEV && user?.role === 'teacher' && <DropdownMenu.Item className="xp-menu-item" onSelect={() => go('/bienvenida/revision')}><Icon name="boards" size={19} />Revisar bienvenidas</DropdownMenu.Item>}
		{mode === 'portal' && <><DropdownMenu.Separator className="xp-menu-separator" /><DropdownMenu.Item className="xp-menu-item" onSelect={() => { onNavigate(); void logout().catch(() => onError('No pude cerrar la sesión.')) }}><Icon name="logout" size={19} />Cerrar sesión</DropdownMenu.Item></>}
		{mode !== 'portal' && onLeaveLocal && <><DropdownMenu.Separator className="xp-menu-separator" /><DropdownMenu.Item className="xp-menu-item" onSelect={onLeaveLocal}><Icon name="logout" size={19} />Salir de edición</DropdownMenu.Item></>}
	</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}
