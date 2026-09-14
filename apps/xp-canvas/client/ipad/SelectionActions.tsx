import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Box, DefaultImageToolbar, DefaultVideoToolbar, TldrawUiContextualToolbar, useActions, useEditor, useValue } from 'tldraw'
import { Icon } from '../components/Icon'

export function SelectionActions() {
	const editor = useEditor()
	const show = useValue('selection toolbar', () => {
		const only = editor.getOnlySelectedShape()
		return editor.isInAny('select.idle', 'select.pointing_shape') && !editor.getEditingShapeId() &&
			only?.type !== 'image' && only?.type !== 'video' && !editor.getIsReadonly() &&
			editor.getSelectedShapes().some((shape) => !editor.isShapeOrAncestorLocked(shape))
	}, [editor])
	const getSelectionBounds = useCallback(() => {
		const bounds = editor.getSelectionScreenBounds()
		return bounds ? new Box(bounds.x, bounds.y, bounds.w, 0) : undefined
	}, [editor])
	if (!show) return null
	return <TldrawUiContextualToolbar label="Acciones de selección" getSelectionBounds={getSelectionBounds}><DeleteSelection /></TldrawUiContextualToolbar>
}

function DeleteSelection() {
	const editor = useEditor(), actions = useActions()
	const canDelete = useValue('deletable selection', () => !editor.getIsReadonly() &&
		editor.getSelectedShapes().some((shape) => !editor.isShapeOrAncestorLocked(shape)), [editor])
	if (!canDelete) return null
	return <button type="button" className="canvas-selection-delete" aria-label="Eliminar selección" title="Eliminar selección" data-testid="delete-selection"
		onPointerDown={(event) => { editor.markEventAsHandled(event); event.stopPropagation() }}
		onTouchStart={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()}
		onClick={() => actions.delete.onSelect('toolbar')}><Icon name="trash" size={21} /></button>
}

// The native toolbar owns crop/alt-text state but exposes no append slot. Keep it
// intact and attach only our action, inside its toolbar rather than over the canvas.
function MediaToolbarActions({ children }: { children: ReactNode }) {
	const root = useRef<HTMLDivElement>(null)
	const [target, setTarget] = useState<HTMLElement | null>(null)
	useLayoutEffect(() => {
		const element = root.current!
		const update = () => setTarget(element.querySelector<HTMLElement>('.tlui-media__toolbar > .tlui-menu'))
		update()
		const observer = new MutationObserver(update)
		observer.observe(element, { childList: true, subtree: true })
		return () => observer.disconnect()
	}, [])
	return <div ref={root} style={{ display: 'contents' }}>{children}{target && createPortal(<DeleteSelection />, target)}</div>
}

export function ImageToolbarWithDelete() { return <MediaToolbarActions><DefaultImageToolbar /></MediaToolbarActions> }
export function VideoToolbarWithDelete() { return <MediaToolbarActions><DefaultVideoToolbar /></MediaToolbarActions> }
