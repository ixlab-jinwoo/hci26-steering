/**
 * Assignment 1 CSV: one row per timed movement. The same keys are used for
 * records in memory, so a file reads back into exactly what was analysed.
 */

import { VELOCITY_BINS } from './reciprocal.js';

export const VELOCITY_KEYS = Array.from({ length: VELOCITY_BINS }, (_, i) => 'v' + String(i + 1).padStart(2, '0'));

export const A1_SCHEMA = [
	{ key: 'assignment', type: 'string' },
	{ key: 'version', type: 'string' },
	{ key: 'session', type: 'string' },
	{ key: 'team', type: 'string' },
	{ key: 'participant', type: 'string' },
	{ key: 'device', type: 'string' },
	{ key: 'browser', type: 'string' },
	{ key: 'viewport_w', type: 'int' },
	{ key: 'viewport_h', type: 'int' },
	{ key: 'dpr', type: 'number' },
	{ key: 'sequence', type: 'int' },
	{ key: 'practice', type: 'boolean' },
	{ key: 'technique', type: 'string' },
	{ key: 'A', type: 'number' },
	{ key: 'W', type: 'number' },
	{ key: 'ID', type: 'number' },
	{ key: 'movement', type: 'int' },
	{ key: 'direction', type: 'string' },
	{ key: 'mt_ms', type: 'number' },
	{ key: 'hit', type: 'boolean' },
	{ key: 'deviation_px', type: 'number' },
	{ key: 'amplitude_px', type: 'number' },
	{ key: 'pointer_type', type: 'string' },
	{ key: 'time', type: 'string' },
	...VELOCITY_KEYS.map((key) => ({ key, type: 'number' })),
];
