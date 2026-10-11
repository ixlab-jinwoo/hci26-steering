/**
 * Assignment 2 design: linear vs. circular steering at equal index of
 * difficulty.
 *
 * Both shapes use the same path lengths L and widths W, so each condition
 * has ID = L / W for both: a straight tunnel of length L, or a full circle
 * of circumference L (radius L / 2π). Directions are balanced: left/right
 * for linear, clockwise/counter-clockwise for circular.
 *
 * A practice block (one trial per condition) is followed by two blocks in
 * which every condition appears REPS times; the order within a block is
 * random. A failed trial is repeated later in the same block, at a random
 * position, up to MAX_ATTEMPTS attempts.
 */

import { shuffle } from '../core/random.js';
import { straightTunnel, circularTunnel } from '../core/geometry.js';

export const SHAPES = ['linear', 'circular'];
export const LENGTHS = [500, 800];
export const WIDTHS = [20, 30, 40];
export const REPS = 4;
export const BLOCKS = 2;
export const MAX_ATTEMPTS = 3;

export const SHAPE_LABEL = { linear: 'Linear', circular: 'Circular' };
export const DIRECTIONS = { linear: ['right', 'left'], circular: ['cw', 'ccw'] };

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

/** The blocks of a session: practice, then BLOCKS main blocks. */
export function buildPlan(rng = Math.random) {
	const conds = conditions();
	const blocks = [
		{
			name: 'Practice',
			practice: true,
			trials: shuffle(
				conds.map((c) => ({ ...c, direction: DIRECTIONS[c.shape][Math.floor(rng() * 2)] })),
				rng,
			),
		},
	];
	for (let b = 1; b <= BLOCKS; b++) {
		const trials = [];
		for (const c of conds) {
			for (let r = 0; r < REPS; r++) trials.push({ ...c, direction: DIRECTIONS[c.shape][r % 2] });
		}
		blocks.push({ name: `Block ${b} of ${BLOCKS}`, practice: false, trials: shuffle(trials, rng) });
	}
	return blocks.map((block, i) => ({
		...block,
		number: i,
		queue: block.trials.map((spec) => ({ spec, attempt: 1 })),
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
		return straightTunnel({ length: spec.L, width: spec.W, angle: spec.direction === 'right' ? 0 : 180, cx, cy });
	}
	return circularTunnel({ radius: radiusFor(spec.L), width: spec.W, clockwise: spec.direction === 'cw', cx, cy });
}
