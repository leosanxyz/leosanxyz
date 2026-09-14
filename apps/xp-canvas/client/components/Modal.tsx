import { Dialog } from 'radix-ui'
import type { ReactNode, RefObject } from 'react'
import { Icon } from './Icon'
import './ui.css'

export function Modal({ title, children, onClose, initialFocusRef }: { title: string; children: ReactNode; onClose: () => void; initialFocusRef?: RefObject<HTMLElement | null> }) {
	return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
		<Dialog.Portal><Dialog.Overlay className="xp-dialog-overlay" /><Dialog.Content className="xp-dialog" aria-describedby={undefined}
			onOpenAutoFocus={(event) => { if (initialFocusRef?.current) { event.preventDefault(); initialFocusRef.current.focus() } }}>
			<div className="xp-dialog-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="xp-icon-button" aria-label="Cerrar"><Icon name="close" /></Dialog.Close></div>
			{children}
		</Dialog.Content></Dialog.Portal>
	</Dialog.Root>
}
