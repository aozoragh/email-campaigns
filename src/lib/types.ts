// Shared types for the small-batch email sender.

/** OAuth providers we support. */
export type Provider = 'gmail' | 'outlook';

/** Per-recipient lifecycle status shown in the UI status table. */
export type SendStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

/**
 * A raw row as parsed from the uploaded CSV/XLSX, before validation/normalization.
 * Keys are the original (lower-cased, trimmed) column headers.
 */
export interface ContactRow {
	[column: string]: string;
}

/**
 * A normalized contact after parsing + validation.
 * `valid: false` rows are skipped before sending and surfaced to the user.
 */
export interface ParsedContact {
	/** Normalized (trimmed, lower-cased) email address. */
	email: string;
	/** Optional display name pulled from a name column, if present. */
	name?: string;
	/** Whether this contact passed validation and is eligible to send. */
	valid: boolean;
	/** Human-readable reason when the contact is invalid or skipped (e.g. "invalid email", "duplicate"). */
	skipReason?: string;
	/** The original parsed row, preserved for the results CSV. */
	raw: ContactRow;
}

/** The outcome for a single recipient after (or during) a send run. */
export interface SendResult {
	email: string;
	name?: string;
	status: SendStatus;
	/** Error or skip detail, when applicable. */
	detail?: string;
	/** ISO timestamp of the last status change. */
	updatedAt: string;
}

/** The account currently connected for this session (no tokens exposed to the client). */
export interface ConnectedAccount {
	provider: Provider;
	email: string;
}
