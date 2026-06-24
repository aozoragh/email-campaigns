// Google OAuth 2.0 for Gmail send-only access.
//
// Scope is intentionally minimal: `gmail.send` (send only — no read access).
// We use `access_type=online` so Google does NOT issue a refresh token,
// matching the no-persisted-tokens constraint. The access token lives only
// in the in-memory session for the current run.

import { getGmailConfig } from '../env';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Send-only scope plus userinfo.email so we can show the connected address.
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'];

/** Build the Google consent URL. `state` guards against CSRF on the callback. */
export function buildGmailAuthUrl(state: string): string {
	const { clientId, redirectUri } = getGmailConfig();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: SCOPES.join(' '),
		state,
		// online => no refresh token issued; access token expires and user reconnects.
		access_type: 'online',
		prompt: 'consent'
	});
	return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GmailTokenResult {
	accessToken: string;
	email: string;
}

/** Exchange the authorization code for an access token, then look up the user's email. */
export async function exchangeGmailCode(code: string): Promise<GmailTokenResult> {
	const { clientId, clientSecret, redirectUri } = getGmailConfig();

	const tokenRes = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!tokenRes.ok) {
		const detail = await safeError(tokenRes);
		throw new Error(`Google token exchange failed: ${detail}`);
	}

	const token = (await tokenRes.json()) as { access_token?: string };
	if (!token.access_token) {
		throw new Error('Google did not return an access token.');
	}

	const userRes = await fetch(USERINFO_ENDPOINT, {
		headers: { Authorization: `Bearer ${token.access_token}` }
	});
	if (!userRes.ok) {
		const detail = await safeError(userRes);
		throw new Error(`Could not read Google account email: ${detail}`);
	}
	const profile = (await userRes.json()) as { email?: string };
	if (!profile.email) {
		throw new Error('Google account did not expose an email address.');
	}

	return { accessToken: token.access_token, email: profile.email };
}

async function safeError(res: Response): Promise<string> {
	try {
		const body = await res.text();
		return `${res.status} ${body.slice(0, 300)}`;
	} catch {
		return `${res.status}`;
	}
}
