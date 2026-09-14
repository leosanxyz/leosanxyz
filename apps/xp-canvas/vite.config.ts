import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		cacheDir: process.env.XP_CANVAS_STATE_PATH ? `${process.env.XP_CANVAS_STATE_PATH}/vite-cache` : undefined,
		plugins: [cloudflare(process.env.XP_CANVAS_STATE_PATH ? { persistState: { path: process.env.XP_CANVAS_STATE_PATH } } : {}), react()],
		optimizeDeps: { include: ['@tldraw/validate'] },
		server: {
			port: 5174,
			strictPort: true,
			allowedHosts: ['leosan-linux', 'leosan-linux.tail26a382.ts.net'],
		},
		css: {
			// Keep this Vite app independent from the Next.js PostCSS config at the repo root.
			postcss: { plugins: [] },
		},
	}
})
