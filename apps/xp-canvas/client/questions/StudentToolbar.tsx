import { DefaultToolbar, HandToolbarItem, TldrawUiMenuItem, useEditor, useValue } from 'tldraw'
import { useQuestion } from './QuestionContext'

export function StudentToolbar() {
	const editor = useEditor()
	const { canAnswer } = useQuestion()
	const selected = useValue('student cursor', () => editor.getCurrentToolId() === 'select', [editor])
	return <DefaultToolbar minItems={2} minSizePx={88}>
		<TldrawUiMenuItem id="select" icon="tool-pointer" label="tool.select" readonlyOk
			disabled={!canAnswer} isSelected={selected} onSelect={() => { if (canAnswer) editor.setCurrentTool('select') }} />
		<HandToolbarItem />
	</DefaultToolbar>
}
