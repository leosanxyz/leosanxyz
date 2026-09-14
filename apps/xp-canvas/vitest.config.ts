import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['client/**/*.test.ts', 'worker/**/*.test.ts'],
	},
})
