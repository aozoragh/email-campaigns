import type { Handle } from '@sveltejs/kit';
import { getConnectedAccount } from '$lib/server/session';

// Populate locals.account from the in-memory session on every request so
// pages/endpoints can read the connected account without touching the store.
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.account = getConnectedAccount(event.cookies);
	return resolve(event);
};
