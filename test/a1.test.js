import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPlan, indexOfDifficulty, MOVEMENTS, TECHNIQUES, AMPLITUDES, WIDTHS } from '../src/a1/design.js';
import { ReciprocalSequence, velocityProfile } from '../src/a1/reciprocal.js';
import { summarizeSession, summarizeGroup, WE_FACTOR } from '../src/a1/analysis.js';
import { A1_SCHEMA, VELOCITY_KEYS } from '../src/a1/schema.js';
import { toCSV, fromCSV } from '../src/core/csv.js';
import { seededRandom } from '../src/core/random.js';

const close = (actual, expected, tol, msg = '') =>
	assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected}, got ${actual}`);

test('plan: practice for both techniques, then 12 shuffled sequences', () => {
	const plan = buildPlan(seededRandom(3));
	assert.equal(plan.length, 2 + TECHNIQUES.length * AMPLITUDES.length * WIDTHS.length);
	assert.deepEqual(
		plan.slice(0, 2).map((s) => s.practice),
		[true, true],
	);
	assert.deepEqual(new Set(plan.slice(0, 2).map((s) => s.technique)), new Set(TECHNIQUES));
	const main = plan.slice(2);
	assert.equal(new Set(main.map((s) => `${s.technique}${s.A}${s.W}`)).size, 12);
	assert.ok(main.every((s) => s.movements === MOVEMENTS));
	// Shuffled: not grouped by technique.
	const sorted = [...main].sort((a, b) => a.technique.localeCompare(b.technique));
	assert.notDeepEqual(main, sorted);
});

test('both techniques share the same IDs', () => {
	close(indexOfDifficulty(240, 60), Math.log2(5), 1e-12);
	close(indexOfDifficulty(480, 15), Math.log2(33), 1e-12);
});

/** Drive a pointing sequence: press at the given x offsets from each target. */
function runPointing(offsets, { A = 400, W = 40, mt = 500 } = {}) {
	const seq = new ReciprocalSequence({ technique: 'pointing', A, W, movements: offsets.length, cx: 500, cy: 200 });
	let t = 0;
	seq.press(300, 200, t, 'mouse'); // start on the left target
	let x = 300;
	offsets.forEach((off, i) => {
		const tx = i % 2 === 0 ? 700 : 300;
		const dir = i % 2 === 0 ? 1 : -1;
		// Move in a few steps, then press.
		for (let k = 1; k <= 4; k++) seq.move(x + ((tx + off * dir - x) * k) / 4, 200, t + (mt * k) / 5, 'mouse');
		t += mt;
		x = tx + off * dir;
		seq.press(x, 200, t, 'mouse');
	});
	return seq;
}

test('pointing: hits, misses, deviation along the movement and MT', () => {
	const seq = runPointing([5, -10, 30, 0]);
	assert.equal(seq.done, true);
	const m = seq.movementData();
	assert.equal(m.length, 4);
	assert.deepEqual(
		m.map((r) => r.hit),
		[true, true, false, true],
	);
	assert.deepEqual(
		m.map((r) => r.deviation + 0),
		[5, -10, 30, 0],
	);
	assert.deepEqual(
		m.map((r) => r.direction),
		['right', 'left', 'right', 'left'],
	);
	assert.ok(m.every((r) => r.mt === 500));
	close(m[0].amplitude, 405, 1e-9);
});

test('pointing: a missed start does not start the sequence', () => {
	const seq = new ReciprocalSequence({ technique: 'pointing', A: 400, W: 40, movements: 2, cx: 500, cy: 200 });
	const r = seq.press(100, 200, 0, 'mouse');
	assert.equal(r.ignored, true);
	assert.equal(seq.started, false);
	assert.equal(seq.press(310, 200, 10, 'mouse').hit, true);
	assert.equal(seq.started, true);
});

test('crossing: crossing point and time are interpolated, y decides hit or miss', () => {
	const seq = new ReciprocalSequence({ technique: 'crossing', A: 400, W: 40, movements: 2, cx: 500, cy: 200 });
	seq.move(250, 200, 0, 'mouse');
	const start = seq.move(350, 200, 100, 'mouse'); // crosses x = 300 at t = 50
	assert.equal(start.hit, true);
	close(start.t, 50, 1e-9);
	// Overshoot past 700 with y = 230 at the line: outside the 40 px goal.
	seq.move(650, 230, 600, 'mouse');
	const miss = seq.move(750, 230, 700, 'mouse');
	assert.equal(miss.hit, false);
	close(miss.t, 650, 1e-9);
	// Crossing the right line again on the way back does not count.
	assert.equal(seq.move(650, 200, 800, 'mouse'), null);
	seq.move(350, 205, 1200, 'mouse');
	const hit = seq.move(250, 205, 1300, 'mouse');
	assert.equal(hit.hit, true);
	assert.equal(seq.done, true);
	const m = seq.movementData();
	close(m[0].mt, 600, 1e-9);
	close(m[0].deviation, 30, 1e-9);
	close(m[1].deviation, 5, 1e-9);
	close(m[1].mt, 600, 1e-9);
	// Clicks are ignored in crossing.
	assert.equal(
		new ReciprocalSequence({ technique: 'crossing', A: 1, W: 1, movements: 1, cx: 0, cy: 0 }).press(0, 0, 0),
		null,
	);
});

test('velocity profile: constant speed gives constant bins; reversal gives negative bins', () => {
	const a0 = { t: 0, x: 0 };
	const a1 = { t: 100, x: 100 };
	const flat = velocityProfile([{ t: 50, x: 50 }], a0, a1, 1, 10);
	flat.forEach((v) => close(v, 1, 1e-9));
	// Moving away first (overshoot), then towards the target.
	const back = velocityProfile(
		[
			{ t: 20, x: -20 },
			{ t: 40, x: -20 },
		],
		a0,
		{ t: 100, x: 100 },
		1,
		5,
	);
	assert.ok(back[0] < 0, 'moving away at the start');
	assert.ok(back[4] > 0, 'moving towards the target at the end');
});

/** Synthetic rows for one participant: MT = a + b·ID, deviations with a set SD. */
function syntheticRows({ session, a = 200, b = { pointing: 150, crossing: 120 }, dev = 6, practice = true }) {
	const rows = [];
	let seqNo = 0;
	for (const technique of TECHNIQUES) {
		for (const A of AMPLITUDES) {
			for (const W of WIDTHS) {
				seqNo++;
				const ID = indexOfDifficulty(A, W);
				for (let m = 1; m <= 10; m++) {
					const row = {
						assignment: 'A1',
						session,
						team: 'T1',
						participant: session,
						device: 'mouse',
						sequence: seqNo,
						practice: false,
						technique,
						A,
						W,
						ID,
						movement: m,
						direction: m % 2 ? 'right' : 'left',
						mt_ms: a + b[technique] * ID,
						hit: m !== 10,
						deviation_px: m % 2 ? dev : -dev,
						amplitude_px: A,
					};
					VELOCITY_KEYS.forEach(
						(k, i) => (row[k] = technique === 'pointing' ? Math.sin((Math.PI * (i + 0.5)) / 20) : 1),
					);
					rows.push(row);
				}
			}
		}
	}
	if (practice) rows.push({ ...rows[0], practice: true, mt_ms: 99999 });
	return rows;
}

test('session summary: fit, effective width and throughput', () => {
	const s = summarizeSession(syntheticRows({ session: 'P1' }));
	assert.equal(s.conditions.length, 12, 'practice left out');
	const p = s.techniques.pointing;
	close(p.fit.a, 200, 1e-6);
	close(p.fit.b, 150, 1e-6);
	close(p.fit.r2, 1, 1e-9);
	close(p.errorRate, 0.1, 1e-12);
	const c = s.conditions.find((x) => x.technique === 'pointing' && x.A === 480 && x.W === 30);
	const sdDev = Math.sqrt((10 * 36) / 9);
	close(c.We, WE_FACTOR * sdDev, 1e-9);
	close(c.IDe, Math.log2(480 / (WE_FACTOR * sdDev) + 1), 1e-9);
	close(c.tp, c.IDe / (c.mt / 1000), 1e-9);
	assert.equal(p.velocity.length, 20);
});

test('group summary: per-participant fits averaged with CIs and a paired TP difference', () => {
	const rows = [
		...syntheticRows({ session: 'P1', b: { pointing: 150, crossing: 120 } }),
		...syntheticRows({ session: 'P2', b: { pointing: 170, crossing: 130 } }),
		...syntheticRows({ session: 'P3', b: { pointing: 160, crossing: 110 } }),
	];
	const g = summarizeGroup(rows);
	assert.equal(g.participants.length, 3);
	close(g.techniques.pointing.b.mean, 160, 1e-6);
	assert.ok(g.techniques.pointing.b.half > 0);
	assert.equal(g.techniques.crossing.conditions.length, 6);
	assert.ok(g.tpDifference.mean > 0, 'crossing faster here, so higher TP');
	assert.equal(g.tpDifference.n, 3);
});

test('rows survive a CSV round trip unchanged for the analysis', () => {
	const rows = syntheticRows({ session: '007', practice: false }).slice(0, 30);
	const { records } = fromCSV(toCSV(rows, A1_SCHEMA), A1_SCHEMA);
	assert.equal(records[0].session, '007');
	assert.equal(records.length, 30);
	const before = summarizeSession(rows);
	const after = summarizeSession(records);
	close(after.conditions[0].mt, before.conditions[0].mt, 1e-3);
	close(after.conditions[0].We, before.conditions[0].We, 1e-3);
});
