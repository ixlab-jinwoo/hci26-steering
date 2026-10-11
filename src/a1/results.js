/**
 * Assignment 1 figures and tables, for one participant (results screen) and
 * for a group (merge view).
 */

import { h } from '../core/dom.js';
import { fmt } from '../core/chart.js';
import { scatterFit, profilePlot, pairedPlot } from '../core/plots.js';
import { figure, table, withCI } from '../core/ui.js';
import { TECHNIQUES, TECHNIQUE_LABEL } from './design.js';
import { VELOCITY_KEYS } from './schema.js';

export const TECH_COLOR = { pointing: 'var(--series-1)', crossing: 'var(--series-2)' };

const binX = (i) => (i + 0.5) / VELOCITY_KEYS.length;
const ms = (v) => `${fmt.int(v)} ms`;

function conditionTip(technique, c, extra = []) {
	return {
		title: `${TECHNIQUE_LABEL[technique]} · A = ${c.A}, W = ${c.W} · ID = ${fmt.two(c.ID)} bits`,
		rows: extra,
	};
}

const CAPTIONS = {
	mt: 'Mean movement time per condition and the least-squares line MT = a + b · ID for each technique. Fitts’ law predicts a straight line; compare the slopes b.',
	tp: 'Throughput (effective ID / MT) per condition; the horizontal line is the technique’s mean throughput. Throughput should stay roughly constant across ID.',
	velocity:
		'Mean velocity towards the next target over the normalised movement time (0 = previous target activated, 1 = next target). Pointing has to stop at the target, crossing passes it at speed; negative values mean moving away from the target.',
	errors: 'Share of movements that missed the target (pointing) or crossed outside the goal (crossing).',
	paired: 'Each grey line is one participant. Coloured markers: mean and 95 % confidence interval.',
};

function figures(container, keys, { wide = [] } = {}) {
	const titles = {
		mt: 'Movement time vs. index of difficulty',
		tp: 'Throughput vs. index of difficulty',
		velocity: 'Velocity profile',
		errors: 'Error rate vs. index of difficulty',
		paired: 'Throughput per participant',
	};
	const out = {};
	const grid = h('div', { class: 'results-grid' });
	for (const key of keys) {
		out[key] = figure(titles[key], CAPTIONS[key], { wide: wide.includes(key) });
		grid.append(out[key].el);
	}
	container.append(grid);
	return out;
}

/** Results of one participant (summary from summarizeSession). */
export function renderIndividual(container, summary) {
	const techs = TECHNIQUES.filter((t) => summary.techniques[t]);
	container.append(
		table(
			[
				{ label: 'Technique', value: (t) => TECHNIQUE_LABEL[t] },
				{ label: 'Mean MT', value: (t) => ms(summary.techniques[t].mt) },
				{ label: 'a (ms)', value: (t) => fmtFit(summary.techniques[t].fit, 'a', fmt.int) },
				{ label: 'b (ms/bit)', value: (t) => fmtFit(summary.techniques[t].fit, 'b', fmt.int) },
				{ label: 'R²', value: (t) => fmtFit(summary.techniques[t].fit, 'r2', fmt.three) },
				{ label: 'Throughput (bits/s)', value: (t) => numOrDash(summary.techniques[t].tp, fmt.two) },
				{ label: 'Error rate', value: (t) => fmt.pct(summary.techniques[t].errorRate) },
			],
			techs,
		),
	);
	const fig = figures(container, ['mt', 'tp', 'velocity', 'errors']);
	const conds = (t) => summary.conditions.filter((c) => c.technique === t);

	scatterFit(fig.mt, {
		xLabel: 'index of difficulty ID (bits)',
		yLabel: 'movement time (ms)',
		series: techs.map((t) => ({
			name: TECHNIQUE_LABEL[t],
			color: TECH_COLOR[t],
			fit: summary.techniques[t].fit,
			points: conds(t).map((c) => ({ x: c.ID, y: c.mt, c })),
			tip: (p) => conditionTip(t, p.c, [{ value: ms(p.c.mt), label: `MT (n = ${p.c.n})`, color: TECH_COLOR[t] }]),
		})),
	});
	scatterFit(fig.tp, {
		xLabel: 'index of difficulty ID (bits)',
		yLabel: 'throughput (bits/s)',
		series: techs.map((t) => ({
			name: TECHNIQUE_LABEL[t],
			color: TECH_COLOR[t],
			mean: summary.techniques[t].tp,
			points: conds(t).map((c) => ({ x: c.ID, y: c.tp, c })),
			tip: (p) =>
				conditionTip(t, p.c, [
					{ value: `${fmt.two(p.c.tp)} bits/s`, label: 'throughput', color: TECH_COLOR[t] },
					{ value: fmt.two(p.c.IDe), label: 'effective ID' },
					{ value: `${fmt.one(p.c.We)} px`, label: 'effective width' },
				]),
		})),
	});
	profilePlot(fig.velocity, {
		xLabel: 'normalised time',
		yLabel: 'velocity to target (px/ms)',
		unit: ' px/ms',
		series: techs.map((t) => ({
			name: TECHNIQUE_LABEL[t],
			color: TECH_COLOR[t],
			points: summary.techniques[t].velocity.map((v, i) => ({ x: binX(i), y: v })),
		})),
	});
	scatterFit(fig.errors, {
		xLabel: 'index of difficulty ID (bits)',
		yLabel: 'error rate',
		yFormat: fmt.pct,
		yMax: Math.max(0.2, ...summary.conditions.map((c) => c.errorRate)),
		series: techs.map((t) => ({
			name: TECHNIQUE_LABEL[t],
			color: TECH_COLOR[t],
			points: conds(t).map((c) => ({ x: c.ID, y: c.errorRate, c })),
			tip: (p) => conditionTip(t, p.c, [{ value: fmt.pct(p.c.errorRate), label: 'errors', color: TECH_COLOR[t] }]),
		})),
	});
}

/** Results of a group (summary from summarizeGroup). */
export function renderGroup(container, group) {
	const techs = TECHNIQUES.filter((t) => group.techniques[t]);
	const d = group.tpDifference;
	container.append(
		h(
			'p',
			{ class: 'lead' },
			d
				? `Crossing minus pointing throughput: ${withCI(d, fmt.two)} bits/s (${d.n > 1 ? `mean ± 95 % CI, ${d.n} participants` : 'one participant, so no confidence interval'}). ` +
						(Number.isFinite(d.half)
							? d.lo > 0
								? 'The interval is above zero: crossing had a higher throughput.'
								: d.hi < 0
									? 'The interval is below zero: pointing had a higher throughput.'
									: 'The interval includes zero: no clear difference in this group.'
							: '')
				: 'Load files with both techniques to compare them.',
		),
		table(
			[
				{ label: 'Technique', value: (t) => TECHNIQUE_LABEL[t] },
				{ label: 'n', value: (t) => group.techniques[t].n },
				{ label: 'a (ms)', value: (t) => withCI(group.techniques[t].a, fmt.int) },
				{ label: 'b (ms/bit)', value: (t) => withCI(group.techniques[t].b, fmt.int) },
				{ label: 'R²', value: (t) => withCI(group.techniques[t].r2, fmt.two) },
				{ label: 'Throughput (bits/s)', value: (t) => withCI(group.techniques[t].tp, fmt.two) },
				{ label: 'Error rate', value: (t) => withCI(group.techniques[t].errorRate, fmt.pct) },
			],
			techs,
		),
		h(
			'p',
			{ class: 'caption' },
			'Mean ± 95 % confidence interval over participants; each participant was fitted on their own.',
		),
	);
	const fig = figures(container, ['mt', 'paired', 'velocity', 'errors']);

	scatterFit(fig.mt, {
		xLabel: 'index of difficulty ID (bits)',
		yLabel: 'movement time (ms)',
		series: techs.map((t) => ({
			name: TECHNIQUE_LABEL[t],
			color: TECH_COLOR[t],
			fit: group.techniques[t].fit,
			points: group.techniques[t].conditions.map((c) => ({ x: c.ID, y: c.mt.mean, lo: c.mt.lo, hi: c.mt.hi, c })),
			tip: (p) =>
				conditionTip(t, p.c, [
					{ value: withCI(p.c.mt, fmt.int) + ' ms', label: `MT (n = ${p.c.mt.n})`, color: TECH_COLOR[t] },
				]),
		})),
	});
	const paired = group.participants.filter((p) => p.techniques.pointing && p.techniques.crossing);
	pairedPlot(fig.paired, {
		labels: ['Pointing', 'Crossing'],
		colors: [TECH_COLOR.pointing, TECH_COLOR.crossing],
		pairs: paired.map((p) => ({
			name: `${p.participant} (${p.team})`,
			values: [p.techniques.pointing.tp, p.techniques.crossing.tp],
		})),
		means: [
			group.techniques.pointing && group.techniques.pointing.tp,
			group.techniques.crossing && group.techniques.crossing.tp,
		],
		yLabel: 'throughput (bits/s)',
	});
	profilePlot(fig.velocity, {
		xLabel: 'normalised time',
		yLabel: 'velocity to target (px/ms)',
		unit: ' px/ms',
		series: techs.map((t) => ({
			name: TECHNIQUE_LABEL[t],
			color: TECH_COLOR[t],
			points: group.techniques[t].velocity.map((v, i) => ({
				x: binX(i),
				y: v && v.mean,
				lo: v && v.lo,
				hi: v && v.hi,
			})),
		})),
	});
	scatterFit(fig.errors, {
		xLabel: 'index of difficulty ID (bits)',
		yLabel: 'error rate',
		yFormat: fmt.pct,
		yMax: Math.max(
			0.2,
			...techs.flatMap((t) => group.techniques[t].conditions.map((c) => c.errorRate.hi || c.errorRate.mean)),
		),
		series: techs.map((t) => ({
			name: TECHNIQUE_LABEL[t],
			color: TECH_COLOR[t],
			points: group.techniques[t].conditions.map((c) => ({
				x: c.ID,
				y: c.errorRate.mean,
				lo: c.errorRate.lo,
				hi: c.errorRate.hi,
				c,
			})),
			tip: (p) =>
				conditionTip(t, p.c, [{ value: withCI(p.c.errorRate, fmt.pct), label: 'errors', color: TECH_COLOR[t] }]),
		})),
	});
}

/** Participant table of a group. */
export function participantTable(group) {
	const v = (p, t, f) => (p.techniques[t] ? f(p.techniques[t]) : '–');
	return table(
		[
			{ label: 'Team', value: (p) => p.team || '–' },
			{ label: 'Participant', value: (p) => p.participant || '–' },
			{ label: 'Device', value: (p) => p.device || '–' },
			{ label: 'TP pointing', value: (p) => v(p, 'pointing', (t) => numOrDash(t.tp, fmt.two)) },
			{ label: 'TP crossing', value: (p) => v(p, 'crossing', (t) => numOrDash(t.tp, fmt.two)) },
			{ label: 'b pointing', value: (p) => v(p, 'pointing', (t) => fmtFit(t.fit, 'b', fmt.int)) },
			{ label: 'b crossing', value: (p) => v(p, 'crossing', (t) => fmtFit(t.fit, 'b', fmt.int)) },
			{ label: 'Errors pointing', value: (p) => v(p, 'pointing', (t) => fmt.pct(t.errorRate)) },
			{ label: 'Errors crossing', value: (p) => v(p, 'crossing', (t) => fmt.pct(t.errorRate)) },
		],
		group.participants,
	);
}

function fmtFit(fit, key, f) {
	return fit ? f(fit[key]) : '–';
}

function numOrDash(v, f) {
	return v === null || v === undefined || !Number.isFinite(v) ? '–' : f(v);
}
