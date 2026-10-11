import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mean, sd, linearFit, meanCI, t95, withoutOutliers, groupBy } from '../src/core/stats.js';
import { toCSV, fromCSV, parseRows } from '../src/core/csv.js';
import {
	loadSession,
	saveSession,
	loadParticipants,
	finishSession,
	removeParticipant,
	clearParticipants,
} from '../src/core/session.js';

const close = (actual, expected, tol) =>
	assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('mean, sd and linear fit', () => {
	assert.equal(mean([1, 2, 3, 4]), 2.5);
	close(sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.001);
	const fit = linearFit([1, 2, 3, 4], [150, 250, 350, 450]);
	close(fit.a, 50, 1e-9);
	close(fit.b, 100, 1e-9);
	close(fit.r2, 1, 1e-12);
	assert.equal(linearFit([1, 1], [2, 3]), null);
});

test('95 % confidence interval uses Student t', () => {
	assert.equal(t95(1), 12.706);
	assert.equal(t95(1000), 1.96);
	const ci = meanCI([10, 12, 14]);
	close(ci.mean, 12, 1e-12);
	close(ci.half, (4.303 * 2) / Math.sqrt(3), 1e-9);
});

test('outliers beyond 3 SD are dropped', () => {
	const xs = [100, 101, 99, 100, 102, 98, 100, 101, 99, 100, 101, 400];
	assert.equal(withoutOutliers(xs, (x) => x).length, 11);
	assert.equal(withoutOutliers([1, 2, 100], (x) => x).length, 3, 'too few to judge');
});

test('groupBy keeps insertion order', () => {
	const g = groupBy(['a1', 'b1', 'a2'], (s) => s[0]);
	assert.deepEqual([...g.keys()], ['a', 'b']);
	assert.deepEqual(g.get('a'), ['a1', 'a2']);
});

test('CSV round trip with types, quotes and missing values', () => {
	const schema = [
		{ key: 'participant', type: 'string' },
		{ key: 'id', type: 'number' },
		{ key: 'hit', type: 'boolean' },
		{ key: 'note', type: 'string' },
	];
	const rows = [
		{ participant: '007', id: 3.169925, hit: true, note: 'a, "quoted"\nline' },
		{ participant: 'P2', id: null, hit: false, note: '' },
	];
	const text = toCSV(rows, schema);
	const { records, columns } = fromCSV(text, schema);
	assert.deepEqual(columns, ['participant', 'id', 'hit', 'note']);
	assert.equal(records[0].participant, '007', 'string columns stay strings');
	close(records[0].id, 3.1699, 1e-9);
	assert.equal(records[0].hit, true);
	assert.equal(records[0].note, 'a, "quoted"\nline');
	assert.equal(records[1].id, null);
	assert.equal(records[1].note, null);
});

test('CSV parser handles CRLF, BOM and unknown columns', () => {
	assert.deepEqual(parseRows('a,b\r\n1,2\r\n'), [
		['a', 'b'],
		['1', '2'],
	]);
	const { records } = fromCSV('﻿x,extra\r\n5,hello\r\n', [
		{ key: 'x', type: 'int' },
		{ key: 'y', type: 'number' },
	]);
	assert.deepEqual(records, [{ x: 5, extra: 'hello', y: null }]);
});

test('finished participants are kept as CSV; a refused save keeps the running session', () => {
	const store = new Map();
	let full = false;
	globalThis.window = {
		localStorage: {
			getItem: (k) => (store.has(k) ? store.get(k) : null),
			setItem: (k, v) => {
				if (full) throw new Error('QuotaExceededError');
				store.set(k, String(v));
			},
			removeItem: (k) => store.delete(k),
		},
	};
	try {
		const schema = [
			{ key: 'session', type: 'string' },
			{ key: 'mt_ms', type: 'number' },
		];
		saveSession('x', { id: 'S1' });
		const ann = finishSession('x', { id: 'S1', participant: 'Ann' }, [{ session: 'S1', mt_ms: 512.123456 }], schema);
		assert.equal(ann.participant, 'Ann');
		assert.equal(ann.rows[0].mt_ms, 512.1235, 'the values of the CSV file');
		assert.ok(ann.finished);
		assert.equal(loadSession('x'), null);

		saveSession('x', { id: 'S2' });
		full = true;
		assert.equal(finishSession('x', { id: 'S2', participant: 'Bo' }, [{ session: 'S2', mt_ms: 1 }], schema), null);
		full = false;
		assert.deepEqual(loadSession('x'), { id: 'S2' });
		assert.deepEqual(
			loadParticipants('x', schema).map((p) => p.participant),
			['Ann'],
		);

		finishSession('x', { id: 'S2', participant: 'Bo' }, [{ session: 'S2', mt_ms: 1 }], schema);
		removeParticipant('x', 'S1');
		assert.deepEqual(
			loadParticipants('x', schema).map((p) => p.participant),
			['Bo'],
		);
		clearParticipants('x');
		assert.equal(loadParticipants('x', schema).length, 0);
	} finally {
		delete globalThis.window;
	}
});
