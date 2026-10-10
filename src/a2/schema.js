/**
 * Assignment 2 CSV: one row per attempt (failed attempts included). The same
 * keys are used for records in memory.
 */

export const SPEED_BINS = 20;
export const SPEED_KEYS = Array.from({ length: SPEED_BINS }, (_, i) => 's' + String(i + 1).padStart(2, '0'));

export const A2_SCHEMA = [
	{ key: 'assignment', type: 'string' },
	{ key: 'version', type: 'string' },
	{ key: 'session', type: 'string' },
	{ key: 'participant', type: 'string' },
	{ key: 'device', type: 'string' },
	{ key: 'hand', type: 'string' },
	{ key: 'browser', type: 'string' },
	{ key: 'viewport_w', type: 'int' },
	{ key: 'viewport_h', type: 'int' },
	{ key: 'dpr', type: 'number' },
	{ key: 'block', type: 'int' },
	{ key: 'trial', type: 'int' },
	{ key: 'attempt', type: 'int' },
	{ key: 'practice', type: 'boolean' },
	{ key: 'shape', type: 'string' },
	{ key: 'L', type: 'number' },
	{ key: 'W', type: 'number' },
	{ key: 'R', type: 'number' },
	{ key: 'direction', type: 'string' },
	{ key: 'ID', type: 'number' },
	{ key: 'completed', type: 'boolean' },
	{ key: 'fail_reason', type: 'string' },
	{ key: 'fail_position_px', type: 'number' },
	{ key: 'mt_ms', type: 'number' },
	{ key: 'path_ratio', type: 'number' },
	{ key: 'mean_abs_offset_px', type: 'number' },
	{ key: 'inside_offset_px', type: 'number' },
	{ key: 'pointer_type', type: 'string' },
	{ key: 'time', type: 'string' },
	...SPEED_KEYS.map((key) => ({ key, type: 'number' })),
];
