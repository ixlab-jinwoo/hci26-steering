import { test } from 'node:test';
import assert from 'node:assert/strict';

import { straightTunnel, circularTunnel, taperedTunnel } from '../js/geometry.js';
import { SteeringTrial } from '../js/trial.js';

const close = (actual, expected, tol) =>
	assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

// Rightwards tunnel from x = 100 to x = 500 at y = 200.
const tunnel = () => straightTunnel({ length: 400, width: 30, cx: 300, cy: 200 });

/** Drag along a path at 1 px/ms; returns the events emitted. */
function drag(trial, points, t0 = 0) {
	const events = [];
	let t = t0;
	let [px, py] = points[0];
	events.push(trial.press(px, py, t));
	for (const [x, y] of points.slice(1)) {
		t += Math.hypot(x - px, y - py);
		events.push(trial.move(x, y, t));
		[px, py] = [x, y];
	}
	return { events: events.filter(Boolean), t };
}

function line(x0, y0, x1, y1, step = 3) {
	const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
	return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
}

test('a clean straight run completes with interpolated MT', () => {
	const trial = new SteeringTrial(tunnel());
	const { events } = drag(trial, line(80, 200, 520, 200));
	assert.deepEqual(events, ['ready', 'start', 'complete']);
	assert.equal(trial.state, 'done');
	const r = trial.result();
	assert.equal(r.completed, true);
	close(r.mt, 400, 1e-6);
	assert.equal(r.exits, 0);
	close(r.pathRatio, 1, 0.02);
	close(r.meanSpeed, 1, 1e-6);
});

test('pressing outside the start zone does nothing', () => {
	const trial = new SteeringTrial(tunnel());
	assert.equal(trial.press(300, 200, 0), null, 'inside the tunnel');
	assert.equal(trial.press(50, 200, 0), null, 'too far before the start line');
	assert.equal(trial.press(80, 230, 0), null, 'beside the start zone');
	assert.equal(trial.state, 'idle');
});

test('strict policy fails on leaving the tunnel', () => {
	const trial = new SteeringTrial(tunnel(), { policy: 'strict' });
	const path = [...line(80, 200, 250, 200), ...line(250, 200, 300, 240)];
	const { events } = drag(trial, path);
	assert.deepEqual(events, ['ready', 'start', 'fail']);
	const r = trial.result();
	assert.equal(r.completed, false);
	assert.equal(r.failReason, 'exit');
	assert.equal(r.mt, null);
	assert.equal(r.exits, 1);
	// Leaves at y > 215, i.e. x ≈ 269, s = x − 100.
	assert.ok(r.failPosition > 150 && r.failPosition < 200, `fail position ${r.failPosition}`);
});

test('lenient policy counts exits and time outside', () => {
	const trial = new SteeringTrial(tunnel(), { policy: 'lenient' });
	const path = [
		...line(80, 200, 200, 200),
		...line(200, 200, 200, 230), // out at y > 215
		...line(200, 230, 260, 230),
		...line(260, 230, 260, 200), // back in
		...line(260, 200, 520, 200),
	];
	const { events } = drag(trial, path);
	assert.deepEqual(events, ['ready', 'start', 'exit', 'reenter', 'complete']);
	const r = trial.result();
	assert.equal(r.completed, true);
	assert.equal(r.exits, 1);
	assert.ok(r.timeOutside > 60 && r.timeOutside < 100, `time outside ${r.timeOutside}`);
});

test('releasing the button mid-way fails the trial', () => {
	const trial = new SteeringTrial(tunnel());
	drag(trial, line(80, 200, 300, 200));
	assert.equal(trial.release(300, 200, 400), 'fail');
	assert.equal(trial.result().failReason, 'release');
});

test('releasing before the start line cancels without a result', () => {
	const trial = new SteeringTrial(tunnel());
	drag(trial, line(70, 200, 90, 200));
	assert.equal(trial.release(90, 200, 30), 'cancel');
	assert.equal(trial.state, 'idle');
	assert.equal(trial.result(), null);
});

test('going around the start line is an invalid start', () => {
	const trial = new SteeringTrial(tunnel());
	const path = [...line(80, 200, 80, 240), ...line(80, 240, 130, 240)];
	const { events } = drag(trial, path);
	assert.deepEqual(events, ['ready', 'invalid-start']);
	assert.equal(trial.state, 'idle');
});

test('a circular trial needs a full lap', () => {
	const R = 150;
	const trial = new SteeringTrial(circularTunnel({ radius: R, width: 40, cx: 0, cy: 0 }));
	const arc = (from, to) => {
		const pts = [];
		for (let k = from; k <= to; k += 1) {
			const a = ((k - 90) * Math.PI) / 180;
			pts.push([R * Math.cos(a), R * Math.sin(a)]);
		}
		return pts;
	};
	const { events } = drag(trial, arc(-8, 365));
	assert.deepEqual(events, ['ready', 'start', 'complete']);
	close(trial.result().mt, 2 * Math.PI * R, 1);
});

test('crossing the circular start line backwards does not finish', () => {
	const R = 150;
	const trial = new SteeringTrial(circularTunnel({ radius: R, width: 40, cx: 0, cy: 0 }), { policy: 'lenient' });
	const pts = [];
	for (let k = -8; k <= 20; k++) pts.push(k);
	for (let k = 20; k >= -30; k--) pts.push(k);
	const { events } = drag(
		trial,
		pts.map((k) => {
			const a = ((k - 90) * Math.PI) / 180;
			return [R * Math.cos(a), R * Math.sin(a)];
		}),
	);
	assert.deepEqual(events, ['ready', 'start', 'exit']);
	assert.equal(trial.state, 'steering');
});

test('tapered tunnel uses the local width', () => {
	// Narrowing from 80 to 20: y = 225 is inside at the start (half-width 40)
	// but outside near the end (half-width 10).
	const trial = new SteeringTrial(taperedTunnel({ length: 400, startWidth: 80, endWidth: 20, cx: 300, cy: 200 }));
	const { events } = drag(trial, [...line(80, 225, 400, 225)]);
	assert.deepEqual(events, ['ready', 'start', 'fail']);
	// Half-width 25 is reached at s = 200 (x = 300).
	close(trial.result().failPosition, 200, 4);
});
