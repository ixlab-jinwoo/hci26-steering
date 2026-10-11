/**
 * Tunnel geometry for steering law tasks.
 *
 * Every tunnel is represented the same way, whatever its shape: a centreline
 * sampled about once per pixel of arc length. Each sample carries its arc
 * length s, the local tunnel width w, the unit tangent (tx, ty) and the unit
 * normal (nx, ny) = (-ty, tx). Rendering, the inside/outside test, the index
 * of difficulty and the conversion into tunnel coordinates all work on this
 * representation, so a new shape only needs a new sample generator.
 *
 * Tunnel coordinates: s is the arc length along the centreline (in the
 * direction of travel) and d is the signed lateral offset from it. Positive d
 * lies to the right of the direction of travel on screen (y points down).
 *
 * All lengths are in CSS pixels, angles in degrees, clockwise on screen with
 * 0 pointing to the right.
 */

export const SAMPLE_STEP = 1;

// Half-width of the window (in samples) searched around the previous
// position. Larger jumps fall back to a full scan.
const SEARCH_WINDOW = 160;

function sample(x, y, s, w, tx, ty) {
	return { x, y, s, w, tx, ty, nx: -ty, ny: tx };
}

function linearTunnel(shape, { length, startWidth, endWidth, angle = 0, cx = 0, cy = 0 }) {
	const rad = (angle * Math.PI) / 180;
	const tx = Math.cos(rad);
	const ty = Math.sin(rad);
	const n = Math.max(1, Math.ceil(length / SAMPLE_STEP));
	const x0 = cx - (tx * length) / 2;
	const y0 = cy - (ty * length) / 2;

	const samples = [];
	for (let i = 0; i <= n; i++) {
		const s = (length * i) / n;
		const w = startWidth + ((endWidth - startWidth) * s) / length;
		samples.push(sample(x0 + tx * s, y0 + ty * s, s, w, tx, ty));
	}

	return finish({
		shape,
		closed: false,
		length,
		samples,
		params: { shape, length, startWidth, endWidth, angle, cx, cy },
	});
}

/** Straight tunnel of constant width, centred on (cx, cy). */
export function straightTunnel({ length, width, angle = 0, cx = 0, cy = 0 }) {
	const tunnel = linearTunnel('straight', { length, startWidth: width, endWidth: width, angle, cx, cy });
	tunnel.params = { shape: 'straight', length, width, angle, cx, cy };
	return tunnel;
}

/** Straight tunnel whose width changes linearly from startWidth to endWidth. */
export function taperedTunnel({ length, startWidth, endWidth, angle = 0, cx = 0, cy = 0 }) {
	return linearTunnel('tapered', { length, startWidth, endWidth, angle, cx, cy });
}

/**
 * Circular tunnel (one full lap). The start/finish line sits at startAngle
 * (default: top of the circle).
 */
export function circularTunnel({ radius, width, clockwise = true, startAngle = -90, cx = 0, cy = 0 }) {
	const length = 2 * Math.PI * radius;
	const n = Math.max(8, Math.ceil(length / SAMPLE_STEP));
	const dir = clockwise ? 1 : -1;
	const theta0 = (startAngle * Math.PI) / 180;

	const samples = [];
	for (let i = 0; i < n; i++) {
		const s = (length * i) / n;
		const theta = theta0 + (dir * s) / radius;
		const c = Math.cos(theta);
		const sn = Math.sin(theta);
		samples.push(sample(cx + radius * c, cy + radius * sn, s, width, -dir * sn, dir * c));
	}

	return finish({
		shape: 'circular',
		closed: true,
		length,
		samples,
		params: { shape: 'circular', radius, width, clockwise, startAngle, cx, cy, length },
	});
}

/** Build a tunnel from a trial specification (see experiment.js). */
export function makeTunnel(spec, cx, cy) {
	switch (spec.shape) {
		case 'straight':
			return straightTunnel({ length: spec.length, width: spec.width, angle: spec.angle, cx, cy });
		case 'tapered':
			return taperedTunnel({
				length: spec.length,
				startWidth: spec.startWidth,
				endWidth: spec.endWidth,
				angle: spec.angle,
				cx,
				cy,
			});
		case 'circular':
			return circularTunnel({ radius: spec.radius, width: spec.width, clockwise: spec.clockwise, cx, cy });
		default:
			throw new Error('Unknown tunnel shape: ' + spec.shape);
	}
}

function finish(tunnel) {
	const n = tunnel.samples.length;
	tunnel.step = tunnel.closed ? tunnel.length / n : tunnel.length / (n - 1);
	tunnel.id = integrateID(tunnel);
	return tunnel;
}

/**
 * Index of difficulty of the steering law, ID = ∫ ds / W(s), integrated
 * numerically along the centreline with the trapezoidal rule.
 */
export function integrateID(tunnel) {
	const { samples, closed, length } = tunnel;
	let id = 0;
	for (let i = 0; i < samples.length - 1; i++) {
		const a = samples[i];
		const b = samples[i + 1];
		id += ((b.s - a.s) * (1 / a.w + 1 / b.w)) / 2;
	}
	if (closed) {
		const a = samples[samples.length - 1];
		const b = samples[0];
		id += ((length - a.s) * (1 / a.w + 1 / b.w)) / 2;
	}
	return id;
}

/** Closed-form ID for the built-in shapes (Accot & Zhai 1997). */
export function closedFormID(params) {
	switch (params.shape) {
		case 'straight':
			return params.length / params.width;
		case 'circular':
			return (2 * Math.PI * params.radius) / params.width;
		case 'tapered': {
			const { length, startWidth: w1, endWidth: w2 } = params;
			if (w1 === w2) return length / w1;
			return (length / (w1 - w2)) * Math.log(w1 / w2);
		}
		default:
			throw new Error('Unknown tunnel shape: ' + params.shape);
	}
}

function wrap(s, length) {
	return ((s % length) + length) % length;
}

/**
 * Point on the centreline at arc length s, with tangent, normal and width.
 * Open tunnels are extended along their end tangents (keeping the end width)
 * so that the start and finish zones can be described with s < 0 and s > L.
 */
export function pointAt(tunnel, s) {
	const { samples, closed, length, step } = tunnel;
	const n = samples.length;

	if (closed) {
		s = wrap(s, length);
		const i = Math.min(n - 1, Math.floor(s / step));
		const a = samples[i];
		const b = samples[(i + 1) % n];
		return interpolate(a, b, (s - a.s) / step, s);
	}

	if (s <= 0) return extend(samples[0], s);
	if (s >= length) return extend(samples[n - 1], s - length, s);
	const i = Math.min(n - 2, Math.floor(s / step));
	return interpolate(samples[i], samples[i + 1], (s - samples[i].s) / step, s);
}

function extend(p, ds, s = ds) {
	return { x: p.x + p.tx * ds, y: p.y + p.ty * ds, s, w: p.w, tx: p.tx, ty: p.ty, nx: p.nx, ny: p.ny };
}

function interpolate(a, b, t, s) {
	const tx = a.tx + (b.tx - a.tx) * t;
	const ty = a.ty + (b.ty - a.ty) * t;
	const norm = Math.hypot(tx, ty) || 1;
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		s,
		w: a.w + (b.w - a.w) * t,
		tx: tx / norm,
		ty: ty / norm,
		nx: -ty / norm,
		ny: tx / norm,
	};
}

/** Local tunnel width at arc length s (end widths beyond the ends). */
export function widthAt(tunnel, s) {
	return pointAt(tunnel, s).w;
}

/**
 * Polygon (list of points) covering the tunnel between s0 and s1, following
 * the local width. Works across the seam of closed tunnels and beyond the
 * ends of open ones.
 */
export function bandPolygon(tunnel, s0, s1, stepPx = 2) {
	const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / stepPx));
	const left = [];
	const right = [];
	for (let i = 0; i <= n; i++) {
		const p = pointAt(tunnel, s0 + ((s1 - s0) * i) / n);
		left.push([p.x - (p.nx * p.w) / 2, p.y - (p.ny * p.w) / 2]);
		right.push([p.x + (p.nx * p.w) / 2, p.y + (p.ny * p.w) / 2]);
	}
	return left.concat(right.reverse());
}

/** The two walls of the tunnel as point lists, in the direction of travel. */
export function walls(tunnel) {
	const left = [];
	const right = [];
	for (const p of tunnel.samples) {
		left.push([p.x - (p.nx * p.w) / 2, p.y - (p.ny * p.w) / 2]);
		right.push([p.x + (p.nx * p.w) / 2, p.y + (p.ny * p.w) / 2]);
	}
	return { left, right };
}

/** Line segment across the tunnel at arc length s. */
export function crossSection(tunnel, s) {
	const p = pointAt(tunnel, s);
	return [
		[p.x - (p.nx * p.w) / 2, p.y - (p.ny * p.w) / 2],
		[p.x + (p.nx * p.w) / 2, p.y + (p.ny * p.w) / 2],
	];
}

function nearestIndex(tunnel, x, y, hint) {
	const { samples, closed } = tunnel;
	const n = samples.length;
	const full = hint == null || n <= 2 * SEARCH_WINDOW + 1;
	const lo = full ? 0 : hint - SEARCH_WINDOW;
	const hi = full ? n - 1 : hint + SEARCH_WINDOW;

	let best = -1;
	let bestK = 0;
	let bestD2 = Infinity;
	for (let k = lo; k <= hi; k++) {
		let i = k;
		if (closed) i = ((k % n) + n) % n;
		else if (k < 0 || k >= n) continue;
		const dx = samples[i].x - x;
		const dy = samples[i].y - y;
		const d2 = dx * dx + dy * dy;
		if (d2 < bestD2) {
			bestD2 = d2;
			best = i;
			bestK = k;
		}
	}

	// The nearest sample sits on the edge of the window: the pointer jumped
	// further than the window covers, so search the whole centreline.
	const atEdge = !full && (bestK === lo || bestK === hi) && (closed || (best !== 0 && best !== n - 1));
	return atEdge ? nearestIndex(tunnel, x, y, null) : best;
}

/**
 * Convert a screen position into tunnel coordinates.
 * @param hint index of the previously located sample, to keep the search
 *     local (prevents jumping to a distant part of the tunnel that happens
 *     to pass close by).
 * @returns {{s: number, d: number, w: number, index: number}}
 */
export function locate(tunnel, x, y, hint = null) {
	const { samples, closed, length } = tunnel;
	const n = samples.length;
	const i = nearestIndex(tunnel, x, y, hint);

	let best = null;
	const consider = (ia, ib, segLength, allowBefore, allowAfter) => {
		const a = samples[ia];
		const b = samples[ib];
		const ex = b.x - a.x;
		const ey = b.y - a.y;
		const len2 = ex * ex + ey * ey;
		let t = len2 > 0 ? ((x - a.x) * ex + (y - a.y) * ey) / len2 : 0;
		if (t < 0 && !allowBefore) t = 0;
		if (t > 1 && !allowAfter) t = 1;
		const qx = a.x + ex * t;
		const qy = a.y + ey * t;
		const dist = Math.hypot(x - qx, y - qy);
		if (best && dist >= best.dist) return;
		const len = Math.sqrt(len2) || 1;
		const side = (x - qx) * (-ey / len) + (y - qy) * (ex / len);
		const tw = Math.min(1, Math.max(0, t));
		best = {
			dist,
			s: a.s + t * segLength,
			d: side < 0 ? -dist : dist,
			w: a.w + (b.w - a.w) * tw,
			index: i,
		};
	};

	if (closed) {
		const prev = (i - 1 + n) % n;
		const next = (i + 1) % n;
		consider(prev, i, tunnel.step, false, false);
		consider(i, next, tunnel.step, false, false);
		best.s = wrap(best.s, length);
	} else {
		// The first and last segments extend beyond the ends of the tunnel.
		if (i > 0) consider(i - 1, i, samples[i].s - samples[i - 1].s, i - 1 === 0, i === n - 1);
		if (i < n - 1) consider(i, i + 1, samples[i + 1].s - samples[i].s, i === 0, i + 1 === n - 1);
	}

	return { s: best.s, d: best.d, w: best.w, index: best.index };
}

/**
 * Follows a pointer along a tunnel and reports its progress, i.e. the arc
 * length unwrapped over laps for closed tunnels. A closed tunnel starts at
 * progress in (-L/2, L/2], so a pointer placed just before the start line
 * has a small negative progress.
 */
export function createTracker(tunnel) {
	let hint = null;
	let lastS = null;
	let progress = null;

	return {
		update(x, y) {
			const loc = locate(tunnel, x, y, hint);
			hint = loc.index;
			if (!tunnel.closed) {
				progress = loc.s;
			} else if (progress === null) {
				progress = loc.s > tunnel.length / 2 ? loc.s - tunnel.length : loc.s;
			} else {
				let ds = loc.s - lastS;
				if (ds > tunnel.length / 2) ds -= tunnel.length;
				else if (ds < -tunnel.length / 2) ds += tunnel.length;
				progress += ds;
			}
			lastS = loc.s;
			return { s: loc.s, d: loc.d, w: loc.w, progress };
		},
	};
}
