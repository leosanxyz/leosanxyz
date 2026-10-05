import { useState } from 'react'
import { createShapeId, type Editor } from 'tldraw'
import type { MailboxShape } from '../../shared/mailboxShape'
import { Modal } from '../components/Modal'
import { MAILBOX_HEIGHT, MAILBOX_WIDTH } from './MailboxShapeUtil'

export function MailboxDialog({ editor, shape, onClose }: { editor: Editor; shape: MailboxShape | null; onClose: () => void }) {
	const [prompt, setPrompt] = useState(shape?.props.prompt ?? '')
	return <Modal title={shape ? 'Editar buzón' : 'Nuevo buzón'} onClose={onClose}>
		<form className="xp-form" onSubmit={(event) => {
			event.preventDefault(); if (!prompt.trim()) return
			editor.markHistoryStoppingPoint('mailbox')
			if (shape) {
				if (editor.getShape(shape.id)) editor.updateShape<MailboxShape>({ id: shape.id, type: 'mailbox', props: { prompt: prompt.trim() } })
			} else {
				const id = createShapeId(), center = editor.getViewportPageBounds().center
				editor.createShape<MailboxShape>({ id, type: 'mailbox', x: center.x - MAILBOX_WIDTH / 2, y: center.y - MAILBOX_HEIGHT / 2, props: { prompt: prompt.trim() } })
				editor.setCurrentTool('select').select(id)
			}
			onClose()
		}}>
			<label>¿Qué quieres que te escriban?<textarea autoFocus maxLength={200} rows={3} required value={prompt} placeholder="Un detalle que demuestre que alguien se esforzó de más" onChange={(event) => setPrompt(event.target.value)} /></label>
			<p>Los alumnos escriben cuando abres el buzón. Nadie ve las cartas hasta que sacas una.</p>
			<div className="xp-dialog-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="xp-primary" disabled={!prompt.trim()}>{shape ? 'Guardar' : 'Añadir al canvas'}</button></div>
		</form>
	</Modal>
}
