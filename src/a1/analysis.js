/**
 * Assignment 1 analysis on movement rows (see schema.js). Pure functions.
 *
 * Per participant (session), per condition, following ISO 9241-9 and
 * Soukoreff & MacKenzie (2004):
 *   MT   mean movement time (movements beyond 3 SD of the condition dropped)
 *   We   effective width, 4.133 × SD of the deviation of the activation
 *        points (along the movement for pointing, across it for crossing)
 *   Ae   effective amplitude, mean actual movement distance
 *   IDe  log2(Ae / We + 1)
 *   TP   IDe / MT in bits/s
 * A technique's throughput is the mean of its conditions' throughputs.
 * Practice sequences are left out.
 */

import { mean, sd, linearFit, meanCI, withoutOutliers, groupBy } from '../core/stats.js';
import { TECHNIQUES, conditionKey } from './design.js';
import { VELOCITY_KEYS } from './schema.js';

export const WE_FACTOR = 4.133;

function velocityMean(rows) {
	return VELOCITY_KEYS.map((k) => mean(rows.map((r) => r[k]).filter((v) => v !== null)));
}

/** Results of one participant. */
export function summarizeSession(rows) {
	const main = rows.filter((r) => !r.practice);
	const conditions = [];
	for (const rs of groupBy(main, conditionKey).values()) {
		const kept = withoutOutliers(rs, (r) => r.mt_ms);
		const mt = mean(kept.map((r) => r.mt_ms));
		const We = WE_FACTOR * sd(kept.map((r) => r.deviation_px));
		const Ae = mean(kept.map((r) => r.amplitude_px));
		const IDe = We > 0 ? Math.log2(Ae / We + 1) : null;
		conditions.push({
			technique: rs[0].technique,
			A: rs[0].A,
			W: rs[0].W,
			ID: rs[0].ID,
			n: kept.length,
			mt,
			errorRate: rs.filter((r) => !r.hit).length / rs.length,
			We,
			Ae,
			IDe,
			tp: IDe !== null && mt > 0 ? IDe / (mt / 1000) : null,
		});
	}
	conditions.sort((a, b) => a.ID - b.ID || a.A - b.A);

	const techniques = {};
	for (const technique of TECHNIQUES) {
		const cs = conditions.filter((c) => c.technique === technique);
		const rs = main.filter((r) => r.technique === technique);
		if (!cs.length) continue;
		const tps = cs.map((c) => c.tp).filter((v) => v !== null);
		techniques[technique] = {
			fit: linearFit(
				cs.map((c) => c.ID),
				cs.map((c) => c.mt),
			),
			mt: mean(cs.map((c) => c.mt)),
			tp: tps.length ? mean(tps) : null,
			errorRate: rs.filter((r) => !r.hit).length / rs.length,
			velocity: velocityMean(rs),
			movements: rs.length,
		};
	}
	const first = rows[0] || {};
	return {
		session: first.session,
		team: first.team,
		participant: first.participant,
		device: first.device,
		conditions,
		techniques,
	};
}

function ci(values) {
	const vs = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
	return vs.length ? meanCI(vs) : null;
}

/**
 * Results of several participants: each participant is analysed on their
 * own, then the participants' values are averaged with 95 % CIs.
 */
export function summarizeGroup(rows) {
	const participants = [...groupBy(rows, (r) => r.session).values()].map(summarizeSession);
	const techniques = {};
	for (const technique of TECHNIQUES) {
		const ps = participants.filter((p) => p.techniques[technique]);
		if (!ps.length) continue;
		const t = (p) => p.techniques[technique];

		// Condition means across participants.
		const conditions = [];
		for (const cs of groupBy(
			ps.flatMap((p) => p.conditions.filter((c) => c.technique === technique)),
			(c) => `${c.A}|${c.W}`,
		).values()) {
			conditions.push({
				technique,
				A: cs[0].A,
				W: cs[0].W,
				ID: cs[0].ID,
				mt: ci(cs.map((c) => c.mt)),
				tp: ci(cs.map((c) => c.tp)),
				errorRate: ci(cs.map((c) => c.errorRate)),
			});
		}
		conditions.sort((a, b) => a.ID - b.ID || a.A - b.A);

		techniques[technique] = {
			n: ps.length,
			tp: ci(ps.map((p) => t(p).tp)),
			a: ci(ps.map((p) => t(p).fit && t(p).fit.a)),
			b: ci(ps.map((p) => t(p).fit && t(p).fit.b)),
			r2: ci(ps.map((p) => t(p).fit && t(p).fit.r2)),
			errorRate: ci(ps.map((p) => t(p).errorRate)),
			fit: linearFit(
				conditions.map((c) => c.ID),
				conditions.map((c) => c.mt.mean),
			),
			conditions,
			velocity: VELOCITY_KEYS.map((_, i) => ci(ps.map((p) => t(p).velocity[i]))),
		};
	}

	const paired = participants.filter((p) => p.techniques.pointing && p.techniques.crossing);
	const tpDifference = ci(paired.map((p) => p.techniques.crossing.tp - p.techniques.pointing.tp));
	return { participants, techniques, tpDifference };
}
