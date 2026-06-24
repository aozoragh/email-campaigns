import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Dedicated project port. strictPort makes dev fail loudly if 5180 is taken
	// (instead of silently drifting to another port, which would break the
	// OAuth redirect URIs registered with Google/Microsoft).
	// Bind IPv4 explicitly: on some Windows setups `localhost` resolves to
	// 127.0.0.1 first, and an IPv6-only (::1) bind would be unreachable from the browser.
	server: { host: '127.0.0.1', port: 5180, strictPort: true },
	preview: { host: '127.0.0.1', port: 5180, strictPort: true }
});
