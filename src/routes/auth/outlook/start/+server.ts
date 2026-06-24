import { randomBytes } from 'node:crypto';
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildOutlookAuthUrl } from '$lib/server/oauth/outlook';
import { startOAuthFlow } from '$lib/server/session';

// Begin the Outlook OAuth flow: create a CSRF `state`, stash it in the session,
// then redirect the user to Microsoft's consent screen.
export const GET: RequestHandler = ({ cookies, url }) => {
	let authUrl: string;
	const state = randomBytes(16).toString('hex');
	try {
		startOAuthFlow(cookies, url.protocol === 'https:', { provider: 'outlook', state });
		authUrl = buildOutlookAuthUrl(state);
	} catch (err) {
		throw error(500, err instanceof Error ? err.message : 'Could not start Outlook sign-in.');
	}
	throw redirect(302, authUrl);
};
