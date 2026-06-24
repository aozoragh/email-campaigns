import { randomBytes } from 'node:crypto';
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildGmailAuthUrl } from '$lib/server/oauth/gmail';
import { startOAuthFlow } from '$lib/server/session';

// Begin the Gmail OAuth flow: create a CSRF `state`, stash it in the session,
// then redirect the user to Google's consent screen.
export const GET: RequestHandler = ({ cookies, url }) => {
	let authUrl: string;
	const state = randomBytes(16).toString('hex');
	try {
		startOAuthFlow(cookies, url.protocol === 'https:', { provider: 'gmail', state });
		authUrl = buildGmailAuthUrl(state);
	} catch (err) {
		// Missing/invalid env vars surface here as a clear message.
		throw error(500, err instanceof Error ? err.message : 'Could not start Gmail sign-in.');
	}
	throw redirect(302, authUrl);
};
