/**
 * Live plots below the test area (fig. 1b–1e). The first three show the
 * recent trials of the current condition; they reset when the tunnel
 * parameters change. Fig. 1e shows every trial of the active data set.
 */

import { frame, axes, emptyMessage, dots, fmt } from './chart.js';
import { speedSeries, trialWidthAt } from '../analysis.js';
import { widthAt } from '../geometry.js';
import { conditionLabel } from '../experiment.js';

const d3 = window.d3;
const HEIGHT = 210;
const BEFORE = 20; // px shown before the start line

function trialEnd(t) {
	return t.completed ? t.mt : t.elapsed;
}

function trialLines(g, trials, toPoints, x, y, color) {
	const line = d3
		.line()
		.x((p) => x(p[0]))
		.y((p) => y(p[1]));
	trials.forEach((t, i) => {
		const latest = i === trials.length - 1;
		g.append('path')
			.attr('d', line(toPoints(t)))
			.attr('fill', 'none')
			.style('stroke', color)
			.attr('stroke-width', latest ? 2 : 1.5)
			.attr('stroke-linejoin', 'round')
			.attr('opacity', latest ? 1 : 0.3);
	});
}

function trajectory(el, { tunnel, recent, color }) {
	const f = frame(el.chart, { height: HEIGHT });
	const L = tunnel.length;
	const maxW = d3.max(tunnel.samples, (p) => p.w);
	const x = d3
		.scaleLinear()
		.domain([-BEFORE, L + 10])
		.range([0, f.width]);
	const y = d3
		.scaleLinear()
		.domain([-maxW * 0.8, maxW * 0.8])
		.range([f.height, 0]);
	axes(f, x, y, { xLabel: 'distance along tunnel s (px)', yLabel: 'lateral offset (px)', yTicks: 4 });

	const steps = d3.range(0, L + 1, Math.max(1, L / 80));
	f.g
		.append('path')
		.attr(
			'd',
			d3
				.area()
				.x((s) => x(s))
				.y0((s) => y(-widthAt(tunnel, s) / 2))
				.y1((s) => y(widthAt(tunnel, s) / 2))(steps),
		)
		.style('fill', 'var(--tunnel)')
		.attr('opacity', 0.8);
	for (const sign of [-1, 1]) {
		f.g
			.append('path')
			.attr(
				'd',
				d3
					.line()
					.x((s) => x(s))
					.y((s) => y((sign * widthAt(tunnel, s)) / 2))(steps),
			)
			.attr('fill', 'none')
			.style('stroke', 'var(--tunnel-wall)')
			.attr('stroke-width', 1);
	}

	const clipY = maxW * 0.8;
	trialLines(
		f.g,
		recent,
		(t) =>
			t.samples
				.filter((p) => p.t <= trialEnd(t) && p.s >= -BEFORE && p.s <= L + 10)
				.map((p) => [p.s, Math.max(-clipY, Math.min(clipY, p.d))]),
		x,
		y,
		color,
	);

	for (const t of recent) {
		if (t.completed || t.failPosition === null) continue;
		const last = t.samples.filter((p) => p.t <= t.elapsed).pop();
		const cx = x(t.failPosition);
		const cy = y(Math.max(-clipY, Math.min(clipY, last ? last.d : 0)));
		f.g
			.append('path')
			.attr('d', `M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx - 4},${cy + 4}L${cx + 4},${cy - 4}`)
			.style('stroke', 'var(--critical)')
			.attr('stroke-width', 2);
	}
	if (!recent.length) emptyMessage(f, 'Drag through the tunnel to start');
}

function speed(el, { tunnel, recent, color }) {
	const f = frame(el.chart, { height: HEIGHT });
	const done = recent.filter((t) => t.completed);
	const series = done.map((t) => speedSeries(t).map((p) => [p.s, p.v]));
	const vmax = d3.max(series.flat(), (p) => p[1]) || 1;
	const x = d3.scaleLinear().domain([0, tunnel.length]).range([0, f.width]);
	const y = d3
		.scaleLinear()
		.domain([0, vmax * 1.1])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, { xLabel: 'distance along tunnel s (px)', yLabel: 'speed (px/ms)', yTicks: 4 });
	trialLines(f.g, done, (t) => series[done.indexOf(t)], x, y, color);
	if (!done.length) emptyMessage(f, 'No completed trials yet');
}

function deviation(el, { recent, color }) {
	const f = frame(el.chart, { height: HEIGHT });
	const us = [];
	for (const t of recent) {
		const end = trialEnd(t);
		for (const p of t.samples) {
			if (p.t < 0 || p.t > end || p.s < 0 || p.s > t.L) continue;
			us.push(p.d / (trialWidthAt(t, p.s) / 2));
		}
	}
	const x = d3.scaleLinear().domain([-1.5, 1.5]).range([0, f.width]);
	const bins = d3
		.bin()
		.domain(x.domain())
		.thresholds(d3.range(-1.5, 1.5001, 0.1))(us.map((u) => Math.max(-1.5, Math.min(1.4999, u))));
	const total = us.length || 1;
	const y = d3
		.scaleLinear()
		.domain([0, d3.max(bins, (b) => b.length / total) || 0.1])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, {
		xLabel: 'offset / half-width (±1 = wall)',
		yLabel: 'share of samples',
		yTicks: 4,
		yFormat: d3.format('.0%'),
	});
	const bw = Math.min(24, Math.max(1, x(bins[0].x1) - x(bins[0].x0) - 2));
	f.g
		.append('g')
		.selectAll('rect')
		.data(bins.filter((b) => b.length))
		.join('rect')
		.attr('x', (b) => (x(b.x0) + x(b.x1)) / 2 - bw / 2)
		.attr('width', bw)
		.attr('y', (b) => y(b.length / total))
		.attr('height', (b) => y(0) - y(b.length / total))
		.attr('rx', 1.5)
		.style('fill', color);
	for (const v of [-1, 1]) {
		f.g
			.append('line')
			.attr('class', 'ref-line')
			.attr('x1', x(v))
			.attr('x2', x(v))
			.attr('y1', 0)
			.attr('y2', f.height)
			.style('stroke', 'var(--tunnel-wall)');
	}
	if (!us.length) emptyMessage(f, 'No samples yet');
}

function mtVsId(el, { datasetTrials, color }) {
	const f = frame(el.chart, { height: HEIGHT });
	const done = datasetTrials.filter((t) => t.completed && !t.practice);
	const x = d3
		.scaleLinear()
		.domain([0, Math.max(10, d3.max(done, (t) => t.ID) || 0) * 1.05])
		.range([0, f.width])
		.nice();
	const y = d3
		.scaleLinear()
		.domain([0, Math.max(500, d3.max(done, (t) => t.mt) || 0) * 1.05])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, { xLabel: 'ID = ∫ds/W', yLabel: 'MT (ms)', yTicks: 4 });
	dots(f.g, done, {
		x: (t) => x(t.ID),
		y: (t) => y(t.mt),
		color: () => color,
		r: 3.5,
		hollow: (t) => t.exits > 0,
		tooltip: (t) => ({
			title: conditionLabel(t),
			rows: [
				{ value: fmt.int(t.mt) + ' ms', label: 'MT' },
				{ value: fmt.two(t.ID), label: 'ID' },
				...(t.exits ? [{ value: String(t.exits), label: 'exits' }] : []),
			],
		}),
	});
	if (!done.length) emptyMessage(f, 'No completed trials yet');
}

export function renderLive(els, data) {
	const { recent, datasetTrials, tunnelLabel } = data;
	const errors = recent.filter((t) => !t.completed || t.exits > 0).length;
	const recentText = recent.length
		? `${tunnelLabel} · last ${recent.length} trial${recent.length > 1 ? 's' : ''}` +
			(errors ? ` · ${errors} with errors` : '')
		: tunnelLabel;
	els.trajectory.sub.textContent = recentText;
	els.speed.sub.textContent = recentText;
	els.deviation.sub.textContent = recentText;
	const done = datasetTrials.filter((t) => t.completed && !t.practice).length;
	const failed = datasetTrials.filter((t) => !t.completed && !t.practice).length;
	els.scatter.sub.textContent = `${done} completed` + (failed ? ` · ${failed} failed (not shown)` : '');

	trajectory(els.trajectory, data);
	speed(els.speed, data);
	deviation(els.deviation, data);
	mtVsId(els.scatter, data);
}
