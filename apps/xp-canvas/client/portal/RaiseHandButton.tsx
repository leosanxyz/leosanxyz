import { useValue, type Editor } from 'tldraw'

export function RaiseHandButton({ editor }: { editor: Editor | null }) {
	const raised = useValue('my raised hand', () => editor?.getInstanceState().meta.handRaised === true, [editor])
	return <button
		type="button"
		className="canvas-raise-hand"
		aria-pressed={raised}
		disabled={!editor}
		onClick={() => {
			if (!editor) return
			const { meta } = editor.getInstanceState()
			editor.updateInstanceState({ meta: { ...meta, handRaised: meta.handRaised !== true } })
		}}
	>
		<span className="hand-raise-emoji" aria-hidden="true">🖐️</span>
		<span>{raised ? 'Bajar la mano' : 'Levantar la mano'}</span>
	</button>
}
