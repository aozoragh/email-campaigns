import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { MAX_RECIPIENTS_PER_RUN } from '$lib/server/email/send-run';

// Guard the send page: must have a connected account (token still in memory).
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.account) {
		throw redirect(302, '/');
	}
	return {
		account: locals.account,
		maxPerRun: MAX_RECIPIENTS_PER_RUN
	};
};
