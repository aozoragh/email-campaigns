// Serialize per-recipient send results to a downloadable CSV string.
// Uses papaparse's unparse for correct quoting/escaping.

import Papa from 'papaparse';
import type { SendResult } from '$lib/types';

const COLUMNS = ['email', 'name', 'status', 'detail', 'updatedAt'] as const;

/** Convert results into a CSV string with a stable header order. */
export function resultsToCsv(results: SendResult[]): string {
	const rows = results.map((r) => ({
		email: r.email,
		name: r.name ?? '',
		status: r.status,
		detail: r.detail ?? '',
		updatedAt: r.updatedAt
	}));
	return Papa.unparse({ fields: [...COLUMNS], data: rows });
}

/** Suggested filename for the results download. */
export function resultsFilename(): string {
	return 'email-send-results.csv';
}
