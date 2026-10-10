/**
 * Assignment 2 figures and tables, for one participant (results screen) and
 * for a group (merge view).
 */

import { h } from '../core/dom.js';
import { fmt } from '../core/chart.js';
import { scatterFit, profilePlot, pairedPlot } from '../core/plots.js';
import { figure, table, withCI } from '../core/ui.js';
import { SHAPES, SHAPE_LABEL, WIDTHS } from './design.js';
import { SPEED_KEYS } from './schema.js';

export const SHAPE_COLOR = { linear: 'var(--series-1)', circular: 'var(--series-2)' };

const binX = (i) => (i + 0.5) / SPEED_KEYS.length;
const ms = (v) => `${fmt.int(v)} ms`;
const dash = (v, f) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : f(v));

const TITLES = {
	mt: 'Movement time vs. index of difficulty',
	tp: 'Throughput vs. index of difficulty',
	errors: 'Error rate vs. index of difficulty',
	path: 'Path length vs. tunnel width',
	paired: 'Steering slope b per participant',
	profile: 'Speed profile along the tunnel',
};

const CAPTIONS = {
	mt: 'Mean movement time per condition and the least-squares line MT = a + b · ID per shape (ID = L / W). The steering law predicts a straight line; does one line fit both shapes?',
	tp: 'Throughput ID / MT per condition; the horizontal line is the shape’s mean throughput.',
	errors: 'Share of attempts that left the tunnel or released the button. Failed attempts were repeated later.',
	path: 'Length of the pointer path divided by the centre-line length L. Below 1: the path cut the corner on the inside of the circle.',
	paired:
		'Each grey line is one participant’s slope b (ms per unit of ID) for both shapes. Coloured markers: mean and 95 % confidence interval.',
	profile:
		'Mean speed along the tunnel over the normalised distance s / L, per tunnel width. By the local law, speed is proportional to the width; compare the plateaus of the two shapes.',
};

function figures(container, keys) {
	const out = {};
	const grid = h('div', { class: 'results-grid' });
	for (const key of keys) {
		if (key === 'profile') {
			out.profile = profileFigure();
			grid.append(out.profile.el);
			continue;
		}
		out[key] = figure(TITLES[key], CAPTIONS[key]);
		grid.append(out[key].el);
	}
	container.append(grid);
	return out;
}

/** One wide card with a speed-profile panel per width. */
function profileFigure() {
	const panels = {};
	const facets = h('div', { class: 'facets' });
	for (const W of WIDTHS) {
		const legendEl = h('div', { class: 'legend' });
		const chart = h('div', { class: 'chart-box' });
		facets.append(h('div', {}, h('h4', {}, `W = ${W} px`), legendEl, chart));
		panels[W] = { chart, legend: legendEl };
	}
	const el = h(
		'figure',
		{ class: 'card wide' },
		h('h3', {}, TITLES.profile),
		facets,
		h('figcaption', { class: 'caption' }, CAPTIONS.profile),
	);
	return { el, panels };
}

function tip(shape, c, rows) {
	return { title: `${SHAPE_LABEL[shape]} · L = ${c.L}, W = ${c.W} · ID = ${fmt.one(c.ID)}`, rows };
}

function drawProfiles(fig, shapes, value) {
	for (const W of WIDTHS) {
		profilePlot(fig.profile.panels[W], {
			xLabel: 's / L',
			yLabel: 'speed (px/ms)',
			unit: ' px/ms',
			height: 240,
			series: shapes
				.filter((s) => value(s, W))
				.map((s) => ({
					name: SHAPE_LABEL[s],
					color: SHAPE_COLOR[s],
					points: value(s, W).map((v, i) => ({ x: binX(i), ...v })),
				})),
		});
	}
}

/** Path ratio per width, averaged over both lengths. */
function pathPoints(conditions, shape, value) {
	return WIDTHS.map((W) => {
		const cs = conditions.filter((c) => c.shape === shape && c.W === W);
		const vs = cs.map(value).filter((v) => v !== null && Number.isFinite(v.y));
		if (!vs.length) return null;
		const y = vs.reduce((a, v) => a + v.y, 0) / vs.length;
		return { x: W, y, n: vs.length };
	}).filter(Boolean);
}

/** Results of one participant (summary from summarizeSession). */
export function renderIndividual(container, summary) {
	const shapes = SHAPES.filter((s) => summary.shapes[s]);
	const S = summary.shapes;
	container.append(
		table(
			[
				{ label: 'Shape', value: (s) => SHAPE_LABEL[s] },
				{ label: 'Mean MT', value: (s) => ms(S[s].mt) },
				{ label: 'a (ms)', value: (s) => (S[s].fit ? fmt.int(S[s].fit.a) : '–') },
				{ label: 'b (ms)', value: (s) => (S[s].fit ? fmt.int(S[s].fit.b) : '–') },
				{ label: 'R²', value: (s) => (S[s].fit ? fmt.three(S[s].fit.r2) : '–') },
				{ label: 'IP = 1000/b (1/s)', value: (s) => dash(S[s].ip, fmt.one) },
				{ label: 'Throughput (1/s)', value: (s) => dash(S[s].tp, fmt.one) },
				{ label: 'Error rate', value: (s) => fmt.pct(S[s].errorRate) },
			],
			shapes,
		),
	);
	const fig = figures(container, ['mt', 'tp', 'profile', 'errors', 'path']);
	const conds = (s) => summary.conditions.filter((c) => c.shape === s);

	scatterFit(fig.mt, {
		xLabel: 'index of difficulty ID = L / W',
		yLabel: 'movement time (ms)',
		series: shapes.map((s) => ({
			name: SHAPE_LABEL[s],
			color: SHAPE_COLOR[s],
			fit: S[s].fit,
			points: conds(s)
				.filter((c) => c.mt !== null)
				.map((c) => ({ x: c.ID, y: c.mt, c })),
			tip: (p) => tip(s, p.c, [{ value: ms(p.c.mt), label: `MT (n = ${p.c.n})`, color: SHAPE_COLOR[s] }]),
		})),
	});
	scatterFit(fig.tp, {
		xLabel: 'index of difficulty ID = L / W',
		yLabel: 'throughput (1/s)',
		series: shapes.map((s) => ({
			name: SHAPE_LABEL[s],
			color: SHAPE_COLOR[s],
			mean: S[s].tp,
			points: conds(s)
				.filter((c) => c.tp !== null)
				.map((c) => ({ x: c.ID, y: c.tp, c })),
			tip: (p) => tip(s, p.c, [{ value: `${fmt.one(p.c.tp)} /s`, label: 'throughput', color: SHAPE_COLOR[s] }]),
		})),
	});
	drawProfiles(fig, shapes, (s, W) => S[s].profiles[W] && S[s].profiles[W].map((y) => ({ y })));
	scatterFit(fig.errors, {
		xLabel: 'index of difficulty ID = L / W',
		yLabel: 'error rate',
		yFormat: fmt.pct,
		yMax: Math.max(0.2, ...summary.conditions.map((c) => c.errorRate)),
		series: shapes.map((s) => ({
			name: SHAPE_LABEL[s],
			color: SHAPE_COLOR[s],
			points: conds(s).map((c) => ({ x: c.ID, y: c.errorRate, c })),
			tip: (p) =>
				tip(s, p.c, [{ value: fmt.pct(p.c.errorRate), label: `of ${p.c.attempts} attempts`, color: SHAPE_COLOR[s] }]),
		})),
	});
	scatterFit(fig.path, {
		xLabel: 'tunnel width W (px)',
		yLabel: 'path length / L',
		yFormat: fmt.two,
		yMax: 1.2,
		series: shapes.map((s) => ({
			name: SHAPE_LABEL[s],
			color: SHAPE_COLOR[s],
			connect: true,
			points: pathPoints(summary.conditions, s, (c) => (c.pathRatio === null ? null : { y: c.pathRatio })),
			tip: (p) => ({
				title: `${SHAPE_LABEL[s]} · W = ${p.x} px`,
				rows: [{ value: fmt.three(p.y), label: 'path length / L', color: SHAPE_COLOR[s] }],
			}),
		})),
	});
}

/** Results of a group (summary from summarizeGroup). */
export function renderGroup(container, group) {
	const shapes = SHAPES.filter((s) => group.shapes[s]);
	const S = group.shapes;
	const d = group.slopeDifference;
	container.append(
		h(
			'p',
			{ class: 'lead' },
			d && d.n
				? `Circular minus linear slope b: ${withCI(d, fmt.int)} ms (${d.n > 1 ? `mean ± 95 % CI, ${d.n} participants` : 'one participant, so no confidence interval'}). ` +
						(Number.isFinite(d.half)
							? d.lo > 0
								? 'The interval is above zero: circular tunnels cost more time per unit of ID.'
								: d.hi < 0
									? 'The interval is below zero: linear tunnels cost more time per unit of ID.'
									: 'The interval includes zero: no clear difference in this group.'
							: '')
				: 'Load files with both shapes to compare them.',
		),
		table(
			[
				{ label: 'Shape', value: (s) => SHAPE_LABEL[s] },
				{ label: 'n', value: (s) => S[s].n },
				{ label: 'a (ms)', value: (s) => withCI(S[s].a, fmt.int) },
				{ label: 'b (ms)', value: (s) => withCI(S[s].b, fmt.int) },
				{ label: 'R²', value: (s) => withCI(S[s].r2, fmt.two) },
				{ label: 'IP (1/s)', value: (s) => withCI(S[s].ip, fmt.one) },
				{ label: 'Throughput (1/s)', value: (s) => withCI(S[s].tp, fmt.one) },
				{ label: 'Error rate', value: (s) => withCI(S[s].errorRate, fmt.pct) },
			],
			shapes,
		),
		h(
			'p',
			{ class: 'caption' },
			'Mean ± 95 % confidence interval over participants; each participant was fitted on their own.',
		),
	);
	const fig = figures(container, ['mt', 'paired', 'profile', 'errors', 'path']);

	scatterFit(fig.mt, {
		xLabel: 'index of difficulty ID = L / W',
		yLabel: 'movement time (ms)',
		series: shapes.map((s) => ({
			name: SHAPE_LABEL[s],
			color: SHAPE_COLOR[s],
			fit: S[s].fit,
			points: S[s].conditions.filter((c) => c.mt).map((c) => ({ x: c.ID, y: c.mt.mean, lo: c.mt.lo, hi: c.mt.hi, c })),
			tip: (p) =>
				tip(s, p.c, [{ value: withCI(p.c.mt, fmt.int) + ' ms', label: `MT (n = ${p.c.mt.n})`, color: SHAPE_COLOR[s] }]),
		})),
	});
	const paired = group.participants.filter((p) => p.shapes.linear && p.shapes.circular);
	pairedPlot(fig.paired, {
		labels: ['Linear', 'Circular'],
		colors: [SHAPE_COLOR.linear, SHAPE_COLOR.circular],
		pairs: paired.map((p) => ({
			name: `${p.participant} (${p.device})`,
			values: [p.shapes.linear.fit && p.shapes.linear.fit.b, p.shapes.circular.fit && p.shapes.circular.fit.b],
		})),
		means: [S.linear && S.linear.b, S.circular && S.circular.b],
		yLabel: 'slope b (ms)',
		digits: fmt.int,
	});
	drawProfiles(fig, shapes, (s, W) =>
		S[s].profiles[W] ? S[s].profiles[W].map((v) => (v ? { y: v.mean, lo: v.lo, hi: v.hi } : { y: null })) : null,
	);
	scatterFit(fig.errors, {
		xLabel: 'index of difficulty ID = L / W',
		yLabel: 'error rate',
		yFormat: fmt.pct,
		yMax: Math.max(0.2, ...shapes.flatMap((s) => S[s].conditions.map((c) => (c.errorRate ? c.errorRate.hi || 0 : 0)))),
		series: shapes.map((s) => ({
			name: SHAPE_LABEL[s],
			color: SHAPE_COLOR[s],
			points: S[s].conditions
				.filter((c) => c.errorRate)
				.map((c) => ({ x: c.ID, y: c.errorRate.mean, lo: c.errorRate.lo, hi: c.errorRate.hi, c })),
			tip: (p) => tip(s, p.c, [{ value: withCI(p.c.errorRate, fmt.pct), label: 'errors', color: SHAPE_COLOR[s] }]),
		})),
	});
	scatterFit(fig.path, {
		xLabel: 'tunnel width W (px)',
		yLabel: 'path length / L',
		yFormat: fmt.two,
		yMax: 1.2,
		series: shapes.map((s) => ({
			name: SHAPE_LABEL[s],
			color: SHAPE_COLOR[s],
			connect: true,
			points: pathPoints(S[s].conditions, s, (c) => (c.pathRatio ? { y: c.pathRatio.mean } : null)),
			tip: (p) => ({
				title: `${SHAPE_LABEL[s]} · W = ${p.x} px`,
				rows: [{ value: fmt.three(p.y), label: 'path length / L (mean)', color: SHAPE_COLOR[s] }],
			}),
		})),
	});
}

/** Participant table of a group. */
export function participantTable(group) {
	const v = (p, s, f) => (p.shapes[s] ? f(p.shapes[s]) : '–');
	const b = (x) => (x.fit ? fmt.int(x.fit.b) : '–');
	return table(
		[
			{ label: 'Participant', value: (p) => p.participant || '–' },
			{ label: 'Device', value: (p) => p.device || '–' },
			{ label: 'Hand', value: (p) => p.hand || '–' },
			{ label: 'b linear', value: (p) => v(p, 'linear', b) },
			{ label: 'b circular', value: (p) => v(p, 'circular', b) },
			{ label: 'TP linear', value: (p) => v(p, 'linear', (x) => dash(x.tp, fmt.one)) },
			{ label: 'TP circular', value: (p) => v(p, 'circular', (x) => dash(x.tp, fmt.one)) },
			{ label: 'Errors linear', value: (p) => v(p, 'linear', (x) => fmt.pct(x.errorRate)) },
			{ label: 'Errors circular', value: (p) => v(p, 'circular', (x) => fmt.pct(x.errorRate)) },
		],
		group.participants,
	);
}
