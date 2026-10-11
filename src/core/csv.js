/**
 * CSV export and import driven by a column schema, so that a file written by
 * the app reads back into exactly the same records.
 *
 * A schema is a list of { key, type } with type 'string', 'number', 'int' or
 * 'boolean'. Missing values are written as empty cells and read as null.
 */

function format(value, type) {
	if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return '';
	if (type === 'number') return String(Math.round(value * 10000) / 10000);
	if (type === 'boolean') return value ? 'true' : 'false';
	const s = String(value);
	return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(records, schema) {
	const lines = [schema.map((c) => c.key).join(',')];
	for (const r of records) lines.push(schema.map((c) => format(r[c.key], c.type)).join(','));
	return lines.join('\n') + '\n';
}

/** Split CSV text into rows of cells (RFC 4180: quotes, commas and newlines in quotes). */
export function parseRows(text) {
	const rows = [];
	let row = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				cell += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else {
			cell += ch;
		}
	}
	if (cell !== '' || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function parseValue(text, type) {
	if (text === '') return null;
	if (type === 'number' || type === 'int') {
		const v = Number(text);
		return Number.isFinite(v) ? v : null;
	}
	if (type === 'boolean') return text === 'true' || text === '1';
	return text;
}

/**
 * Read CSV text into records. Columns that are not in the schema are kept as
 * strings; schema columns missing from the file are null.
 * @returns {{records: object[], columns: string[]}}
 */
export function fromCSV(text, schema) {
	const rows = parseRows(text.replace(/^﻿/, ''));
	if (!rows.length) return { records: [], columns: [] };
	const header = rows[0].map((h) => h.trim());
	const types = new Map(schema.map((c) => [c.key, c.type]));
	const records = rows.slice(1).map((cells) => {
		const r = {};
		header.forEach((key, i) => {
			r[key] = parseValue(cells[i] ?? '', types.get(key) || 'string');
		});
		for (const c of schema) if (!(c.key in r)) r[c.key] = null;
		return r;
	});
	return { records, columns: header };
}
