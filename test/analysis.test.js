import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	linearFit,
	fitThroughOrigin,
	summarizeConditions,
	datasetModels,
	speedSeries,
	localLaw,
	speedProfiles,
	WE_FACTOR,
} from '../js/analysis.js';

const close = (actual, expected, tol) =>
	assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

/**
 * Synthetic completed trial along a straight tunnel at constant speed v
 * (px/ms), with a lateral offset alternating between +dev and −dev.
 */
function fakeTrial({ datasetId = 1, length = 400, width = 40, v = 1, dev = 5, mt, ...rest }) {
	const duration = mt ?? length / v;
	const samples = [];
	for (let t = -20, i = 0; t <= duration + 20; t += 5, i++) {
		samples.push({ t, x: 0, y: 0, s: (t * length) / duration, d: i % 2 ? dev : -dev });
	}
	return {
		datasetId,
		shape: 'straight',
		length,
		width,
		L: length,
		ID: length / width,
		completed: true,
		exits: 0,
		mt: duration,
		elapsed: duration,
		practice: false,
		samples,
		...rest,
	};
}

test('linearFit recovers an exact line', () => {
	const fit = linearFit([1, 2, 3, 4], [150, 250, 350, 450]);
	close(fit.a, 50, 1e-9);
	close(fit.b, 100, 1e-9);
	close(fit.r2, 1, 1e-12);
	assert.equal(linearFit([1, 1], [2, 3]), null);
});

test('fitThroughOrigin', () => {
	close(fitThroughOrigin([10, 20, 30], [1, 2, 3]).k, 0.1, 1e-12);
});

test('summarizeConditions: error rate, MT, effective width', () => {
	const trials = [
		fakeTrial({ mt: 800 }),
		fakeTrial({ mt: 1000 }),
		fakeTrial({ mt: 1200 }),
		{ ...fakeTrial({}), completed: false, mt: null, exits: 1 },
		{ ...fakeTrial({ mt: 5000 }), practice: true },
	];
	const [c] = summarizeConditions(trials);
	assert.equal(c.attempts, 4, 'practice excluded');
	assert.equal(c.errors, 1);
	close(c.errorRate, 0.25, 1e-12);
	assert.equal(c.n, 3);
	close(c.mt, 1000, 1e-9);
	// d alternates ±5 in a 40 px tunnel: σ_u ≈ 5 / 40.
	close(c.sigmaU, 5 / 40, 0.005);
	close(c.We, WE_FACTOR * 5, 0.3);
	close(c.IDe, 400 / (WE_FACTOR * 5), 0.5);
	close(c.tp, c.IDe / 1, 1e-9);
});

test('summarizeConditions drops MT outliers beyond 3 SD', () => {
	const mts = [1000, 1010, 990, 1005, 995, 1002, 998, 1001, 999, 1003, 997, 5000];
	const [c] = summarizeConditions(mts.map((mt) => fakeTrial({ mt })));
	assert.equal(c.removed, 1);
	assert.equal(c.n, 11);
});

test('datasetModels fits MT = a + b·ID over condition means', () => {
	const trials = [];
	for (const width of [20, 40, 80]) {
		const id = 400 / width;
		for (let k = 0; k < 3; k++) trials.push(fakeTrial({ width, mt: 200 + 50 * id }));
	}
	const models = datasetModels(summarizeConditions(trials));
	const m = models.get(1);
	close(m.nominal.a, 200, 1e-6);
	close(m.nominal.b, 50, 1e-6);
	close(m.ip, 20, 1e-6);
});

test('speedSeries of a constant-speed trial', () => {
	const series = speedSeries(fakeTrial({ v: 0.8 }));
	assert.ok(series.length > 10);
	for (const p of series) close(p.v, 0.8, 1e-9);
});

test('localLaw recovers v = W / τ', () => {
	const tau = 50; // ms
	const trials = [20, 40, 60].map((width) => fakeTrial({ width, v: width / tau }));
	const law = localLaw(trials).get(1);
	close(law.tau, tau, 1e-6);
	assert.deepEqual(
		law.bins.map((b) => b.w),
		[20, 40, 60],
	);
});

test('speedProfiles groups by width', () => {
	const trials = [fakeTrial({ width: 20, v: 0.5 }), fakeTrial({ width: 20, v: 0.7 }), fakeTrial({ width: 40, v: 1 })];
	const profiles = speedProfiles(trials, 10);
	assert.deepEqual(
		profiles.map((p) => [p.label, p.n]),
		[
			['W=20', 2],
			['W=40', 1],
		],
	);
	close(profiles[0].points[5].mean, 0.6, 1e-9);
});
