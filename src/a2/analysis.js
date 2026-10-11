/**
 * Assignment 2 measures and analysis. Pure functions.
 *
 * Per participant and condition (practice left out):
 *   MT          mean movement time of completed trials (beyond 3 SD dropped)
 *   error rate  failed attempts / all attempts
 *   TP          ID / MT in 1/s (ID = L / W has no unit for steering)
 *   path ratio  length of the pointer path / centreline length L
 *   inside      mean offset towards the centre of the circle (px)
 * Per shape: the fit MT = a + b·ID, index of performance IP = 1000 / b
 * (1/s), mean TP over conditions, and speed profiles per width.
 */

import { mean, linearFit, meanCI, withoutOutliers, groupBy } from '../core/stats.js';
import { SHAPES, WIDTHS, conditionKey } from './design.js';
import { SPEED_KEYS, SPEED_BINS } from './schema.js';

/**
 * Speed along the tunnel in `bins` equal pieces of the path: the length of a
 * piece divided by the time between first reaching its start and its end.
 * `samples` hold t (ms since the start line) and s (progress along the path).
 */
export function speedProfile(samples, L, mt, bins = SPEED_BINS) {
	const times = [0];
	let i = 0;
	for (let k = 1; k < bins; k++) {
		const target = (L * k) / bins;
		while (i < samples.length - 1 && !(samples[i].t >= 0 && samples[i].s < target && samples[i + 1].s >= target)) i++;
		if (i >= samples.length - 1) return null;
		const a = samples[i];
		const b = samples[i + 1];
		times.push(a.t + ((target - a.s) / (b.s - a.s)) * (b.t - a.t));
	}
	times.push(mt);
	const out = [];
	for (let k = 0; k < bins; k++) {
		const dt = times[k + 1] - times[k];
		out.push(dt > 0 ? L / bins / dt : null);
	}
	return out;
}

/**
 * Offsets of a finished trial. For circles the offset towards the centre
 * is positive: right of the direction of travel for clockwise, left for
 * counter-clockwise.
 */
export function offsets(samples, L, mt, shape, direction) {
	const steering = samples.filter((p) => p.t >= 0 && p.t <= mt && p.s >= 0 && p.s <= L);
	if (!steering.length) return { meanAbs: null, inside: null };
	const meanAbs = mean(steering.map((p) => Math.abs(p.d)));
	if (shape !== 'circular') return { meanAbs, inside: null };
	const sign = direction === 'cw' ? 1 : -1;
	return { meanAbs, inside: mean(steering.map((p) => sign * p.d)) };
}

function fitOf(cs) {
	const ok = cs.filter((c) => c.mt !== null);
	return linearFit(
		ok.map((c) => c.ID),
		ok.map((c) => c.mt),
	);
}

/** Results of one participant. */
export function summarizeSession(rows) {
	const main = rows.filter((r) => !r.practice);
	const conditions = [];
	for (const rs of groupBy(main, conditionKey).values()) {
		const done = withoutOutliers(
			rs.filter((r) => r.completed),
			(r) => r.mt_ms,
		);
		const mt = done.length ? mean(done.map((r) => r.mt_ms)) : null;
		const insides = done.map((r) => r.inside_offset_px).filter((v) => v !== null);
		conditions.push({
			shape: rs[0].shape,
			L: rs[0].L,
			W: rs[0].W,
			ID: rs[0].ID,
			n: done.length,
			attempts: rs.length,
			mt,
			errorRate: rs.filter((r) => !r.completed).length / rs.length,
			tp: mt ? rs[0].ID / (mt / 1000) : null,
			pathRatio: done.length ? mean(done.map((r) => r.path_ratio)) : null,
			inside: insides.length ? mean(insides) : null,
		});
	}
	conditions.sort((a, b) => a.ID - b.ID || a.L - b.L);

	const shapes = {};
	for (const shape of SHAPES) {
		const cs = conditions.filter((c) => c.shape === shape);
		if (!cs.length) continue;
		const rs = main.filter((r) => r.shape === shape);
		const fit = fitOf(cs);
		const tps = cs.map((c) => c.tp).filter((v) => v !== null);
		const profiles = {};
		for (const W of WIDTHS) {
			const done = rs.filter((r) => r.completed && r.W === W && r[SPEED_KEYS[0]] !== null);
			if (done.length) profiles[W] = SPEED_KEYS.map((k) => mean(done.map((r) => r[k])));
		}
		shapes[shape] = {
			fit,
			ip: fit && fit.b > 0 ? 1000 / fit.b : null,
			mt: mean(cs.filter((c) => c.mt !== null).map((c) => c.mt)),
			tp: tps.length ? mean(tps) : null,
			errorRate: rs.filter((r) => !r.completed).length / rs.length,
			profiles,
		};
	}
	const first = rows[0] || {};
	return {
		session: first.session,
		participant: first.participant,
		device: first.device,
		hand: first.hand,
		conditions,
		shapes,
	};
}

function ci(values) {
	const vs = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
	return vs.length ? meanCI(vs) : null;
}

/** Results of several participants, each analysed on their own first. */
export function summarizeGroup(rows) {
	const participants = [...groupBy(rows, (r) => r.session).values()].map(summarizeSession);
	const shapes = {};
	for (const shape of SHAPES) {
		const ps = participants.filter((p) => p.shapes[shape]);
		if (!ps.length) continue;
		const s = (p) => p.shapes[shape];
		const conditions = [];
		for (const cs of groupBy(
			ps.flatMap((p) => p.conditions.filter((c) => c.shape === shape)),
			(c) => `${c.L}|${c.W}`,
		).values()) {
			conditions.push({
				shape,
				L: cs[0].L,
				W: cs[0].W,
				ID: cs[0].ID,
				mt: ci(cs.map((c) => c.mt)),
				tp: ci(cs.map((c) => c.tp)),
				errorRate: ci(cs.map((c) => c.errorRate)),
				pathRatio: ci(cs.map((c) => c.pathRatio)),
				inside: ci(cs.map((c) => c.inside)),
			});
		}
		conditions.sort((a, b) => a.ID - b.ID || a.L - b.L);
		const profiles = {};
		for (const W of WIDTHS) {
			const withW = ps.filter((p) => s(p).profiles[W]);
			if (withW.length) profiles[W] = SPEED_KEYS.map((_, i) => ci(withW.map((p) => s(p).profiles[W][i])));
		}
		shapes[shape] = {
			n: ps.length,
			a: ci(ps.map((p) => s(p).fit && s(p).fit.a)),
			b: ci(ps.map((p) => s(p).fit && s(p).fit.b)),
			r2: ci(ps.map((p) => s(p).fit && s(p).fit.r2)),
			ip: ci(ps.map((p) => s(p).ip)),
			tp: ci(ps.map((p) => s(p).tp)),
			errorRate: ci(ps.map((p) => s(p).errorRate)),
			fit: linearFit(
				conditions.filter((c) => c.mt).map((c) => c.ID),
				conditions.filter((c) => c.mt).map((c) => c.mt.mean),
			),
			conditions,
			profiles,
		};
	}
	const paired = participants.filter((p) => p.shapes.linear && p.shapes.circular);
	const diff = (f) => ci(paired.map((p) => (f(p.shapes.circular) ?? NaN) - (f(p.shapes.linear) ?? NaN)));
	return {
		participants,
		shapes,
		slopeDifference: diff((s) => s.fit && s.fit.b),
		tpDifference: diff((s) => s.tp),
	};
}
