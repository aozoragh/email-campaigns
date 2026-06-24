import type { PageServerLoad } from './$types';
import { isProviderConfigured } from '$lib/server/env';

// Surface which providers are configured so we can disable the Connect button
// (and show a hint) when env vars are missing — instead of a confusing failure.
export const load: PageServerLoad = ({ locals }) => {
	return {
		account: locals.account,
		gmailConfigured: isProviderConfigured('gmail'),
		outlookConfigured: isProviderConfigured('outlook')
	};
};
