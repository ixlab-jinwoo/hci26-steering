/**
 * A single steering trial, independent of the DOM.
 *
 *   idle ──press in start zone──▶ ready ──cross start line──▶ steering
 *   steering ──cross finish line──▶ done
 *   steering ──leave tunnel (strict) / release button──▶ failed
 *
 * With `hold` (the default) input is drag based: the button has to be held
 * from the start zone to the finish line. Without it (touchpads), a press
 * in the start zone only arms the trial; the pointer then steers without a
 * button and releases are ignored. Timing starts and stops when the pointer
 * crosses the start and finish lines; crossing times are interpolated
 * between samples.
 *
 * Error policies:
 *   strict   leaving the tunnel ends the trial as an error.
 *   lenient  exits are counted (number, position, time outside) and the
 *            trial goes on until the finish line.
 */

import { createTracker, widthAt } from './geometry.js';

export const START_ZONE = 40; // px of tunnel before the start line

export class SteeringTrial {
	/**
	 * @param minZoneWidth  open tunnels only: the start zone is at least this
	 *     wide across the tunnel (the start line itself keeps the tunnel width)
	 * @param hold  the button has to be held while steering
	 */
	constructor(tunnel, { policy = 'strict', startZone = START_ZONE, minZoneWidth = 0, hold = true } = {}) {
		this.tunnel = tunnel;
		this.policy = policy;
		this.hold = hold;
		this.startZone = startZone;
		this.minZoneWidth = tunnel.closed ? 0 : minZoneWidth;
		this.state = 'idle';
		this.reset();
	}

	reset() {
		this.tracker = null;
		this.samples = [];
		this.t0 = null;
		this.t1 = null;
		this.inside = true;
		this.outsideSince = null;
		this.exits = 0;
		this.exitPositions = [];
		this.timeOutside = 0;
		this.failReason = null;
		this.failPosition = null;
	}

	/** Pointer pressed. Returns 'ready' when the press is in the start zone. */
	press(x, y, t) {
		if (this.state !== 'idle') return null;
		const tracker = createTracker(this.tunnel);
		const loc = tracker.update(x, y);
		const half = Math.max(loc.w, this.minZoneWidth) / 2;
		if (loc.progress < -this.startZone || loc.progress >= 0 || Math.abs(loc.d) > half) return null;

		this.reset();
		this.tracker = tracker;
		this.state = 'ready';
		this.record(x, y, t, loc);
		return 'ready';
	}

	/**
	 * Pointer moved (with the button held, unless without `hold`).
	 * Returns 'start', 'invalid-start', 'exit', 'reenter', 'complete', 'fail' or null.
	 */
	move(x, y, t) {
		if (this.state !== 'ready' && this.state !== 'steering') return null;
		const prev = this.samples[this.samples.length - 1];
		if (x === prev.x && y === prev.y) return null;
		const cur = this.record(x, y, t, this.tracker.update(x, y));
		return this.state === 'ready' ? this.checkStart(prev, cur) : this.checkSteering(prev, cur);
	}

	/**
	 * Pointer released. Returns 'cancel' (before the start line), 'fail' or
	 * null; always null without `hold`.
	 */
	release(x, y, t) {
		if (!this.hold) return null;
		if (this.state === 'ready') {
			this.state = 'idle';
			this.reset();
			return 'cancel';
		}
		if (this.state !== 'steering') return null;
		const event = this.move(x, y, t);
		if (this.state !== 'steering') return event;
		return this.fail('release', this.samples[this.samples.length - 1]);
	}

	record(x, y, t, loc) {
		const p = { t, x, y, s: loc.progress, d: loc.d, w: loc.w };
		this.samples.push(p);
		return p;
	}

	crossing(prev, cur, level) {
		const f = (level - prev.s) / (cur.s - prev.s);
		return {
			t: prev.t + f * (cur.t - prev.t),
			d: prev.d + f * (cur.d - prev.d),
			w: widthAt(this.tunnel, level),
		};
	}

	checkStart(prev, cur) {
		if (!(prev.s < 0 && cur.s >= 0)) return null;
		const c = this.crossing(prev, cur, 0);
		if (Math.abs(c.d) > c.w / 2) {
			// Went around the start line instead of through it.
			this.state = 'idle';
			this.reset();
			return 'invalid-start';
		}
		this.state = 'steering';
		this.t0 = c.t;
		return 'start';
	}

	checkSteering(prev, cur) {
		const L = this.tunnel.length;

		if (prev.s < L && cur.s >= L) {
			const c = this.crossing(prev, cur, L);
			if (this.policy === 'strict' && Math.abs(c.d) > c.w / 2) {
				return this.fail('exit', { s: L, t: c.t });
			}
			if (!this.inside) this.timeOutside += c.t - this.outsideSince;
			this.t1 = c.t;
			this.state = 'done';
			return 'complete';
		}

		const inside = cur.s >= 0 && cur.s <= L && Math.abs(cur.d) <= cur.w / 2;
		if (inside === this.inside) return null;

		if (!inside) {
			if (this.policy === 'strict') return this.fail('exit', cur);
			this.inside = false;
			this.outsideSince = cur.t;
			this.exits++;
			this.exitPositions.push(clamp(cur.s, 0, L));
			return 'exit';
		}

		this.inside = true;
		this.timeOutside += cur.t - this.outsideSince;
		return 'reenter';
	}

	fail(reason, at) {
		this.state = 'failed';
		this.failReason = reason;
		this.failPosition = clamp(at.s, 0, this.tunnel.length);
		this.t1 = at.t;
		if (reason === 'exit' && this.policy === 'strict') {
			this.exits++;
			this.exitPositions.push(this.failPosition);
		}
		return 'fail';
	}

	get finished() {
		return this.state === 'done' || this.state === 'failed';
	}

	/** Summary of a finished trial (null if it never got past the start line). */
	result() {
		if (!this.finished || this.t0 === null) return null;
		const L = this.tunnel.length;
		const completed = this.state === 'done';
		const elapsed = this.t1 - this.t0;

		const steering = this.samples.filter((p) => p.t >= this.t0 && p.t <= this.t1);
		const within = steering.filter((p) => p.s >= 0 && p.s <= L).map((p) => p.d);
		const meanDev = within.length ? within.reduce((a, b) => a + b, 0) / within.length : 0;
		const sdDev =
			within.length > 1 ? Math.sqrt(within.reduce((a, d) => a + (d - meanDev) ** 2, 0) / (within.length - 1)) : 0;
		const maxAbsDev = within.reduce((m, d) => Math.max(m, Math.abs(d)), 0);

		let pathLength = 0;
		for (let i = 1; i < steering.length; i++) {
			pathLength += Math.hypot(steering[i].x - steering[i - 1].x, steering[i].y - steering[i - 1].y);
		}

		return {
			policy: this.policy,
			completed,
			failReason: this.failReason,
			failPosition: this.failPosition,
			mt: completed ? elapsed : null,
			elapsed,
			exits: this.exits,
			exitPositions: this.exitPositions.map(round1),
			timeOutside: this.timeOutside,
			meanDev,
			sdDev,
			maxAbsDev,
			pathLength,
			pathRatio: completed ? pathLength / L : null,
			meanSpeed: completed ? L / elapsed : null,
			// Raw samples relative to the start crossing, rounded to keep
			// stored data small.
			samples: this.samples.map((p) => ({
				t: round1(p.t - this.t0),
				x: round1(p.x),
				y: round1(p.y),
				s: round1(p.s),
				d: round1(p.d),
			})),
		};
	}
}

function clamp(v, lo, hi) {
	return Math.min(hi, Math.max(lo, v));
}

function round1(v) {
	return Math.round(v * 10) / 10;
}
