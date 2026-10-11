/**
 * One reciprocal sequence of the 1D pointing or crossing task, DOM free.
 *
 * Two targets sit at x = cx ∓ A/2 and the participant goes back and forth
 * between them.
 *
 *   pointing  a press activates the active target; it is a hit when the
 *             press is within W/2 of the target's centre line.
 *   crossing  moving across the active target's line activates it; the
 *             crossing point is interpolated between pointer samples and
 *             is a hit when it lies within W/2 of the stage centre, i.e. on
 *             the goal segment of length W.
 *
 * After each activation the other target becomes active. The first
 * activation must be a hit and only starts the clock; the following
 * `movements` activations are timed. Misses are counted and the sequence
 * goes on, as in ISO 9241-9.
 */

export const VELOCITY_BINS = 20;

export class ReciprocalSequence {
	constructor({ technique, A, W, movements, cx, cy }) {
		this.technique = technique;
		this.A = A;
		this.W = W;
		this.movements = movements;
		this.cy = cy;
		this.targetX = [cx - A / 2, cx + A / 2];
		this.active = 0;
		this.activations = [];
		this.samples = [];
		this.last = null;
	}

	get started() {
		return this.activations.length > 0;
	}

	get done() {
		return this.activations.length > this.movements;
	}

	/** Number of timed movements completed so far. */
	get completed() {
		return Math.max(0, this.activations.length - 1);
	}

	record(x, y, t) {
		const p = { t, x, y };
		this.samples.push(p);
		const prev = this.last;
		this.last = p;
		return prev;
	}

	/**
	 * Pointer moved. For crossing, returns the activation when the active
	 * line was crossed ({ignored: true} for a missed start), else null.
	 */
	move(x, y, t, pointerType) {
		if (this.done) return null;
		const prev = this.record(x, y, t);
		if (this.technique !== 'crossing' || !prev || prev.x === x) return null;
		const gx = this.targetX[this.active];
		if ((prev.x - gx) * (x - gx) > 0) return null;
		const f = (gx - prev.x) / (x - prev.x);
		const yc = prev.y + f * (y - prev.y);
		return this.activate({
			t: prev.t + f * (t - prev.t),
			x: gx,
			y: yc,
			hit: Math.abs(yc - this.cy) <= this.W / 2,
			pointerType,
		});
	}

	/** Pointer pressed. For pointing, returns the activation, else null. */
	press(x, y, t, pointerType) {
		if (this.done) return null;
		this.record(x, y, t);
		if (this.technique !== 'pointing') return null;
		const tx = this.targetX[this.active];
		return this.activate({ t, x, y, hit: Math.abs(x - tx) <= this.W / 2, pointerType });
	}

	activate(a) {
		if (!this.started && !a.hit) return { ...a, ignored: true };
		const activation = { ...a, target: this.active };
		this.activations.push(activation);
		this.active = 1 - this.active;
		return activation;
	}

	/**
	 * The timed movements with their measures:
	 *   mt          time between the two activations (ms)
	 *   deviation   pointing: signed distance of the press from the target
	 *               centre along the movement (positive = overshoot);
	 *               crossing: offset of the crossing point from the goal
	 *               centre, across the movement
	 *   amplitude   actual distance between the two activation points
	 *   velocity    mean velocity towards the target (px/ms) in equal
	 *               slices of the movement time
	 */
	movementData(bins = VELOCITY_BINS) {
		const out = [];
		for (let i = 1; i < this.activations.length; i++) {
			const a0 = this.activations[i - 1];
			const a1 = this.activations[i];
			const tx = this.targetX[a1.target];
			const dir = tx > this.targetX[a0.target] ? 1 : -1;
			out.push({
				movement: i,
				direction: dir > 0 ? 'right' : 'left',
				mt: a1.t - a0.t,
				hit: a1.hit,
				deviation: this.technique === 'pointing' ? (a1.x - tx) * dir : a1.y - this.cy,
				amplitude: this.technique === 'pointing' ? Math.abs(a1.x - a0.x) : Math.hypot(a1.x - a0.x, a1.y - a0.y),
				pointerType: a1.pointerType || null,
				velocity: velocityProfile(this.samples, a0, a1, dir, bins),
			});
		}
		return out;
	}
}

/** Position x at time t, interpolated linearly between samples. */
function xAt(points, t) {
	if (t <= points[0].t) return points[0].x;
	for (let i = 1; i < points.length; i++) {
		if (points[i].t >= t) {
			const a = points[i - 1];
			const b = points[i];
			return b.t > a.t ? a.x + ((t - a.t) / (b.t - a.t)) * (b.x - a.x) : b.x;
		}
	}
	return points[points.length - 1].x;
}

/**
 * Mean velocity towards the target in `bins` equal slices of the movement:
 * displacement over the slice divided by its duration.
 */
export function velocityProfile(samples, a0, a1, dir, bins = VELOCITY_BINS) {
	const points = [a0, ...samples.filter((p) => p.t > a0.t && p.t < a1.t), a1];
	const span = a1.t - a0.t;
	const out = [];
	if (span <= 0) return new Array(bins).fill(0);
	let prevX = xAt(points, a0.t);
	for (let k = 1; k <= bins; k++) {
		const x = xAt(points, a0.t + (span * k) / bins);
		out.push((dir * (x - prevX)) / (span / bins));
		prevX = x;
	}
	return out;
}
