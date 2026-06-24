import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseContacts, ContactParseError } from '$lib/server/contacts/parse';
import { validateContacts } from '$lib/server/contacts/validate';
import { MAX_RECIPIENTS_PER_RUN } from '$lib/server/email/send-run';

// Parse + validate an uploaded contact file. Returns normalized contacts and
// summary counts. Nothing is persisted — the result is sent straight back.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.account) {
		throw error(401, 'Not connected. Please connect a Gmail or Outlook account first.');
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		throw error(400, 'No file uploaded. Please choose a .csv or .xlsx file.');
	}

	try {
		const { rows, headers } = await parseContacts(file);
		const summary = validateContacts(rows);

		return json({
			headers,
			contacts: summary.contacts,
			validCount: summary.validCount,
			skippedCount: summary.skippedCount,
			duplicateCount: summary.duplicateCount,
			maxPerRun: MAX_RECIPIENTS_PER_RUN,
			overLimit: summary.validCount > MAX_RECIPIENTS_PER_RUN
		});
	} catch (err) {
		if (err instanceof ContactParseError) {
			throw error(400, err.message);
		}
		throw error(500, err instanceof Error ? err.message : 'Could not parse the file.');
	}
};
