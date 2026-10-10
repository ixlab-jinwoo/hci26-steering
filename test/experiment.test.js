import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	DEFAULT_DESIGN,
	DIRECTIONS,
	buildPlan,
	conditionsFor,
	conditionKey,
	Session,
	parseNumberList,
	parseWidthPairs,
} from '../js/experiment.js';

// Deterministic RNG for repeatable plans.
function lcg(seed = 1) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

test('default design has 9 + 6 + 6 conditions', () => {
	assert.equal(conditionsFor('straight', DEFAULT_DESIGN).length, 9);
	assert.equal(conditionsFor('circular', DEFAULT_DESIGN).length, 6);
	assert.equal(conditionsFor('tapered', DEFAULT_DESIGN).length, 6);
});

test('plan: one sequence per condition plus a practice sequence per block', () => {
	const plan = buildPlan(DEFAULT_DESIGN, lcg(7));
	assert.equal(plan.length, 9 + 6 + 6 + 3);
	assert.equal(plan.filter((s) => s.practice).length, 3);
	// Blocks stay in shape order without shuffleBlocks.
	const shapes = plan.map((s) => s.condition.shape);
	assert.deepEqual([...new Set(shapes)], ['straight', 'circular', 'tapered']);
	// Every condition appears exactly once outside practice.
	const keys = plan.filter((s) => !s.practice).map((s) => conditionKey(s.condition));
	assert.equal(new Set(keys).size, keys.length);
});

test('plan: directions cycle within a sequence', () => {
	const plan = buildPlan({ ...DEFAULT_DESIGN, practice: false }, lcg(3));
	const straight = plan.find((s) => s.condition.shape === 'straight');
	assert.deepEqual(
		straight.trials.map((t) => t.angle),
		DIRECTIONS,
	);
	const circular = plan.find((s) => s.condition.shape === 'circular');
	assert.deepEqual(
		circular.trials.map((t) => t.clockwise),
		[true, false, true, false],
	);
});

test('plan: disabled shapes are skipped', () => {
	const design = {
		...DEFAULT_DESIGN,
		practice: false,
		circular: { ...DEFAULT_DESIGN.circular, enabled: false },
		tapered: { ...DEFAULT_DESIGN.tapered, enabled: false },
	};
	const plan = buildPlan(design, lcg(1));
	assert.equal(plan.length, 9);
	assert.ok(plan.every((s) => s.condition.shape === 'straight'));
});

test('session repeats failed trials at the end of the sequence, up to maxAttempts', () => {
	const plan = [
		{ condition: { shape: 'straight' }, practice: false, trials: [{ n: 1 }, { n: 2 }] },
		{ condition: { shape: 'straight' }, practice: false, trials: [{ n: 3 }] },
	];
	const session = new Session(plan, { maxAttempts: 2 });
	const seen = [];
	const outcomes = [false, true, false, true]; // n1 fails twice, n2 ok
	let i = 0;
	while (!session.done && session.current.sequence === 0) {
		seen.push([session.current.spec.n, session.current.attempt]);
		session.advance(outcomes[i++]);
	}
	assert.deepEqual(seen, [
		[1, 1],
		[2, 1],
		[1, 2],
	]);
	assert.equal(session.current.spec.n, 3);
	session.advance(true);
	assert.equal(session.done, true);
});

test('parsing design inputs', () => {
	assert.deepEqual(parseNumberList('200, 400 600'), [200, 400, 600]);
	assert.throws(() => parseNumberList('200, -1'));
	assert.throws(() => parseNumberList(''));
	assert.deepEqual(parseWidthPairs('80>20, 20 -> 80; 40→60'), [
		[80, 20],
		[20, 80],
		[40, 60],
	]);
	assert.throws(() => parseWidthPairs('80-20'));
	assert.throws(() => parseWidthPairs('0>20'));
});
