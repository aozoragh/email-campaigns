import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeOutlookCode } from '$lib/server/oauth/outlook';
import { consumeOAuthFlow, setConnectedAccount } from '$lib/server/session';

// Handle Microsoft's redirect back: validate `state`, exchange the code for a
// (temporary) access token, store it in the in-memory session, then go to /send.
export const GET: RequestHandler = async ({ url, cookies }) => {
	const oauthError = url.searchParams.get('error');
	if (oauthError) {
		const desc = url.searchParams.get('error_description') ?? '';
		throw error(400, `Outlook sign-in was cancelled or failed: ${oauthError} ${desc}`);
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) {
		throw error(400, 'Outlook sign-in is missing required parameters. Please try again.');
	}

	try {
		consumeOAuthFlow(cookies, 'outlook', state);
		const { accessToken, email } = await exchangeOutlookCode(code);
		setConnectedAccount(
			cookies,
			url.protocol === 'https:',
			{ provider: 'outlook', email },
			accessToken
		);
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : 'Outlook sign-in failed.');
	}

	throw redirect(302, '/send');
};
