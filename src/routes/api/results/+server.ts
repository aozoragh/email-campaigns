import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resultsToCsv, resultsFilename } from '$lib/server/results/csv';
import type { SendResult } from '$lib/types';

// Turn the in-browser results into a downloadable CSV. Stateless: the client
// posts the results it already has; we just format and return the file.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.account) {
		throw error(401, 'Not connected.');
	}

	const payload = (await request.json()) as { results?: SendResult[] };
	const results = Array.isArray(payload.results) ? payload.results : [];
	if (results.length === 0) {
		throw error(400, 'No results to download yet.');
	}

	const csv = resultsToCsv(results);
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${resultsFilename()}"`
		}
	});
};
