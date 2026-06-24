import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// adapter-node is intentional: the app keeps OAuth access tokens in an
		// in-memory session store, which requires a single long-running Node
		// process (not a serverless/edge runtime with ephemeral, per-request memory).
		adapter: adapter()
	}
};

export default config;
