// Parse an uploaded contact list (CSV or XLSX) into raw rows.
// CSV  -> papaparse (lightweight)
// XLSX -> SheetJS / xlsx (lightweight)
//
// We deliberately keep parsing tolerant: headers are lower-cased & trimmed,
// and we surface a clear error for unsupported/empty/corrupt files rather
// than throwing an opaque library error.

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ContactRow } from '$lib/types';

export interface ParseOutput {
	rows: ContactRow[];
	/** Column headers detected (lower-cased, trimmed). */
	headers: string[];
}

/** Thrown for invalid/unsupported/empty files so callers can show a friendly message. */
export class ContactParseError extends Error {}

function normalizeHeader(h: string): string {
	return String(h ?? '').trim().toLowerCase();
}

function normalizeRow(row: Record<string, unknown>): ContactRow {
	const out: ContactRow = {};
	for (const [key, value] of Object.entries(row)) {
		const k = normalizeHeader(key);
		if (!k) continue;
		out[k] = value == null ? '' : String(value).trim();
	}
	return out;
}

/** Decide parser by file extension / MIME, then dispatch. */
export async function parseContacts(file: File): Promise<ParseOutput> {
	const name = (file.name ?? '').toLowerCase();
	const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls');
	const isCsv = name.endsWith('.csv') || file.type === 'text/csv';

	if (!isXlsx && !isCsv) {
		throw new ContactParseError(
			'Unsupported file type. Please upload a .csv or .xlsx file.'
		);
	}

	const rows = isXlsx ? await parseXlsx(file) : await parseCsv(file);

	if (rows.length === 0) {
		throw new ContactParseError('The file appears to be empty (no data rows found).');
	}

	const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
	return { rows, headers };
}

async function parseCsv(file: File): Promise<ContactRow[]> {
	const text = await file.text();
	const result = Papa.parse<Record<string, unknown>>(text, {
		header: true,
		skipEmptyLines: 'greedy',
		transformHeader: normalizeHeader
	});

	if (result.errors.length > 0) {
		// Report the first parse error but don't abort on minor row issues.
		const first = result.errors[0];
		if (!result.data || result.data.length === 0) {
			throw new ContactParseError(`Could not read CSV: ${first.message}`);
		}
	}

	return result.data.map(normalizeRow).filter((r) => Object.keys(r).length > 0);
}

async function parseXlsx(file: File): Promise<ContactRow[]> {
	let workbook: XLSX.WorkBook;
	try {
		const buf = await file.arrayBuffer();
		workbook = XLSX.read(buf, { type: 'array' });
	} catch (err) {
		throw new ContactParseError(
			`Could not read XLSX: ${err instanceof Error ? err.message : 'invalid file'}`
		);
	}

	const sheetName = workbook.SheetNames[0];
	if (!sheetName) {
		throw new ContactParseError('The spreadsheet has no sheets.');
	}
	const sheet = workbook.Sheets[sheetName];
	const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
	return json.map(normalizeRow).filter((r) => Object.keys(r).length > 0);
}
