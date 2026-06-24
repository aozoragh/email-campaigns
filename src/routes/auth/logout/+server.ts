import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession } from '$lib/server/session';

// Disconnect: wipe the in-memory access token and clear the session cookie.
export const POST: RequestHandler = ({ cookies }) => {
	clearSession(cookies);
	throw redirect(303, '/');
};
