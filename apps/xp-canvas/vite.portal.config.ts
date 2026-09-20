import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
	if (command === 'serve' && !process.env.XP_CANVAS_STATE_PATH) throw new Error('El portal local exige XP_CANVAS_STATE_PATH para no tocar los canvases existentes.')
	const qa = process.env.XP_PORTAL_QA === '1'
	if (qa && command !== 'serve') throw new Error('Las credenciales de QA nunca pueden entrar en un build.')
	return {
		cacheDir: process.env.XP_CANVAS_STATE_PATH ? `${process.env.XP_CANVAS_STATE_PATH}/vite-cache` : undefined,
		plugins: [cloudflare({
			configPath: 'wrangler.portal.toml',
			...(process.env.XP_CANVAS_STATE_PATH ? { persistState: { path: process.env.XP_CANVAS_STATE_PATH } } : {}),
			...(qa ? { config: { vars: { PORTAL_BOOTSTRAP_PASSWORD: 'qa-teacher-password-only-local', PORTAL_PASSWORD_PEPPER: 'qa-pepper-for-isolated-tests-not-production-12345678' } } } : {}),
		}), react()],
		optimizeDeps: { include: ['@tldraw/validate'] },
		server: { host: '127.0.0.1', port: 5177, strictPort: true },
		css: { postcss: { plugins: [] } },
	}
})
