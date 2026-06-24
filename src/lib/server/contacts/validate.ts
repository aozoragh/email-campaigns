// Validate, normalize, and de-duplicate parsed contact rows.
//
// Guardrails enforced here:
//  - invalid email addresses are skipped (never sent to)
//  - duplicate emails (case-insensitive) are removed, keeping the first
//  - rows missing an email column are skipped with a clear reason

import type { ContactRow, ParsedContact } from '$lib/types';

// Common header names we'll treat as the email / name column.
const EMAIL_KEYS = ['email', 'e-mail', 'email address', 'mail', 'emailaddress'];
const NAME_KEYS = ['name', 'full name', 'fullname', 'first name', 'firstname', 'contact'];

// Pragmatic email check — not RFC-perfect, but rejects the obviously broken.
// (Perfect RFC 5322 validation is intentionally avoided; it's overkill and error-prone.)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pick(row: ContactRow, keys: string[]): string | undefined {
	for (const k of keys) {
		if (row[k] && row[k].trim() !== '') return row[k].trim();
	}
	return undefined;
}

export function isValidEmail(email: string): boolean {
	return EMAIL_RE.test(email);
}

export interface ValidationSummary {
	contacts: ParsedContact[];
	validCount: number;
	skippedCount: number;
	duplicateCount: number;
}

/**
 * Turn raw rows into normalized contacts, marking invalid/duplicate rows as skipped.
 * The returned list preserves every input row (so the user sees what was skipped and why).
 */
export function validateContacts(rows: ContactRow[]): ValidationSummary {
	const seen = new Set<string>();
	const contacts: ParsedContact[] = [];
	let validCount = 0;
	let skippedCount = 0;
	let duplicateCount = 0;

	for (const raw of rows) {
		const rawEmail = pick(raw, EMAIL_KEYS);
		const name = pick(raw, NAME_KEYS);

		if (!rawEmail) {
			contacts.push({ email: '', name, valid: false, skipReason: 'no email column/value', raw });
			skippedCount++;
			continue;
		}

		const email = rawEmail.toLowerCase();

		if (!isValidEmail(email)) {
			contacts.push({ email, name, valid: false, skipReason: 'invalid email', raw });
			skippedCount++;
			continue;
		}

		if (seen.has(email)) {
			contacts.push({ email, name, valid: false, skipReason: 'duplicate', raw });
			skippedCount++;
			duplicateCount++;
			continue;
		}

		seen.add(email);
		contacts.push({ email, name, valid: true, raw });
		validCount++;
	}

	return { contacts, validCount, skippedCount, duplicateCount };
}
