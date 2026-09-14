import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

async function loadEditorCode() {
	if (process.env.EDITOR_CODE) return process.env.EDITOR_CODE
	try {
		const local = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'))
		if (local.EDITOR_CODE) return local.EDITOR_CODE
	} catch (error) {
		if (error.code !== 'ENOENT') throw error
	}
	throw new Error('Define EDITOR_CODE en el entorno o en apps/xp-canvas/.dev.vars antes de ejecutar las pruebas.')
}

export const editorCode = await loadEditorCode()
