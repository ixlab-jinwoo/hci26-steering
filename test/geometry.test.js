import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	straightTunnel,
	taperedTunnel,
	circularTunnel,
	closedFormID,
	locate,
	createTracker,
	pointAt,
	widthAt,
	bandPolygon,
} from '../js/geometry.js';

const close = (actual, expected, tol, msg) =>
	assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected}, got ${actual}`);

test('straight tunnel: ID = A / W', () => {
	const t = straightTunnel({ length: 400, width: 30 });
	close(t.id, 400 / 30, 1e-9);
	assert.equal(closedFormID(t.params), 400 / 30);
});

test('circular tunnel: ID = 2πR / W', () => {
	for (const [R, W] of [
		[100, 30],
		[200, 50],
	]) {
		const t = circularTunnel({ radius: R, width: W });
		close(t.id, (2 * Math.PI * R) / W, 1e-6);
		close(t.id, closedFormID(t.params), 1e-6);
	}
});

test('tapered tunnel: ID = A / (W1 − W2) · ln(W1 / W2), same in both directions', () => {
	const narrowing = taperedTunnel({ length: 600, startWidth: 80, endWidth: 20 });
	const widening = taperedTunnel({ length: 600, startWidth: 20, endWidth: 80 });
	const expected = (600 / 60) * Math.log(4);
	close(narrowing.id, expected, expected * 1e-4);
	close(widening.id, expected, expected * 1e-4);
	close(closedFormID(narrowing.params), expected, 1e-9);
	close(widthAt(narrowing, 300), 50, 1e-9);
});

test('locate on a straight tunnel gives arc length and signed offset', () => {
	// Rightwards from (100, 200) to (500, 200).
	const t = straightTunnel({ length: 400, width: 30, cx: 300, cy: 200 });
	let loc = locate(t, 200, 205);
	close(loc.s, 100, 1e-9);
	close(loc.d, 5, 1e-9, 'below the line is right of travel');
	loc = locate(t, 350, 190);
	close(loc.s, 250, 1e-9);
	close(loc.d, -10, 1e-9);
	close(loc.w, 30, 1e-9);
});

test('locate extends open tunnels beyond their ends', () => {
	const t = straightTunnel({ length: 400, width: 30, cx: 300, cy: 200 });
	close(locate(t, 80, 200).s, -20, 1e-9);
	close(locate(t, 530, 210).s, 430, 1e-9);
	close(locate(t, 530, 210).d, 10, 1e-9);
});

test('locate respects the direction of travel', () => {
	const t = straightTunnel({ length: 400, width: 30, angle: 180, cx: 300, cy: 200 });
	const loc = locate(t, 400, 205);
	close(loc.s, 100, 1e-9);
	close(loc.d, -5, 1e-9);
	const down = straightTunnel({ length: 400, width: 30, angle: 90, cx: 300, cy: 300 });
	close(locate(down, 300, 150).s, 50, 1e-9);
});

test('locate on a circle', () => {
	const t = circularTunnel({ radius: 100, width: 30, cx: 0, cy: 0, clockwise: true });
	// Start at the top (0, -100); clockwise on screen moves to +x first.
	let loc = locate(t, 100, 0);
	close(loc.s, (2 * Math.PI * 100) / 4, 0.05);
	close(loc.d, 0, 0.05);
	loc = locate(t, 0, 110);
	close(loc.s, Math.PI * 100, 0.05);
	close(Math.abs(loc.d), 10, 0.05);
	// Outside the circle is to the left when travelling clockwise.
	assert.ok(loc.d < 0);
});

test('tracker unwraps progress over the seam of a closed tunnel', () => {
	const R = 100;
	const t = circularTunnel({ radius: R, width: 30, cx: 0, cy: 0, clockwise: true });
	const tracker = createTracker(t);
	// Start a little before the start line (counter-clockwise of the top).
	let last;
	for (let k = -10; k <= 370; k += 2) {
		const a = ((k - 90) * Math.PI) / 180;
		last = tracker.update(R * Math.cos(a), R * Math.sin(a));
		if (k === -10) assert.ok(last.progress < 0, 'starts with negative progress');
	}
	close(last.progress, (370 / 360) * 2 * Math.PI * R, 0.5);
});

test('tracker does not jump across a narrow gap', () => {
	// The two halves of a small circle are 2R apart; the window keeps the
	// tracker on the side it came from.
	const t = circularTunnel({ radius: 60, width: 20, cx: 0, cy: 0 });
	const tracker = createTracker(t);
	let p;
	for (let k = -5; k <= 175; k += 5) {
		const a = ((k - 90) * Math.PI) / 180;
		p = tracker.update(60 * Math.cos(a), 60 * Math.sin(a));
	}
	close(p.progress, (175 / 360) * 2 * Math.PI * 60, 0.5);
});

test('pointAt and bandPolygon', () => {
	const t = straightTunnel({ length: 400, width: 30, cx: 300, cy: 200 });
	const p = pointAt(t, -40);
	close(p.x, 60, 1e-9);
	close(p.w, 30, 1e-9);
	const poly = bandPolygon(t, -40, 0, 10);
	assert.equal(poly.length, 10);
	const ys = poly.map((q) => q[1]);
	close(Math.min(...ys), 185, 1e-9);
	close(Math.max(...ys), 215, 1e-9);
});
