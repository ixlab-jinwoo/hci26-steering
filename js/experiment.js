/**
 * Experimental design: conditions, trial sequences and the session queue.
 *
 * A condition is a tunnel without its direction (shape + size). A sequence
 * runs all trials of one condition back to back while the direction cycles
 * (8 directions for straight and tapered tunnels, alternating CW/CCW for
 * circular ones), much like a round of the ISO 9241-9 tapping task.
 */

export const SHAPES = ['straight', 'circular', 'tapered'];

export const SHAPE_NAMES = { straight: 'Straight', circular: 'Circular', tapered: 'Tapered' };

// Consecutive directions are opposite, so each trial starts near where the
// previous one ended.
export const DIRECTIONS = [0, 180, 45, 225, 90, 270, 135, 315];

export const DEFAULT_DESIGN = {
	straight: { enabled: true, lengths: [200, 400, 600], widths: [15, 30, 60], trials: 8 },
	circular: { enabled: true, radii: [100, 200], widths: [30, 50, 80], trials: 4 },
	tapered: {
		enabled: true,
		length: 600,
		pairs: [
			[80, 20],
			[20, 80],
			[60, 20],
			[20, 60],
			[80, 40],
			[40, 80],
		],
		trials: 4,
	},
	practice: true,
	shuffleBlocks: false,
	maxAttempts: 3,
};

export const PRACTICE_TRIALS = 4;

/** Key identifying a condition: shape and size, not direction. */
export function conditionKey(c) {
	switch (c.shape) {
		case 'straight':
			return `straight|A${c.length}|W${c.width}`;
		case 'circular':
			return `circular|R${c.radius}|W${c.width}`;
		case 'tapered':
			return `tapered|A${c.length}|W${c.startWidth}-${c.endWidth}`;
		default:
			throw new Error('Unknown tunnel shape: ' + c.shape);
	}
}

/** Short human-readable description of a condition. */
export function conditionLabel(c) {
	switch (c.shape) {
		case 'straight':
			return `Straight A=${c.length} W=${c.width}`;
		case 'circular':
			return `Circular R=${c.radius} W=${c.width}`;
		case 'tapered':
			return `Tapered A=${c.length} W=${c.startWidth}→${c.endWidth}`;
		default:
			return c.shape;
	}
}

/** Label of the width "family" of a condition, used to group speed profiles. */
export function widthLabel(c) {
	return c.shape === 'tapered' ? `W=${c.startWidth}→${c.endWidth}` : `W=${c.width}`;
}

export function conditionsFor(shape, design) {
	const d = design[shape];
	const out = [];
	if (shape === 'straight') {
		for (const length of d.lengths) for (const width of d.widths) out.push({ shape, length, width });
	} else if (shape === 'circular') {
		for (const radius of d.radii) for (const width of d.widths) out.push({ shape, radius, width });
	} else if (shape === 'tapered') {
		for (const [startWidth, endWidth] of d.pairs) out.push({ shape, length: d.length, startWidth, endWidth });
	}
	return out;
}

/** The i-th trial of a sequence: the condition plus its direction. */
export function trialSpec(condition, i) {
	if (condition.shape === 'circular') return { ...condition, clockwise: i % 2 === 0 };
	return { ...condition, angle: DIRECTIONS[i % DIRECTIONS.length] };
}

export function shuffle(items, rng = Math.random) {
	const a = items.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/**
 * Build the list of sequences for an experiment. Shapes form blocks; the
 * order of conditions within a block is randomised. With practice enabled,
 * each block starts with a short practice sequence.
 */
export function buildPlan(design, rng = Math.random) {
	let shapes = SHAPES.filter((s) => design[s] && design[s].enabled);
	if (design.shuffleBlocks) shapes = shuffle(shapes, rng);

	const sequences = [];
	for (const shape of shapes) {
		const conditions = shuffle(conditionsFor(shape, design), rng);
		if (!conditions.length) continue;
		const count = design[shape].trials;
		if (design.practice) {
			const c = conditions[Math.floor(rng() * conditions.length)];
			const n = Math.min(PRACTICE_TRIALS, count);
			sequences.push({ condition: c, practice: true, trials: range(n).map((i) => trialSpec(c, i)) });
		}
		for (const c of conditions) {
			sequences.push({ condition: c, practice: false, trials: range(count).map((i) => trialSpec(c, i)) });
		}
	}
	return sequences;
}

function range(n) {
	return Array.from({ length: n }, (_, i) => i);
}

/**
 * Walks through a plan. A failed trial is repeated at the end of its own
 * sequence, up to maxAttempts attempts in total.
 */
export class Session {
	constructor(plan, { maxAttempts = 3 } = {}) {
		this.sequences = plan.map((seq) => ({
			...seq,
			queue: seq.trials.map((spec) => ({ spec, attempt: 1 })),
		}));
		this.maxAttempts = maxAttempts;
		this.seqIndex = 0;
		this.trialIndex = 0;
	}

	get done() {
		return this.seqIndex >= this.sequences.length;
	}

	get current() {
		if (this.done) return null;
		const seq = this.sequences[this.seqIndex];
		const item = seq.queue[this.trialIndex];
		return {
			spec: item.spec,
			attempt: item.attempt,
			practice: seq.practice,
			sequence: this.seqIndex,
			trial: this.trialIndex,
		};
	}

	get progress() {
		const seq = this.sequences[Math.min(this.seqIndex, this.sequences.length - 1)];
		return {
			sequence: this.seqIndex + 1,
			sequences: this.sequences.length,
			trial: this.trialIndex + 1,
			trials: seq ? seq.queue.length : 0,
		};
	}

	/** Record the outcome of the current trial and move on. */
	advance(success) {
		if (this.done) return;
		const seq = this.sequences[this.seqIndex];
		const item = seq.queue[this.trialIndex];
		if (!success && item.attempt < this.maxAttempts) {
			seq.queue.push({ spec: item.spec, attempt: item.attempt + 1 });
		}
		this.trialIndex++;
		if (this.trialIndex >= seq.queue.length) {
			this.seqIndex++;
			this.trialIndex = 0;
		}
	}
}

/** Parse "200, 400, 600" into positive numbers. Throws on invalid input. */
export function parseNumberList(text) {
	const parts = String(text)
		.split(/[,\s]+/)
		.filter((p) => p !== '');
	if (!parts.length) throw new Error('Enter at least one value.');
	return parts.map((p) => {
		const v = Number(p);
		if (!Number.isFinite(v) || v <= 0) throw new Error(`"${p}" is not a positive number.`);
		return v;
	});
}

/** Parse "80>20, 20>80" into width pairs. Throws on invalid input. */
export function parseWidthPairs(text) {
	const parts = String(text)
		.split(/[,;]+/)
		.map((p) => p.trim())
		.filter((p) => p !== '');
	if (!parts.length) throw new Error('Enter at least one width pair.');
	return parts.map((p) => {
		const m = p.match(/^(\d+(?:\.\d+)?)\s*(?:>|->|→)\s*(\d+(?:\.\d+)?)$/);
		if (!m) throw new Error(`"${p}" is not a width pair like 80>20.`);
		const pair = [Number(m[1]), Number(m[2])];
		if (pair[0] <= 0 || pair[1] <= 0) throw new Error(`"${p}": widths must be positive.`);
		return pair;
	});
}
