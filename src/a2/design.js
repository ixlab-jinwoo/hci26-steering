/**
 * Assignment 2 design: linear vs. circular steering at equal index of
 * difficulty.
 *
 * Both shapes use the same path lengths L and widths W, so each condition
 * has ID = L / W for both: a straight tunnel of length L (left to right), or
 * a full circle of circumference L (radius L / 2π, clockwise).
 *
 * Four practice trials (both shapes, the widest and the narrowest tunnel)
 * are followed by one block in which every condition appears REPS times in
 * random order. A failed trial is repeated later in the same block, at a
 * random position, up to MAX_ATTEMPTS attempts.
 */

import { shuffle } from '../core/random.js';
import { straightTunnel, circularTunnel } from '../core/geometry.js';

export const SHAPES = ['linear', 'circular'];
export const LENGTHS = [500, 800];
export const WIDTHS = [30, 45, 60];
export const REPS = 3;
export const MAX_ATTEMPTS = 3;
export const PRACTICE = [
	{ L: 500, W: 60 },
	{ L: 800, W: 30 },
];

export const SHAPE_LABEL = { linear: 'Linear', circular: 'Circular' };
export const DIRECTION = { linear: 'right', circular: 'cw' };

export function radiusFor(L) {
	return L / (2 * Math.PI);
}

export function conditionKey(c) {
	return `${c.shape}|L${c.L}|W${c.W}`;
}

export function conditions() {
	const out = [];
	for (const shape of SHAPES) for (const L of LENGTHS) for (const W of WIDTHS) out.push({ shape, L, W, ID: L / W });
	return out;
}

/** The blocks of a session: practice, then the trials. */
export function buildPlan(rng = Math.random) {
	const spec = (shape, c) => ({ shape, L: c.L, W: c.W, ID: c.L / c.W, direction: DIRECTION[shape] });
	const practice = PRACTICE.flatMap((c) => SHAPES.map((shape) => spec(shape, c)));
	const trials = [];
	for (const c of conditions()) for (let r = 0; r < REPS; r++) trials.push(spec(c.shape, c));
	return [
		{ name: 'Practice', practice: true, trials: practice },
		{ name: 'Trials', practice: false, trials: shuffle(trials, rng) },
	].map((block, i) => ({
		...block,
		number: i,
		queue: block.trials.map((s) => ({ spec: s, attempt: 1 })),
	}));
}

/**
 * After a failed attempt, put the trial back at a random later position in
 * the same block (or drop it after MAX_ATTEMPTS). Returns true if requeued.
 */
export function requeue(block, index, rng = Math.random) {
	const item = block.queue[index];
	if (item.attempt >= MAX_ATTEMPTS) return false;
	const pos = index + 1 + Math.floor(rng() * (block.queue.length - index));
	block.queue.splice(pos, 0, { spec: item.spec, attempt: item.attempt + 1 });
	return true;
}

export function makeTunnel(spec, cx, cy) {
	if (spec.shape === 'linear') {
		return straightTunnel({ length: spec.L, width: spec.W, angle: spec.direction === 'left' ? 180 : 0, cx, cy });
	}
	return circularTunnel({ radius: radiusFor(spec.L), width: spec.W, clockwise: spec.direction !== 'ccw', cx, cy });
}
