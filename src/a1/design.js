/**
 * Assignment 1 design: pointing vs. crossing in a 1D reciprocal task.
 *
 * Both techniques use the same amplitudes A and widths W, so every condition
 * has the same index of difficulty ID = log2(A / W + 1) for both. A sequence
 * is one condition run back and forth between two targets; the first
 * activation only starts the clock, the next MOVEMENTS are timed.
 */

import { shuffle } from '../core/random.js';

export const TECHNIQUES = ['pointing', 'crossing'];
export const AMPLITUDES = [240, 480];
export const WIDTHS = [15, 30, 60];
export const MOVEMENTS = 10;
export const PRACTICE = { A: 360, W: 30, movements: 5 };

export const TECHNIQUE_LABEL = { pointing: 'Pointing', crossing: 'Crossing' };

export function indexOfDifficulty(A, W) {
	return Math.log2(A / W + 1);
}

export function conditionKey(c) {
	return `${c.technique}|A${c.A}|W${c.W}`;
}

/**
 * Practice for both techniques first (in random order), then all
 * technique × A × W sequences in random order.
 */
export function buildPlan(rng = Math.random) {
	const practice = shuffle(TECHNIQUES, rng).map((technique) => ({
		technique,
		A: PRACTICE.A,
		W: PRACTICE.W,
		movements: PRACTICE.movements,
		practice: true,
	}));
	const main = [];
	for (const technique of TECHNIQUES) {
		for (const A of AMPLITUDES) {
			for (const W of WIDTHS) main.push({ technique, A, W, movements: MOVEMENTS, practice: false });
		}
	}
	return [...practice, ...shuffle(main, rng)];
}
