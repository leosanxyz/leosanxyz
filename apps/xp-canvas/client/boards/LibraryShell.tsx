import { useEffect, useState, type ReactNode } from 'react'
import { Dialog, DropdownMenu } from 'radix-ui'
import type { BoardFolder } from '../../shared/boards'
import { Icon } from '../components/Icon'
import { navigate } from '../navigation'
import { usePortal } from '../portal/PortalProvider'
import './boards.css'

interface LibraryShellProps {
	title: string
	view: string
	folders: BoardFolder[]
	onViewChange: (view: string) => void
	children: ReactNode
	actions?: ReactNode
	testId?: string
	onBack?: () => void
	onNewFolder?: () => void
	onDropBoard?: (boardId: string, folderId: string) => void
	onLeaveLocal?: () => void
}

export function LibraryShell({ title, view, folders, onViewChange, children, actions, testId, onBack, onNewFolder, onDropBoard, onLeaveLocal }: LibraryShellProps) {
	const { user } = usePortal()
	const student = user?.role === 'student'
	const [open, setOpen] = useState(false), [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 650px)').matches)
	const [collapsed, setCollapsed] = useState(new Set<string>()), [error, setError] = useState('')
	useEffect(() => {
		const query = window.matchMedia('(max-width: 650px)')
		const update = () => { setMobile(query.matches); if (!query.matches) setOpen(false) }
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])
	function chooseView(next: string) { setOpen(false); onViewChange(next) }
	function folderTree(parentId: string | null, depth = 0): ReactNode {
		return folders.filter((folder) => folder.parentId === parentId).map((folder) => {
			const hasChildren = folders.some((child) => child.parentId === folder.id)
			return <div key={folder.id}>
				<div className="board-folder-row" style={{ paddingLeft: depth * 14 }} data-active={view === folder.id}>
					<button className="board-nav-item" aria-current={view === folder.id ? 'page' : undefined} onClick={() => chooseView(folder.id)}
						onDragOver={onDropBoard ? (event) => { if (event.dataTransfer.types.includes('application/x-xp-board')) event.preventDefault() } : undefined}
						onDrop={onDropBoard ? (event) => { event.preventDefault(); const id = event.dataTransfer.getData('application/x-xp-board'); if (id) onDropBoard(id, folder.id) } : undefined}>
						<Icon name="folder" size={20} /><span>{folder.name}</span>
					</button>
					{hasChildren && <button className="board-folder-toggle" aria-label={`${collapsed.has(folder.id) ? 'Expandir' : 'Contraer'} ${folder.name}`} aria-expanded={!collapsed.has(folder.id)} onClick={() => setCollapsed((previous) => { const next = new Set(previous); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next })}><Icon name="chevron" size={15} style={{ transform: collapsed.has(folder.id) ? undefined : 'rotate(90deg)' }} /></button>}
				</div>
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
			<button className="board-nav-item" aria-current={view === 'all' ? 'page' : undefined} onClick={() => chooseView('all')}><Icon name="boards" /><span>{student ? 'Todas' : 'Todos'}</span></button>
			<button className="board-nav-item" aria-current={view === 'recent' ? 'page' : undefined} onClick={() => chooseView('recent')}><Icon name="recent" /><span>Recientes</span></button>
			{!student && <button className="board-nav-item" aria-current={view === 'favorites' ? 'page' : undefined} onClick={() => chooseView('favorites')}><Icon name="star" /><span>Favoritos</span></button>}
			{(folders.length > 0 || !student) && <div className="board-folder-heading">Carpetas</div>}
			{folderTree(null)}
		</nav>
		<AccountMenu onNavigate={() => setOpen(false)} onTrash={!student ? () => chooseView('trash') : undefined} onLeaveLocal={onLeaveLocal} onError={setError} />
	</>
	return <Dialog.Root open={open} onOpenChange={setOpen}><main className="board-manager" data-testid={testId}>
		{mobile ? <Dialog.Portal><Dialog.Overlay className="board-sidebar-scrim" /><Dialog.Content className="board-sidebar board-sidebar-mobile" aria-describedby={undefined}>
			<Dialog.Title className="xp-sr-only">Carpetas de canvases</Dialog.Title>{sidebar}
		</Dialog.Content></Dialog.Portal> : <aside className="board-sidebar" aria-label="Carpetas de canvases">{sidebar}</aside>}
		<section className="board-main">
			<header className="board-header">
				{mobile && <Dialog.Trigger className="xp-icon-button board-sidebar-trigger" aria-label="Mostrar carpetas"><Icon name="menu" /></Dialog.Trigger>}
				{onBack && <button className="xp-icon-button" aria-label="Volver" title="Volver" onClick={onBack}><Icon name="arrowLeft" /></button>}
				<h1>{title}</h1>
				{actions && <div className="board-header-actions">{actions}</div>}
			</header>
			{error && <p className="xp-error board-error" role="alert">{error}</p>}
			{children}
		</section>
	</main></Dialog.Root>
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
		{onTrash && <DropdownMenu.Item className="xp-menu-item" onSelect={onTrash}><Icon name="trash" size={19} />Papelera</DropdownMenu.Item>}
		{import.meta.env.DEV && user?.role === 'teacher' && <DropdownMenu.Item className="xp-menu-item" onSelect={() => go('/bienvenida/revision')}><Icon name="boards" size={19} />Revisar bienvenidas</DropdownMenu.Item>}
		{mode === 'portal' && <><DropdownMenu.Separator className="xp-menu-separator" /><DropdownMenu.Item className="xp-menu-item" onSelect={() => { onNavigate(); void logout().catch(() => onError('No pude cerrar la sesión.')) }}><Icon name="logout" size={19} />Cerrar sesión</DropdownMenu.Item></>}
		{mode !== 'portal' && onLeaveLocal && <><DropdownMenu.Separator className="xp-menu-separator" /><DropdownMenu.Item className="xp-menu-item" onSelect={onLeaveLocal}><Icon name="logout" size={19} />Salir de edición</DropdownMenu.Item></>}
	</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}
