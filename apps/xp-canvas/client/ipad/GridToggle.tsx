import { useEditor, useValue } from 'tldraw'

export function GridToggle() {
	const editor = useEditor()
	const enabled = useValue('grid enabled', () => editor.getInstanceState().isGridMode, [editor])
	return (
		<button
			type="button"
			className="canvas-grid-toggle"
			data-testid="canvas-grid-toggle"
			aria-label="Cuadrícula y ajuste"
			aria-pressed={enabled}
			title="Activar o desactivar la cuadrícula y el ajuste a sus puntos"
			onPointerDown={(event) => {
				editor.markEventAsHandled(event)
				event.stopPropagation()
			}}
			onClick={() => editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode })}
		>
			<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
				{[4, 10, 16].flatMap(y => [4, 10, 16].map(x =>
					<circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />
				))}
			</svg>
		</button>
	)
}
