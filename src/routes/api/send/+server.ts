import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAccessToken } from '$lib/server/session';
import { validateContacts } from '$lib/server/contacts/validate';
import { runSend, MAX_RECIPIENTS_PER_RUN } from '$lib/server/email/send-run';
import type { ContactRow } from '$lib/types';

interface SendRequest {
	subject?: string;
	body?: string;
	footer?: string;
	// We re-validate from the ORIGINAL raw rows so the server stays authoritative
	// for email validation, de-duplication, and the recipient cap (never trust
	// the client's idea of who is "valid").
	rows?: ContactRow[];
}

// Stream per-recipient progress back to the browser as newline-delimited JSON.
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.account) {
		throw error(401, 'Not connected. Please connect a Gmail or Outlook account first.');
	}

	// Re-read the token from the in-memory session (it may have expired).
	const accessToken = getAccessToken(cookies);
	if (!accessToken) {
		throw error(401, 'Your session expired. Please reconnect your account.');
	}

	const payload = (await request.json()) as SendRequest;
	const subject = (payload.subject ?? '').trim();
	const body = payload.body ?? '';
	const footer = payload.footer ?? '';
	const rows = Array.isArray(payload.rows) ? payload.rows : [];

	if (!subject) throw error(400, 'Subject is required.');
	if (!body.trim()) throw error(400, 'Email body is required.');
	if (rows.length === 0) throw error(400, 'No contacts to send to. Please upload a list.');

	// Server-side re-validation (authoritative guardrails).
	const summary = validateContacts(rows);
	if (summary.validCount === 0) {
		throw error(400, 'No valid recipients after validation. Nothing to send.');
	}
	// GUARDRAIL: enforce the conservative per-run recipient cap server-side.
	if (summary.validCount > MAX_RECIPIENTS_PER_RUN) {
		throw error(
			400,
			`Too many recipients (${summary.validCount}). The safe limit is ${MAX_RECIPIENTS_PER_RUN} per run.`
		);
	}

	const account = locals.account;
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			try {
				for await (const event of runSend({
					provider: account.provider,
					accessToken,
					fromEmail: account.email,
					subject,
					body,
					footer,
					contacts: summary.contacts
				})) {
					controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Send run failed unexpectedly.';
				controller.enqueue(
					encoder.encode(JSON.stringify({ type: 'aborted', reason: message }) + '\n')
				);
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no'
		}
	});
};
