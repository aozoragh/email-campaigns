// Temporary, in-memory session handling.
//
// DESIGN / SECURITY NOTE (no-database constraint):
// - The browser only ever receives a signed, httpOnly session-ID cookie.
//   It never sees the OAuth access token, and nothing is stored in localStorage.
// - The OAuth *access token* lives ONLY in this process's memory, keyed by the
//   session ID, with a short TTL. It is wiped on logout, on TTL expiry, and on
//   any process restart. We do NOT request or store refresh tokens.
// - This works for a single long-running Node instance (adapter-node). It does
//   NOT survive restarts and does NOT share across multiple instances. Scaling
//   horizontally would require a durable session store (e.g. Redis), which would
//   put tokens at rest and contradict the no-persistence goal — so we stop here
//   and keep it in-memory by design. See README "Why no database".

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { getSessionSecret } from './env';
import type { ConnectedAccount, Provider } from '$lib/types';

const COOKIE_NAME = 'ec_session';
/** How long a connected session (and its access token) is held in memory. */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Short-lived TTL for the pre-auth OAuth state/PKCE record. */
const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface SessionData {
	account: ConnectedAccount;
	accessToken: string;
	/** Epoch ms after which this session is considered expired. */
	expiresAt: number;
	/** Pending OAuth flow data, present only between /start and /callback. */
	oauth?: {
		provider: Provider;
		state: string;
		codeVerifier?: string;
		expiresAt: number;
	};
}

// In-memory store. Keyed by session ID. Intentionally not persisted.
const store = new Map<string, SessionData>();

function now(): number {
	return Date.now();
}

/** Drop expired sessions so the map doesn't grow unbounded. */
function sweep(): void {
	const t = now();
	for (const [id, data] of store) {
		if (data.expiresAt <= t) store.delete(id);
	}
}

// ---- Cookie signing (HMAC) so the session ID can't be forged ----

function sign(value: string): string {
	const mac = createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
	return `${value}.${mac}`;
}

function unsign(signed: string | undefined): string | null {
	if (!signed) return null;
	const idx = signed.lastIndexOf('.');
	if (idx <= 0) return null;
	const value = signed.slice(0, idx);
	const mac = signed.slice(idx + 1);
	const expected = createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
	const a = Buffer.from(mac);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	return value;
}

const cookieOptions = (secure: boolean) =>
	({
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		maxAge: Math.floor(SESSION_TTL_MS / 1000)
	}) as const;

/** Read and verify the session ID from the request cookies. */
function readSessionId(cookies: Cookies): string | null {
	return unsign(cookies.get(COOKIE_NAME) ?? undefined);
}

/** Ensure a signed session cookie exists, returning the session ID. */
function ensureSessionId(cookies: Cookies, secure: boolean): string {
	let id = readSessionId(cookies);
	if (!id) {
		id = randomBytes(32).toString('base64url');
		cookies.set(COOKIE_NAME, sign(id), cookieOptions(secure));
	}
	return id;
}

// ---- OAuth flow state (CSRF protection via `state`) ----

/** Persist the OAuth `state` (and optional PKCE verifier) before redirecting to the provider. */
export function startOAuthFlow(
	cookies: Cookies,
	secure: boolean,
	flow: { provider: Provider; state: string; codeVerifier?: string }
): void {
	sweep();
	const id = ensureSessionId(cookies, secure);
	const existing = store.get(id);
	const base: SessionData = existing ?? {
		account: { provider: flow.provider, email: '' },
		accessToken: '',
		expiresAt: now() + SESSION_TTL_MS
	};
	base.oauth = { ...flow, expiresAt: now() + OAUTH_FLOW_TTL_MS };
	store.set(id, base);
}

/** Validate the returned `state`, consume the pending flow, and return its PKCE verifier. */
export function consumeOAuthFlow(
	cookies: Cookies,
	provider: Provider,
	state: string
): { codeVerifier?: string } {
	const id = readSessionId(cookies);
	if (!id) throw new Error('No session found. Please start the connection again.');
	const data = store.get(id);
	if (!data?.oauth) throw new Error('No pending sign-in. Please start the connection again.');
	const flow = data.oauth;
	if (flow.expiresAt <= now()) {
		delete data.oauth;
		throw new Error('Sign-in timed out. Please start the connection again.');
	}
	if (flow.provider !== provider || flow.state !== state) {
		delete data.oauth;
		throw new Error('Sign-in verification failed (state mismatch). Please try again.');
	}
	const codeVerifier = flow.codeVerifier;
	delete data.oauth;
	return { codeVerifier };
}

/** Store the connected account + access token in memory for this session. */
export function setConnectedAccount(
	cookies: Cookies,
	secure: boolean,
	account: ConnectedAccount,
	accessToken: string
): void {
	sweep();
	const id = ensureSessionId(cookies, secure);
	const existing = store.get(id);
	store.set(id, {
		account,
		accessToken,
		expiresAt: now() + SESSION_TTL_MS,
		oauth: existing?.oauth
	});
}

/** Get the connected account (no token) for display, or null if none/expired. */
export function getConnectedAccount(cookies: Cookies): ConnectedAccount | null {
	sweep();
	const id = readSessionId(cookies);
	if (!id) return null;
	const data = store.get(id);
	if (!data || data.expiresAt <= now() || !data.accessToken) return null;
	return data.account;
}

/** Get the access token for server-side sending, or null if missing/expired. */
export function getAccessToken(cookies: Cookies): string | null {
	sweep();
	const id = readSessionId(cookies);
	if (!id) return null;
	const data = store.get(id);
	if (!data || data.expiresAt <= now() || !data.accessToken) return null;
	return data.accessToken;
}

/** Clear the session: wipe the token from memory and delete the cookie. */
export function clearSession(cookies: Cookies): void {
	const id = readSessionId(cookies);
	if (id) store.delete(id);
	cookies.delete(COOKIE_NAME, { path: '/' });
}
