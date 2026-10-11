import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildPlan,
	conditions,
	requeue,
	makeTunnel,
	radiusFor,
	REPS,
	BLOCKS,
	MAX_ATTEMPTS,
	SHAPES,
	LENGTHS,
	WIDTHS,
} from '../src/a2/design.js';
import { speedProfile, offsets, summarizeSession, summarizeGroup } from '../src/a2/analysis.js';
import { A2_SCHEMA, SPEED_KEYS } from '../src/a2/schema.js';
import { SteeringTrial } from '../src/core/steering-trial.js';
import { pointAt } from '../src/core/geometry.js';
import { toCSV, fromCSV } from '../src/core/csv.js';
import { seededRandom } from '../src/core/random.js';

const close = (actual, expected, tol, msg = '') =>
	assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected}, got ${actual}`);

test('linear and circular tunnels of a condition have the same ID = L / W', () => {
	for (const c of conditions()) {
		for (const direction of c.shape === 'linear' ? ['right', 'left'] : ['cw', 'ccw']) {
			const t = makeTunnel({ ...c, direction }, 460, 180);
			close(t.id, c.L / c.W, 1e-6, `${c.shape} L=${c.L} W=${c.W}`);
			close(t.length, c.L, 1e-9);
		}
	}
	close(radiusFor(800), 127.32, 0.01);
});

test('tunnels fit the stage (920 × 360) with their start and finish zones', () => {
	for (const c of conditions()) {
		const t = makeTunnel({ ...c, direction: c.shape === 'linear' ? 'right' : 'cw' }, 460, 180);
		const xs = [];
		const ys = [];
		for (let s = -40; s <= c.L + 30; s += 5) {
			const p = pointAt(t, s);
			xs.push(p.x - (p.nx * p.w) / 2, p.x + (p.nx * p.w) / 2);
			ys.push(p.y - (p.ny * p.w) / 2, p.y + (p.ny * p.w) / 2);
		}
		assert.ok(Math.min(...xs) >= 5 && Math.max(...xs) <= 915, `${c.shape} ${c.L} x`);
		assert.ok(Math.min(...ys) >= 5 && Math.max(...ys) <= 355, `${c.shape} ${c.L} y`);
	}
});

test('plan: practice with every condition once, then balanced shuffled blocks', () => {
	const plan = buildPlan(seededRandom(5));
	assert.equal(plan.length, 1 + BLOCKS);
	assert.equal(plan[0].practice, true);
	assert.equal(plan[0].queue.length, SHAPES.length * LENGTHS.length * WIDTHS.length);
	for (const block of plan.slice(1)) {
		assert.equal(block.queue.length, 12 * REPS);
		const dirs = {};
		for (const { spec } of block.queue) {
			const key = `${spec.shape}${spec.L}${spec.W}${spec.direction}`;
			dirs[key] = (dirs[key] || 0) + 1;
		}
		assert.ok(
			Object.values(dirs).every((n) => n === REPS / 2),
			'each direction equally often',
		);
	}
});

test('requeue puts a failed trial later in the block, up to MAX_ATTEMPTS', () => {
	const block = { queue: [1, 2, 3, 4].map((n) => ({ spec: { n }, attempt: 1 })) };
	const rng = seededRandom(1);
	assert.equal(requeue(block, 1, rng), true);
	assert.equal(block.queue.length, 5);
	const again = block.queue.findIndex((q, i) => i > 1 && q.spec.n === 2);
	assert.ok(again > 1);
	assert.equal(block.queue[again].attempt, 2);
	block.queue[again].attempt = MAX_ATTEMPTS;
	assert.equal(requeue(block, again, rng), false);
});

test('start zone of straight tunnels is at least the minimum width', () => {
	const t = makeTunnel({ shape: 'linear', L: 500, W: 20, direction: 'right' }, 460, 180);
	// 15 px off the centre line: outside a 20 px tunnel, inside a 40 px zone.
	assert.equal(new SteeringTrial(t).press(190, 195, 0), null);
	assert.equal(new SteeringTrial(t, { minZoneWidth: 40 }).press(190, 195, 0), 'ready');
	const ring = makeTunnel({ shape: 'circular', L: 500, W: 20, direction: 'cw' }, 460, 180);
	assert.equal(new SteeringTrial(ring, { minZoneWidth: 40 }).minZoneWidth, 0, 'not for circles');
});

test('speed profile along the path', () => {
	// Constant 1 px/ms for the first half, 2 px/ms for the second.
	const samples = [];
	for (let t = -10; t <= 300; t += 2) samples.push({ t, s: t <= 200 ? t : 200 + 2 * (t - 200) });
	const v = speedProfile(samples, 400, 300, 4);
	close(v[0], 1, 1e-9);
	close(v[1], 1, 1e-9);
	close(v[2], 2, 1e-9);
	close(v[3], 2, 1e-9);
	assert.equal(speedProfile([{ t: 0, s: 0 }], 400, 100, 4), null, 'too few samples');
});

test('offset towards the centre is positive inside the circle in both directions', () => {
	const run = (direction) => {
		const t = makeTunnel({ shape: 'circular', L: 600, W: 40, direction }, 0, 0);
		const trial = new SteeringTrial(t);
		const R = radiusFor(600) - 8; // 8 px inside the centre line
		const sign = direction === 'cw' ? 1 : -1;
		const at = (deg) => {
			const a = ((-90 + sign * deg) * Math.PI) / 180;
			return [R * Math.cos(a), R * Math.sin(a)];
		};
		let time = 0;
		trial.press(...at(-6), time);
		for (let deg = -5; deg <= 365; deg += 1) trial.move(...at(deg), (time += 5));
		const r = trial.result();
		assert.equal(r.completed, true, direction);
		return offsets(r.samples, 600, r.mt, 'circular', direction);
	};
	close(run('cw').inside, 8, 0.5, 'cw');
	close(run('ccw').inside, 8, 0.5, 'ccw');
});

function syntheticRows({ session, device = 'mouse', b = { linear: 60, circular: 80 }, fail = true }) {
	const rows = [];
	let trial = 0;
	for (const c of conditions()) {
		for (let r = 0; r < 4; r++) {
			const row = {
				assignment: 'A2',
				session,
				participant: session,
				device,
				hand: 'right',
				block: 1,
				trial: ++trial,
				attempt: 1,
				practice: false,
				shape: c.shape,
				L: c.L,
				W: c.W,
				R: c.shape === 'circular' ? radiusFor(c.L) : null,
				direction: c.shape === 'linear' ? 'right' : 'cw',
				ID: c.ID,
				completed: true,
				fail_reason: null,
				mt_ms: 300 + b[c.shape] * c.ID,
				path_ratio: c.shape === 'circular' ? 1 - c.W / (4 * radiusFor(c.L)) : 1.01,
				mean_abs_offset_px: 3,
				inside_offset_px: c.shape === 'circular' ? 4 : null,
			};
			SPEED_KEYS.forEach((k) => (row[k] = c.W / (c.shape === 'linear' ? 45 : 60)));
			rows.push(row);
		}
		if (fail && c.shape === 'circular')
			rows.push({ ...rows[rows.length - 1], completed: false, mt_ms: null, attempt: 1 });
	}
	rows.push({ ...rows[0], practice: true, mt_ms: 99999 });
	return rows;
}

test('session summary: fits, IP, errors, path ratio and profiles', () => {
	const s = summarizeSession(syntheticRows({ session: 'S1' }));
	assert.equal(s.conditions.length, 12);
	close(s.shapes.linear.fit.b, 60, 1e-6);
	close(s.shapes.circular.fit.b, 80, 1e-6);
	close(s.shapes.linear.ip, 1000 / 60, 1e-6);
	close(s.shapes.linear.errorRate, 0, 1e-12);
	close(s.shapes.circular.errorRate, 6 / 30, 1e-12);
	const c = s.conditions.find((x) => x.shape === 'circular' && x.L === 500 && x.W === 40);
	close(c.pathRatio, 1 - 40 / (4 * radiusFor(500)), 1e-9);
	close(c.inside, 4, 1e-9);
	close(c.tp, c.ID / (c.mt / 1000), 1e-9);
	assert.deepEqual(Object.keys(s.shapes.linear.profiles).map(Number), WIDTHS);
});

test('group summary: paired slope and throughput differences', () => {
	const rows = [
		...syntheticRows({ session: 'S1', b: { linear: 60, circular: 80 } }),
		...syntheticRows({ session: 'S2', b: { linear: 70, circular: 95 }, device: 'stylus' }),
		...syntheticRows({ session: 'S3', b: { linear: 50, circular: 75 } }),
	];
	const g = summarizeGroup(rows);
	assert.equal(g.participants.length, 3);
	close(g.slopeDifference.mean, (20 + 25 + 25) / 3, 1e-6);
	assert.ok(g.tpDifference.mean < 0, 'circular has lower throughput');
	assert.equal(g.shapes.circular.conditions.length, 6);
	assert.equal(g.shapes.linear.profiles[20].length, 20);
});

test('rows survive a CSV round trip', () => {
	const rows = syntheticRows({ session: '0042' });
	const { records } = fromCSV(toCSV(rows, A2_SCHEMA), A2_SCHEMA);
	assert.equal(records[0].session, '0042');
	assert.equal(records.filter((r) => r.completed === false).length, 6);
	const before = summarizeSession(rows);
	const after = summarizeSession(records);
	close(after.shapes.circular.fit.b, before.shapes.circular.fit.b, 1e-3);
});
