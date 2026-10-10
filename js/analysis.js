/**
 * Analysis of recorded steering trials. Pure functions, no DOM.
 *
 * Conventions
 *   - Practice trials are excluded from every analysis.
 *   - Movement time (MT) uses completed trials only; per condition, trials
 *     outside mean ± 3 SD are dropped (when there are at least 4 trials).
 *   - A trial is an error when it was not completed (strict policy, or the
 *     button was released) or when it left the tunnel (lenient policy).
 *   - Effective width (Kulikov, MacKenzie & Stuerzlinger 2005): the lateral
 *     deviation is normalised by the local width, u = d / W(s), and pooled
 *     over all samples of a condition. We(s) = 4.133 · σ_u · W(s), hence
 *     IDe = ∫ ds / We(s) = ID / (4.133 · σ_u). For constant-width tunnels this
 *     is the usual We = 4.133 · σ_d and IDe = L / We.
 */

import { conditionKey, conditionLabel, widthLabel } from './experiment.js';

export const WE_FACTOR = 4.133;
export const MIN_TRIALS_EFFECTIVE = 3;

export function mean(xs) {
	if (!xs.length) return NaN;
	let sum = 0;
	for (const x of xs) sum += x;
	return sum / xs.length;
}

/** Sample standard deviation (n - 1). */
export function sd(xs) {
	if (xs.length < 2) return 0;
	const m = mean(xs);
	let sum = 0;
	for (const x of xs) sum += (x - m) ** 2;
	return Math.sqrt(sum / (xs.length - 1));
}

/** Least-squares fit y = a + b·x. Returns null for fewer than 2 distinct x. */
export function linearFit(xs, ys) {
	const n = xs.length;
	if (n < 2) return null;
	const mx = mean(xs);
	const my = mean(ys);
	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		sxx += (xs[i] - mx) ** 2;
		sxy += (xs[i] - mx) * (ys[i] - my);
		syy += (ys[i] - my) ** 2;
	}
	if (sxx === 0) return null;
	const b = sxy / sxx;
	const a = my - b * mx;
	const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
	return { a, b, r2, n };
}

/** Least-squares fit through the origin, y = k·x. */
export function fitThroughOrigin(xs, ys) {
	let sxy = 0;
	let sxx = 0;
	for (let i = 0; i < xs.length; i++) {
		sxy += xs[i] * ys[i];
		sxx += xs[i] * xs[i];
	}
	return sxx > 0 ? { k: sxy / sxx, n: xs.length } : null;
}

/** Local tunnel width of a recorded trial at progress s. */
export function trialWidthAt(trial, s) {
	if (trial.shape !== 'tapered') return trial.width;
	const f = Math.min(1, Math.max(0, s / trial.L));
	return trial.startWidth + (trial.endWidth - trial.startWidth) * f;
}

export function isError(trial) {
	return !trial.completed || trial.exits > 0;
}

/** Samples recorded between the start and finish crossings, inside [0, L]. */
function steeringSamples(trial) {
	const end = trial.completed ? trial.mt : trial.elapsed;
	return trial.samples.filter((p) => p.t >= 0 && p.t <= end && p.s >= 0 && p.s <= trial.L);
}

function withoutOutliers(trials) {
	if (trials.length < 4) return { kept: trials, removed: 0 };
	const mts = trials.map((t) => t.mt);
	const m = mean(mts);
	const s = sd(mts);
	const kept = trials.filter((t) => Math.abs(t.mt - m) <= 3 * s);
	return { kept, removed: trials.length - kept.length };
}

/**
 * Per data set and condition: error rate, mean MT, effective width and
 * throughput.
 */
export function summarizeConditions(trials) {
	const groups = new Map();
	for (const t of trials) {
		if (t.practice) continue;
		const key = t.datasetId + '§' + conditionKey(t);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(t);
	}

	const out = [];
	for (const group of groups.values()) {
		const first = group[0];
		const errors = group.filter(isError).length;
		const { kept, removed } = withoutOutliers(group.filter((t) => t.completed));
		const mts = kept.map((t) => t.mt);

		let sigmaU = null;
		let IDe = null;
		if (kept.length >= MIN_TRIALS_EFFECTIVE) {
			const us = [];
			for (const t of kept) for (const p of steeringSamples(t)) us.push(p.d / trialWidthAt(t, p.s));
			sigmaU = sd(us);
			if (sigmaU > 0) IDe = first.ID / (WE_FACTOR * sigmaU);
		}

		const mt = kept.length ? mean(mts) : null;
		out.push({
			datasetId: first.datasetId,
			key: conditionKey(first),
			label: conditionLabel(first),
			widthLabel: widthLabel(first),
			shape: first.shape,
			ID: first.ID,
			L: first.L,
			attempts: group.length,
			errors,
			errorRate: errors / group.length,
			n: kept.length,
			removed,
			mt,
			mtSd: kept.length ? sd(mts) : null,
			sigmaU,
			IDe,
			// Equivalent constant widths: the width a straight tunnel of the
			// same length would need to have the same (effective) ID.
			Wnominal: first.L / first.ID,
			We: IDe ? first.L / IDe : null,
			tp: IDe && mt ? IDe / (mt / 1000) : null,
			trials: kept,
		});
	}
	out.sort((a, b) => a.ID - b.ID);
	return out;
}

/**
 * Steering law fit per data set, over condition means.
 * IP = 1 / b in s⁻¹; TP is the mean of the per-condition throughputs.
 */
export function datasetModels(conditions) {
	const byDataset = new Map();
	for (const c of conditions) {
		if (!byDataset.has(c.datasetId)) byDataset.set(c.datasetId, []);
		byDataset.get(c.datasetId).push(c);
	}

	const models = new Map();
	for (const [datasetId, cs] of byDataset) {
		const withMt = cs.filter((c) => c.mt !== null);
		const withIDe = withMt.filter((c) => c.IDe !== null);
		const nominal = linearFit(
			withMt.map((c) => c.ID),
			withMt.map((c) => c.mt),
		);
		const effective = linearFit(
			withIDe.map((c) => c.IDe),
			withIDe.map((c) => c.mt),
		);
		const tps = withIDe.map((c) => c.tp);
		const attempts = cs.reduce((a, c) => a + c.attempts, 0);
		const errors = cs.reduce((a, c) => a + c.errors, 0);
		models.set(datasetId, {
			datasetId,
			conditions: cs.length,
			attempts,
			errorRate: attempts ? errors / attempts : null,
			nominal,
			effective,
			ip: nominal && nominal.b > 0 ? 1000 / nominal.b : null,
			ipe: effective && effective.b > 0 ? 1000 / effective.b : null,
			tp: tps.length ? mean(tps) : null,
		});
	}
	return models;
}

/** Per-trial throughput IDe / MT (s⁻¹) for conditions with an effective ID. */
export function trialThroughputs(conditions) {
	const out = [];
	for (const c of conditions) {
		if (c.IDe === null) continue;
		for (const t of c.trials) out.push({ datasetId: c.datasetId, tp: c.IDe / (t.mt / 1000) });
	}
	return out;
}

/**
 * Speed along the tunnel over the course of a completed trial. Progress is
 * resampled every dt ms and differentiated over ±half samples, which
 * smooths pixel quantisation and irregular event timing.
 * @returns {{s: number, w: number, v: number}[]} v in px/ms
 */
export function speedSeries(trial, dt = 10, half = 2) {
	if (!trial.completed) return [];
	const pts = trial.samples;
	const steps = Math.floor(trial.mt / dt);
	const s = [];
	let j = 0;
	for (let i = 0; i <= steps; i++) {
		const t = i * dt;
		while (j < pts.length - 2 && pts[j + 1].t < t) j++;
		const a = pts[j];
		const b = pts[Math.min(j + 1, pts.length - 1)];
		const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
		s.push(a.s + f * (b.s - a.s));
	}

	const out = [];
	for (let i = half; i < s.length - half; i++) {
		const v = (s[i + half] - s[i - half]) / (2 * half * dt);
		const si = Math.min(trial.L, Math.max(0, s[i]));
		out.push({ s: si, w: trialWidthAt(trial, si), v });
	}
	return out;
}

/**
 * The local law v = W / τ (Accot & Zhai 1997): speed against local width,
 * per data set, using the middle 80 % of each completed trial.
 * @returns {Map<id, {bins: {w, v, n}[], k, tau}>} tau in ms
 */
export function localLaw(trials, binWidth = 5) {
	const byDataset = new Map();
	for (const t of trials) {
		if (t.practice || !t.completed) continue;
		if (!byDataset.has(t.datasetId)) byDataset.set(t.datasetId, { ws: [], vs: [] });
		const acc = byDataset.get(t.datasetId);
		for (const p of speedSeries(t)) {
			if (p.s < 0.1 * t.L || p.s > 0.9 * t.L) continue;
			acc.ws.push(p.w);
			acc.vs.push(p.v);
		}
	}

	const out = new Map();
	for (const [datasetId, { ws, vs }] of byDataset) {
		if (!ws.length) continue;
		const bins = new Map();
		for (let i = 0; i < ws.length; i++) {
			const key = Math.round(ws[i] / binWidth) * binWidth;
			if (!bins.has(key)) bins.set(key, []);
			bins.get(key).push(vs[i]);
		}
		const fit = fitThroughOrigin(ws, vs);
		out.set(datasetId, {
			bins: [...bins.entries()].map(([w, v]) => ({ w, v: mean(v), n: v.length })).sort((a, b) => a.w - b.w),
			k: fit ? fit.k : null,
			tau: fit && fit.k > 0 ? 1 / fit.k : null,
		});
	}
	return out;
}

/**
 * Mean speed profile over normalised progress s / L, grouped by shape and
 * width. Each trial contributes one value per bin; the profile shows the
 * mean and SD across trials.
 */
export function speedProfiles(trials, bins = 40) {
	const groups = new Map();
	for (const t of trials) {
		if (t.practice || !t.completed) continue;
		const key = t.shape + '|' + widthLabel(t);
		if (!groups.has(key)) {
			groups.set(key, {
				key,
				shape: t.shape,
				label: widthLabel(t),
				order: t.shape === 'tapered' ? t.startWidth * 1000 + t.endWidth : t.width,
				perBin: Array.from({ length: bins }, () => []),
				n: 0,
			});
		}
		const g = groups.get(key);
		const sums = new Array(bins).fill(0);
		const counts = new Array(bins).fill(0);
		for (const p of speedSeries(t)) {
			const b = Math.min(bins - 1, Math.floor((p.s / t.L) * bins));
			sums[b] += p.v;
			counts[b]++;
		}
		for (let b = 0; b < bins; b++) if (counts[b]) g.perBin[b].push(sums[b] / counts[b]);
		g.n++;
	}

	return [...groups.values()]
		.sort((a, b) => a.order - b.order)
		.map((g) => ({
			key: g.key,
			shape: g.shape,
			label: g.label,
			n: g.n,
			points: g.perBin
				.map((vs, b) => ({ x: (b + 0.5) / bins, mean: mean(vs), sd: sd(vs), n: vs.length }))
				.filter((p) => p.n > 0),
		}));
}
