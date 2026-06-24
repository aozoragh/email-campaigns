// Microsoft Identity (Azure AD) OAuth 2.0 for Outlook / Microsoft Graph sendMail.
//
// Scope is intentionally minimal: `Mail.Send` (send only). We request only the
// access token (no `offline_access`, so no refresh token is issued/stored).
// The access token lives only in the in-memory session for the current run.

import { getOutlookConfig } from '../env';

// "common" lets both personal and work/school accounts sign in.
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_ME = 'https://graph.microsoft.com/v1.0/me';

// Mail.Send (send-only) + User.Read so we can display the connected address.
// No `offline_access` => no refresh token.
const SCOPES = ['https://graph.microsoft.com/Mail.Send', 'https://graph.microsoft.com/User.Read'];

/** Build the Microsoft consent URL. `state` guards against CSRF on the callback. */
export function buildOutlookAuthUrl(state: string): string {
	const { clientId, redirectUri } = getOutlookConfig();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		response_mode: 'query',
		scope: SCOPES.join(' '),
		state
	});
	return `${AUTHORITY}/authorize?${params.toString()}`;
}

export interface OutlookTokenResult {
	accessToken: string;
	email: string;
}

/** Exchange the authorization code for an access token, then look up the user's email. */
export async function exchangeOutlookCode(code: string): Promise<OutlookTokenResult> {
	const { clientId, clientSecret, redirectUri } = getOutlookConfig();

	const tokenRes = await fetch(`${AUTHORITY}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
			scope: SCOPES.join(' ')
		})
	});

	if (!tokenRes.ok) {
		const detail = await safeError(tokenRes);
		throw new Error(`Microsoft token exchange failed: ${detail}`);
	}

	const token = (await tokenRes.json()) as { access_token?: string };
	if (!token.access_token) {
		throw new Error('Microsoft did not return an access token.');
	}

	const userRes = await fetch(GRAPH_ME, {
		headers: { Authorization: `Bearer ${token.access_token}` }
	});
	if (!userRes.ok) {
		const detail = await safeError(userRes);
		throw new Error(`Could not read Microsoft account email: ${detail}`);
	}
	const profile = (await userRes.json()) as { mail?: string; userPrincipalName?: string };
	const email = profile.mail ?? profile.userPrincipalName;
	if (!email) {
		throw new Error('Microsoft account did not expose an email address.');
	}

	return { accessToken: token.access_token, email };
}

async function safeError(res: Response): Promise<string> {
	try {
		const body = await res.text();
		return `${res.status} ${body.slice(0, 300)}`;
	} catch {
		return `${res.status}`;
	}
}
