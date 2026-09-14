import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

if (!process.env.XP_CANVAS_STATE_PATH) throw new Error('Isolated state required')
export default defineConfig({
	cacheDir: `${process.env.XP_CANVAS_STATE_PATH}/vite-cache`,
	plugins: [cloudflare({ config: { vars: { EDITOR_AUTH_REQUIRED: 'true' } }, persistState: { path: process.env.XP_CANVAS_STATE_PATH } }), react()],
	optimizeDeps: { include: ['@tldraw/validate'] },
	css: { postcss: { plugins: [] } },
})
