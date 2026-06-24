// Centralized, validated access to environment variables.
// Each accessor throws a clear error if the required variable is missing,
// so OAuth/sending failures surface as actionable messages instead of `undefined`.

import { env } from '$env/dynamic/private';
import type { Provider } from '$lib/types';

function required(name: string): string {
	const value = env[name];
	if (!value || value.trim() === '') {
		throw new Error(
			`Missing required environment variable: ${name}. ` +
				`Copy .env.example to .env and fill it in (see README for OAuth setup).`
		);
	}
	return value;
}

export interface GmailOAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

export interface OutlookOAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

export function getGmailConfig(): GmailOAuthConfig {
	return {
		clientId: required('GOOGLE_CLIENT_ID'),
		clientSecret: required('GOOGLE_CLIENT_SECRET'),
		redirectUri: required('GOOGLE_REDIRECT_URI')
	};
}

export function getOutlookConfig(): OutlookOAuthConfig {
	return {
		clientId: required('MICROSOFT_CLIENT_ID'),
		clientSecret: required('MICROSOFT_CLIENT_SECRET'),
		redirectUri: required('MICROSOFT_REDIRECT_URI')
	};
}

/** Secret used to sign the session cookie. Required so cookies can't be forged. */
export function getSessionSecret(): string {
	return required('SESSION_SECRET');
}

/** Returns true if a provider has all its OAuth env vars set (used to enable/disable Connect buttons). */
export function isProviderConfigured(provider: Provider): boolean {
	try {
		if (provider === 'gmail') getGmailConfig();
		else getOutlookConfig();
		return true;
	} catch {
		return false;
	}
}
