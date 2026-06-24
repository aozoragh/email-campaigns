import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Dedicated project port. strictPort makes dev fail loudly if 5173 is taken
	// (instead of silently drifting to another port, which would break the
	// OAuth redirect URIs registered with Google/Microsoft).
	server: { port: 5173, strictPort: true },
	preview: { port: 5173, strictPort: true }
});
