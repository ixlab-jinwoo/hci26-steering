/**
 * Chart types used by both assignments and the merge view. Each takes a
 * container element ({chart, legend}) and plain data, and redraws from
 * scratch.
 */

import * as d3 from 'd3';
import { frame, axes, emptyMessage, legend, dots, showTooltip, hideTooltip, fmt } from './chart.js';

const finite = (v) => v !== null && v !== undefined && Number.isFinite(v);

/**
 * Points per series, optionally with 95 % CI bars (lo, hi), a fitted line
 * y = a + b·x and a horizontal mean line. The x values are the levels of
 * the experiment (IDs, widths): the x axis spans just these, with a tick at
 * each, so it shows no values that were not tested.
 *
 * series: [{ name, color, points: [{x, y, lo, hi, tip}], fit, mean, connect }]
 * tip(point) returns the tooltip rows for a point.
 */
export function scatterFit(
	el,
	{ series, xLabel, yLabel, xFormat, yFormat, height = 280, empty = 'No data yet', yMax },
) {
	legend(
		el.legend,
		series.map((s) => ({ label: s.name, color: s.color })),
	);
	const f = frame(el.chart, { height });
	const all = series.flatMap((s) => s.points).filter((p) => finite(p.y));
	const levels = [...new Set(all.map((p) => +p.x.toFixed(6)))].sort((a, b) => a - b);
	const x0 = levels.length ? levels[0] : 0;
	const x1 = levels.length ? levels[levels.length - 1] : 1;
	const pad = x1 > x0 ? (x1 - x0) * 0.08 : Math.max(1, Math.abs(x0) * 0.1);
	const x = d3
		.scaleLinear()
		.domain([x0 - pad, x1 + pad])
		.range([0, f.width]);
	const top = yMax ?? (d3.max(all, (p) => (finite(p.hi) ? p.hi : p.y)) || 1) * 1.08;
	const y = d3.scaleLinear().domain([0, top]).range([f.height, 0]).nice();
	axes(f, x, y, { xLabel, yLabel, xFormat, yFormat, xTickValues: levels.length ? levels : null });
	if (!all.length) {
		emptyMessage(f, empty);
		return;
	}

	for (const s of series) {
		const pts = s.points.filter((p) => finite(p.y));
		if (!pts.length) continue;
		const [x0, x1] = d3.extent(pts, (p) => p.x);
		if (s.fit) {
			f.g
				.append('line')
				.attr('x1', x(x0))
				.attr('x2', x(x1))
				.attr('y1', y(s.fit.a + s.fit.b * x0))
				.attr('y2', y(s.fit.a + s.fit.b * x1))
				.style('stroke', s.color)
				.attr('stroke-width', 2)
				.attr('stroke-linecap', 'round');
		}
		if (finite(s.mean)) {
			f.g
				.append('line')
				.attr('x1', x(x0))
				.attr('x2', x(x1))
				.attr('y1', y(s.mean))
				.attr('y2', y(s.mean))
				.style('stroke', s.color)
				.attr('stroke-width', 2)
				.attr('opacity', 0.6);
		}
		if (s.connect) {
			const sorted = [...pts].sort((a, b) => a.x - b.x);
			f.g
				.append('path')
				.attr(
					'd',
					d3
						.line()
						.x((p) => x(p.x))
						.y((p) => y(p.y))(sorted),
				)
				.attr('fill', 'none')
				.style('stroke', s.color)
				.attr('stroke-width', 1.5)
				.attr('opacity', 0.6);
		}
		const bars = pts.filter((p) => finite(p.lo) && finite(p.hi));
		f.g
			.append('g')
			.selectAll('path')
			.data(bars)
			.join('path')
			.attr(
				'd',
				(p) =>
					`M${x(p.x)},${y(Math.max(0, p.lo))}V${y(p.hi)}` +
					`M${x(p.x) - 3},${y(p.hi)}h6M${x(p.x) - 3},${y(Math.max(0, p.lo))}h6`,
			)
			.style('stroke', s.color)
			.attr('stroke-width', 1.5);
		dots(f.g, pts, {
			x: (p) => x(p.x),
			y: (p) => y(p.y),
			color: () => s.color,
			tooltip: s.tip ? (p) => s.tip(p) : null,
		});
	}
}

/**
 * Mean profile per series with a shaded band (lo, hi), over a shared x axis,
 * with a crosshair tooltip.
 *
 * series: [{ name, color, points: [{x, y, lo, hi}] }]
 */
export function profilePlot(el, { series, xLabel, yLabel, xDomain = [0, 1], height = 280, unit = '' }) {
	legend(
		el.legend,
		series.map((s) => ({ label: s.name, color: s.color, kind: 'line' })),
	);
	const f = frame(el.chart, { height });
	const all = series.flatMap((s) => s.points).filter((p) => finite(p.y));
	const x = d3.scaleLinear().domain(xDomain).range([0, f.width]);
	const lo = Math.min(0, d3.min(all, (p) => (finite(p.lo) ? p.lo : p.y)) ?? 0);
	const hi = d3.max(all, (p) => (finite(p.hi) ? p.hi : p.y)) ?? 1;
	const y = d3
		.scaleLinear()
		.domain([lo * 1.1, hi * 1.1 || 1])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, { xLabel, yLabel, xFormat: d3.format('.1f') });
	if (!all.length) {
		emptyMessage(f, 'No data yet');
		return;
	}
	if (y.domain()[0] < 0) {
		f.g.append('line').attr('class', 'ref-line').attr('x1', 0).attr('x2', f.width).attr('y1', y(0)).attr('y2', y(0));
	}
	for (const s of series) {
		const pts = s.points.filter((p) => finite(p.y));
		const band = pts.filter((p) => finite(p.lo) && finite(p.hi));
		if (band.length) {
			f.g
				.append('path')
				.attr(
					'd',
					d3
						.area()
						.x((p) => x(p.x))
						.y0((p) => y(p.lo))
						.y1((p) => y(p.hi))(band),
				)
				.style('fill', s.color)
				.attr('opacity', 0.12);
		}
		f.g
			.append('path')
			.attr(
				'd',
				d3
					.line()
					.x((p) => x(p.x))
					.y((p) => y(p.y))(pts),
			)
			.attr('fill', 'none')
			.style('stroke', s.color)
			.attr('stroke-width', 2)
			.attr('stroke-linejoin', 'round');
	}

	const cross = f.g.append('line').attr('class', 'ref-line').attr('y1', 0).attr('y2', f.height).style('opacity', 0);
	f.g
		.append('rect')
		.attr('width', f.width)
		.attr('height', f.height)
		.attr('fill', 'transparent')
		.on('pointermove', (event) => {
			const [mx] = d3.pointer(event);
			const xv = x.invert(mx);
			cross.attr('x1', mx).attr('x2', mx).style('opacity', 1);
			showTooltip(event, {
				title: `${xLabel} ≈ ${fmt.two(xv)}`,
				rows: series
					.filter((s) => s.points.length)
					.map((s) => {
						const p = s.points.reduce((a, b) => (Math.abs(b.x - xv) < Math.abs(a.x - xv) ? b : a));
						return { value: `${fmt.two(p.y)}${unit}`, label: s.name, color: s.color };
					}),
			});
		})
		.on('pointerleave', () => {
			cross.style('opacity', 0);
			hideTooltip();
		});
}

/**
 * Within-participant comparison of two conditions: one thin line per
 * participant, and the group mean with its 95 % CI per condition.
 *
 * pairs: [{ name, values: [v0, v1] }], means: [ci0, ci1] from meanCI
 */
export function pairedPlot(el, { labels, colors, pairs, means, yLabel, height = 280, digits = fmt.two }) {
	legend(
		el.legend,
		labels.map((label, i) => ({ label: `${label} (mean ± 95 % CI)`, color: colors[i] })),
	);
	const f = frame(el.chart, { height });
	const values = pairs.flatMap((p) => p.values).filter(finite);
	const x = d3.scalePoint().domain(labels).range([0, f.width]).padding(0.6);
	const top = Math.max(d3.max(values) || 1, ...means.filter(Boolean).map((m) => (finite(m.hi) ? m.hi : m.mean)));
	const y = d3
		.scaleLinear()
		.domain([0, top * 1.1])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, { yLabel });
	if (!values.length) {
		emptyMessage(f, 'No data yet');
		return;
	}
	const line = f.g.append('g');
	for (const p of pairs) {
		if (!p.values.every(finite)) continue;
		line
			.append('path')
			.attr('d', `M${x(labels[0])},${y(p.values[0])}L${x(labels[1])},${y(p.values[1])}`)
			.style('stroke', 'var(--axis)')
			.attr('stroke-width', 1.5)
			.attr('fill', 'none');
	}
	labels.forEach((label, i) => {
		dots(
			f.g,
			pairs.filter((p) => finite(p.values[i])),
			{
				x: () => x(label),
				y: (p) => y(p.values[i]),
				color: () => 'var(--muted)',
				r: 3,
				tooltip: (p) => ({
					title: p.name,
					rows: labels.map((l, j) => ({ value: digits(p.values[j]), label: l, color: colors[j] })),
				}),
			},
		);
		const m = means[i];
		if (!m) return;
		const cx = x(label) + 18;
		if (finite(m.half)) {
			// Small groups can give intervals below zero; keep the bar inside the plot.
			const lo = y(Math.max(m.lo, y.domain()[0]));
			const hi = y(Math.min(m.hi, y.domain()[1]));
			f.g
				.append('path')
				.attr('d', `M${cx},${lo}V${hi}M${cx - 4},${lo}h8M${cx - 4},${hi}h8`)
				.style('stroke', colors[i])
				.attr('stroke-width', 2);
		}
		dots(f.g, [m], {
			x: () => cx,
			y: () => y(m.mean),
			color: () => colors[i],
			r: 6,
			tooltip: () => ({
				title: `${label}, mean of ${m.n}`,
				rows: [
					{ value: digits(m.mean), label: 'mean', color: colors[i] },
					...(finite(m.half) ? [{ value: `${digits(m.lo)} – ${digits(m.hi)}`, label: '95 % CI' }] : []),
				],
			}),
		});
	});
}
