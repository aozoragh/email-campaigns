// Sequential, small-batch send runner with safety guardrails.
//
// This is a deliberately conservative "safe small-batch email sender":
//  - sends ONE recipient at a time (no parallelism)
//  - waits a small delay between sends (gentle on the provider, not a spam tactic)
//  - enforces a conservative per-run recipient cap
//  - stops the whole run if too many consecutive failures occur (likely an
//    expired token or a quota/permission problem — better to stop than hammer)
//
// It contains NO spam-evasion, rotation, spoofing, or stealth logic, and is not
// designed to bypass any provider's sending limits or filters.

import type { ParsedContact, Provider, SendResult } from '$lib/types';
import { sendViaGmail, TokenExpiredError as GmailTokenExpired } from './gmail-send';
import { sendViaOutlook, TokenExpiredError as OutlookTokenExpired } from './outlook-send';

// ---- SAFE SENDING LIMITS (enforced below) ----
/** Hard cap on recipients per run. Conservative by design. */
export const MAX_RECIPIENTS_PER_RUN = 50;
/** Delay between individual sends, in milliseconds. */
export const SEND_DELAY_MS = 1200;
/** Abort the run after this many consecutive failures (circuit breaker). */
export const MAX_CONSECUTIVE_FAILURES = 5;

export interface SendRunInput {
	provider: Provider;
	accessToken: string;
	fromEmail: string;
	subject: string;
	body: string;
	/** Footer appended to every message (e.g. unsubscribe note). */
	footer: string;
	contacts: ParsedContact[];
}

/** A progress event emitted as the run proceeds. */
export interface SendProgress {
	type: 'status' | 'aborted' | 'done';
	/** Updated result for a single recipient (present on 'status'). */
	result?: SendResult;
	/** Reason the run was aborted early (present on 'aborted'). */
	reason?: string;
	/** Running totals (present on 'done'). */
	totals?: { sent: number; failed: number; skipped: number };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nowIso(): string {
	return new Date().toISOString();
}

function composeBody(body: string, footer: string): string {
	const trimmedFooter = footer.trim();
	if (!trimmedFooter) return body;
	// "-- " (dash-dash-space) is the standard RFC signature delimiter; mail
	// clients recognize it and visually separate the footer from the message.
	return `${body.trimEnd()}\n\n-- \n${trimmedFooter}`;
}

/**
 * Run the send sequentially, yielding a progress event per recipient.
 * Skipped (invalid/duplicate) contacts are reported as 'skipped' without sending.
 */
export async function* runSend(input: SendRunInput): AsyncGenerator<SendProgress> {
	const { provider, accessToken, fromEmail, subject, contacts } = input;
	const fullBody = composeBody(input.body, input.footer);

	const valid = contacts.filter((c) => c.valid);

	// GUARDRAIL: enforce the conservative per-run recipient cap.
	if (valid.length > MAX_RECIPIENTS_PER_RUN) {
		yield {
			type: 'aborted',
			reason: `Too many recipients (${valid.length}). The safe limit is ${MAX_RECIPIENTS_PER_RUN} per run.`
		};
		return;
	}

	let sent = 0;
	let failed = 0;
	let skipped = 0;
	let consecutiveFailures = 0;

	for (const contact of contacts) {
		// Report skipped contacts (invalid/duplicate) without attempting a send.
		if (!contact.valid) {
			skipped++;
			yield {
				type: 'status',
				result: {
					email: contact.email,
					name: contact.name,
					status: 'skipped',
					detail: contact.skipReason,
					updatedAt: nowIso()
				}
			};
			continue;
		}

		// Mark as sending so the UI can show in-flight state.
		yield {
			type: 'status',
			result: { email: contact.email, name: contact.name, status: 'sending', updatedAt: nowIso() }
		};

		try {
			const message = {
				from: fromEmail,
				to: contact.email,
				toName: contact.name,
				subject,
				body: fullBody
			};

			if (provider === 'gmail') {
				await sendViaGmail(accessToken, message);
			} else {
				await sendViaOutlook(accessToken, message);
			}

			sent++;
			consecutiveFailures = 0;
			yield {
				type: 'status',
				result: { email: contact.email, name: contact.name, status: 'sent', updatedAt: nowIso() }
			};
		} catch (err) {
			failed++;
			consecutiveFailures++;
			const detail = err instanceof Error ? err.message : 'Unknown send error';
			yield {
				type: 'status',
				result: {
					email: contact.email,
					name: contact.name,
					status: 'failed',
					detail,
					updatedAt: nowIso()
				}
			};

			// An expired token won't recover mid-run — stop immediately.
			if (err instanceof GmailTokenExpired || err instanceof OutlookTokenExpired) {
				yield { type: 'aborted', reason: detail };
				return;
			}

			// GUARDRAIL: circuit breaker — stop after too many consecutive failures.
			if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
				yield {
					type: 'aborted',
					reason: `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Please check your account and try again.`
				};
				return;
			}
		}

		// Small pause between sends. Not a spam tactic — just gentle pacing.
		await delay(SEND_DELAY_MS);
	}

	yield { type: 'done', totals: { sent, failed, skipped } };
}
