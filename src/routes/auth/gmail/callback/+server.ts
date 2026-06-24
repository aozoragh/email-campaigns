import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeGmailCode } from '$lib/server/oauth/gmail';
import { consumeOAuthFlow, setConnectedAccount } from '$lib/server/session';

// Handle Google's redirect back: validate `state`, exchange the code for a
// (temporary) access token, store it in the in-memory session, then go to /send.
export const GET: RequestHandler = async ({ url, cookies }) => {
	// Google reports user-denied consent etc. via the `error` query param.
	const oauthError = url.searchParams.get('error');
	if (oauthError) {
		throw error(400, `Gmail sign-in was cancelled or failed: ${oauthError}`);
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) {
		throw error(400, 'Gmail sign-in is missing required parameters. Please try again.');
	}

	try {
		// Throws on state mismatch / timeout (CSRF protection).
		consumeOAuthFlow(cookies, 'gmail', state);
		const { accessToken, email } = await exchangeGmailCode(code);
		setConnectedAccount(
			cookies,
			url.protocol === 'https:',
			{ provider: 'gmail', email },
			accessToken
		);
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : 'Gmail sign-in failed.');
	}

	throw redirect(302, '/send');
};
