/**
 * Evaluation figures (fig. 2–8) and the model table.
 */

import {
	frame,
	axes,
	emptyMessage,
	legend,
	dots,
	fmt,
	slotColor,
	SHAPE_COLORS,
	showTooltip,
	hideTooltip,
} from './chart.js';
import {
	summarizeConditions,
	datasetModels,
	localLaw,
	speedProfiles,
	trialThroughputs,
	linearFit,
} from '../analysis.js';
import { SHAPES, SHAPE_NAMES } from '../experiment.js';

const d3 = window.d3;
const HEIGHT = 300;

// Ordinal blue ramp for widths (narrow = light, wide = dark), kept within
// the steps that stay visible on both the light and the dark surface.
const WIDTH_RAMP = d3.interpolateRgb('#86b6ef', '#184f95');

function conditionTooltip(c, name, color) {
	const rows = [
		{ value: `${fmt.int(c.mt)} ms`, label: `MT (SD ${fmt.int(c.mtSd)}, n = ${c.n})`, color },
		{ value: fmt.two(c.ID), label: 'ID' },
	];
	if (c.IDe !== null) rows.push({ value: fmt.two(c.IDe), label: 'IDe' });
	rows.push({ value: fmt.pct(c.errorRate), label: `errors (${c.errors}/${c.attempts})` });
	return { title: `${name} · ${c.label}`, rows };
}

function regressionLine(g, fit, x, y, xs, color, width = 2) {
	if (!fit) return;
	const [x0, x1] = d3.extent(xs);
	g.append('line')
		.attr('x1', x(x0))
		.attr('x2', x(x1))
		.attr('y1', y(fit.a + fit.b * x0))
		.attr('y2', y(fit.a + fit.b * x1))
		.style('stroke', color)
		.attr('stroke-width', width)
		.attr('stroke-linecap', 'round');
}

/** Fig. 2: MT over (effective) ID per data set, with the steering law fit. */
function mtVsId(el, { conditions, models, datasets, idMode }) {
	const f = frame(el.chart, { height: HEIGHT });
	const key = idMode === 'effective' ? 'IDe' : 'ID';
	const points = conditions.filter((c) => c.mt !== null && c[key] !== null);
	const x = d3
		.scaleLinear()
		.domain([0, (d3.max(points, (c) => c[key]) || 10) * 1.05])
		.range([0, f.width])
		.nice();
	const y = d3
		.scaleLinear()
		.domain([0, (d3.max(points, (c) => c.mt) || 1000) * 1.08])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, {
		xLabel: idMode === 'effective' ? 'effective index of difficulty IDe' : 'index of difficulty ID = ∫ds/W',
		yLabel: 'movement time (ms)',
	});

	const shown = datasets.filter((ds) => points.some((c) => c.datasetId === ds.id));
	for (const ds of shown) {
		const model = models.get(ds.id);
		const own = points.filter((c) => c.datasetId === ds.id);
		regressionLine(
			f.g,
			idMode === 'effective' ? model.effective : model.nominal,
			x,
			y,
			own.map((c) => c[key]),
			slotColor(ds.slot),
		);
	}
	for (const ds of shown) {
		const color = slotColor(ds.slot);
		dots(
			f.g,
			points.filter((c) => c.datasetId === ds.id),
			{
				x: (c) => x(c[key]),
				y: (c) => y(c.mt),
				color: () => color,
				tooltip: (c) => conditionTooltip(c, ds.label, color),
			},
		);
	}
	legend(
		el.legend,
		shown.map((ds) => ({ label: ds.label, color: slotColor(ds.slot) })),
	);
	if (!points.length) {
		emptyMessage(f, idMode === 'effective' ? `Needs ≥ 3 completed trials per condition` : 'No completed trials yet');
	}
}

function modelTable(container, { models, datasets, law }) {
	const root = d3.select(container);
	root.selectAll('*').remove();
	const rows = datasets.filter((ds) => models.has(ds.id));
	if (!rows.length) return;

	const table = root.append('table').attr('class', 'models');
	const head = ['Data set', 'Trials', 'Errors', 'a (ms)', 'b (ms)', 'R²', 'IP (s⁻¹)', 'R² (IDe)', 'TP (s⁻¹)', 'τ (ms)'];
	table
		.append('thead')
		.append('tr')
		.selectAll('th')
		.data(head)
		.join('th')
		.text((d) => d);
	const body = table.append('tbody');
	const num = (v, f) => (v === null || v === undefined || Number.isNaN(v) ? '–' : f(v));
	for (const ds of rows) {
		const m = models.get(ds.id);
		const l = law.get(ds.id);
		const tr = body.append('tr');
		const first = tr.append('td');
		first.append('i').attr('class', 'swatch').style('background', slotColor(ds.slot));
		first.append('span').text(ds.label);
		const cells = [
			num(m.attempts, fmt.int),
			num(m.errorRate, fmt.pct),
			num(m.nominal && m.nominal.a, fmt.int),
			num(m.nominal && m.nominal.b, fmt.one),
			num(m.nominal && m.nominal.r2, fmt.three),
			num(m.ip, fmt.two),
			num(m.effective && m.effective.r2, fmt.three),
			num(m.tp, fmt.two),
			num(l && l.tau, fmt.one),
		];
		for (const c of cells) tr.append('td').text(c);
	}
}

/** Fig. 3: does one law fit all shapes? Condition means of one data set. */
function shapes(el, { conditions, focus }) {
	const f = frame(el.chart, { height: HEIGHT });
	const points = conditions.filter((c) => focus && c.datasetId === focus.id && c.mt !== null);
	const x = d3
		.scaleLinear()
		.domain([0, (d3.max(points, (c) => c.ID) || 10) * 1.05])
		.range([0, f.width])
		.nice();
	const y = d3
		.scaleLinear()
		.domain([0, (d3.max(points, (c) => c.mt) || 1000) * 1.08])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, { xLabel: 'index of difficulty ID = ∫ds/W', yLabel: 'movement time (ms)' });

	const pooled = linearFit(
		points.map((c) => c.ID),
		points.map((c) => c.mt),
	);
	regressionLine(
		f.g,
		pooled,
		x,
		y,
		points.map((c) => c.ID),
		'var(--ink-2)',
		1.5,
	);

	const items = [];
	for (const shape of SHAPES) {
		const own = points.filter((c) => c.shape === shape);
		if (!own.length) continue;
		const fit = linearFit(
			own.map((c) => c.ID),
			own.map((c) => c.mt),
		);
		items.push({
			label: SHAPE_NAMES[shape] + (fit ? ` (R² = ${fmt.two(fit.r2)})` : ''),
			color: SHAPE_COLORS[shape],
		});
		dots(f.g, own, {
			x: (c) => x(c.ID),
			y: (c) => y(c.mt),
			color: () => SHAPE_COLORS[shape],
			tooltip: (c) => conditionTooltip(c, focus.label, SHAPE_COLORS[shape]),
		});
	}
	if (pooled) items.push({ label: `All shapes (R² = ${fmt.two(pooled.r2)})`, color: 'var(--ink-2)', kind: 'line' });
	legend(el.legend, items);
	if (!points.length) emptyMessage(f, 'No completed trials in this data set');
}

/** Fig. 4: error rate over ID. */
function errors(el, { conditions, datasets }) {
	const f = frame(el.chart, { height: HEIGHT });
	const x = d3
		.scaleLinear()
		.domain([0, (d3.max(conditions, (c) => c.ID) || 10) * 1.05])
		.range([0, f.width])
		.nice();
	const y = d3
		.scaleLinear()
		.domain([0, Math.max(0.2, d3.max(conditions, (c) => c.errorRate) || 0)])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, { xLabel: 'index of difficulty ID = ∫ds/W', yLabel: 'error rate', yFormat: d3.format('.0%') });
	const shown = datasets.filter((ds) => conditions.some((c) => c.datasetId === ds.id));
	for (const ds of shown) {
		const color = slotColor(ds.slot);
		dots(
			f.g,
			conditions.filter((c) => c.datasetId === ds.id),
			{
				x: (c) => x(c.ID),
				y: (c) => y(c.errorRate),
				color: () => color,
				tooltip: (c) => ({
					title: `${ds.label} · ${c.label}`,
					rows: [
						{ value: fmt.pct(c.errorRate), label: `errors (${c.errors}/${c.attempts})`, color },
						{ value: fmt.two(c.ID), label: 'ID' },
					],
				}),
			},
		);
	}
	legend(
		el.legend,
		shown.map((ds) => ({ label: ds.label, color: slotColor(ds.slot) })),
	);
	if (!conditions.length) emptyMessage(f, 'No trials yet');
}

/** Fig. 5: local law, speed over local width with a fit through the origin. */
function localLawPlot(el, { law, datasets }) {
	const f = frame(el.chart, { height: HEIGHT });
	const all = [...law.values()].flatMap((l) => l.bins);
	const x = d3
		.scaleLinear()
		.domain([0, (d3.max(all, (b) => b.w) || 60) * 1.1])
		.range([0, f.width])
		.nice();
	const y = d3
		.scaleLinear()
		.domain([0, (d3.max(all, (b) => b.v) || 1) * 1.1])
		.range([f.height, 0])
		.nice();
	axes(f, x, y, { xLabel: 'local tunnel width W(s) (px)', yLabel: 'speed (px/ms)' });

	const shown = datasets.filter((ds) => law.has(ds.id));
	for (const ds of shown) {
		const l = law.get(ds.id);
		if (!l.k) continue;
		const xEnd = Math.min(x.domain()[1], y.domain()[1] / l.k);
		f.g
			.append('line')
			.attr('x1', x(0))
			.attr('y1', y(0))
			.attr('x2', x(xEnd))
			.attr('y2', y(l.k * xEnd))
			.style('stroke', slotColor(ds.slot))
			.attr('stroke-width', 2)
			.attr('stroke-linecap', 'round');
	}
	for (const ds of shown) {
		const color = slotColor(ds.slot);
		dots(f.g, law.get(ds.id).bins, {
			x: (b) => x(b.w),
			y: (b) => y(b.v),
			color: () => color,
			tooltip: (b) => ({
				title: `${ds.label} · W ≈ ${b.w} px`,
				rows: [
					{ value: `${fmt.two(b.v)} px/ms`, label: 'mean speed', color },
					{ value: fmt.int(b.n), label: 'samples' },
				],
			}),
		});
	}
	legend(
		el.legend,
		shown.map((ds) => ({
			label: ds.label + (law.get(ds.id).tau ? ` (τ = ${fmt.one(law.get(ds.id).tau)} ms)` : ''),
			color: slotColor(ds.slot),
		})),
	);
	if (!shown.length) emptyMessage(f, 'No completed trials yet');
}

/** Fig. 6: mean speed profile along the tunnel, one panel per shape. */
function profiles(el, { trials, focus }) {
	const root = d3.select(el.chart);
	root.selectAll('*').remove();
	const own = focus ? trials.filter((t) => t.datasetId === focus.id) : [];
	const groups = speedProfiles(own);
	const shapesWithData = SHAPES.filter((s) => groups.some((g) => g.shape === s));
	legend(el.legend, []);
	if (!shapesWithData.length) {
		const f = frame(el.chart, { height: HEIGHT });
		emptyMessage(f, 'No completed trials in this data set');
		return;
	}

	const vmax = d3.max(groups.flatMap((g) => g.points.map((p) => p.mean + p.sd))) || 1;
	const panels = root
		.append('div')
		.attr('class', 'facets')
		.style('display', 'grid')
		.style('grid-template-columns', `repeat(${shapesWithData.length}, minmax(0, 1fr))`)
		.style('gap', '16px');

	for (const shape of shapesWithData) {
		const own = groups.filter((g) => g.shape === shape);
		const panel = panels.append('div');
		panel.append('h3').style('font-size', '0.8rem').text(SHAPE_NAMES[shape]);
		const leg = panel.append('div').attr('class', 'legend').node();
		const chartEl = panel.append('div').node();
		const f = frame(chartEl, { height: HEIGHT - 20, margin: { left: 50 } });
		const x = d3.scaleLinear().domain([0, 1]).range([0, f.width]);
		const y = d3.scaleLinear().domain([0, vmax]).range([f.height, 0]).nice();
		axes(f, x, y, {
			xLabel: 'normalised distance s / L',
			yLabel: 'speed (px/ms)',
			xTicks: 4,
			xFormat: d3.format('.1f'),
		});

		const color = (i) =>
			shape === 'tapered' ? `var(--series-${(i % 8) + 1})` : WIDTH_RAMP(own.length > 1 ? i / (own.length - 1) : 0.6);
		own.forEach((g, i) => {
			f.g
				.append('path')
				.attr(
					'd',
					d3
						.area()
						.x((p) => x(p.x))
						.y0((p) => y(Math.max(0, p.mean - p.sd)))
						.y1((p) => y(p.mean + p.sd))(g.points),
				)
				.style('fill', color(i))
				.attr('opacity', 0.1);
			f.g
				.append('path')
				.attr(
					'd',
					d3
						.line()
						.x((p) => x(p.x))
						.y((p) => y(p.mean))(g.points),
				)
				.attr('fill', 'none')
				.style('stroke', color(i))
				.attr('stroke-width', 2)
				.attr('stroke-linejoin', 'round');
		});

		// Crosshair tooltip: all groups at the hovered position.
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
					title: `${SHAPE_NAMES[shape]} · s/L ≈ ${fmt.two(xv)}`,
					rows: own.map((g, i) => {
						const p = g.points.reduce((a, b) => (Math.abs(b.x - xv) < Math.abs(a.x - xv) ? b : a));
						return { value: `${fmt.two(p.mean)} px/ms`, label: `${g.label} (n = ${g.n})`, color: color(i) };
					}),
				});
			})
			.on('pointerleave', () => {
				cross.style('opacity', 0);
				hideTooltip();
			});

		legend(
			leg,
			own.map((g, i) => ({ label: g.label, color: color(i), kind: 'line' })),
		);
	}
}

/** Fig. 7: effective vs nominal (equivalent) width. */
function widths(el, { conditions, datasets }) {
	const f = frame(el.chart, { height: HEIGHT });
	const points = conditions.filter((c) => c.We !== null);
	const max = (d3.max(points, (c) => Math.max(c.We, c.Wnominal)) || 60) * 1.1;
	const x = d3.scaleLinear().domain([0, max]).range([0, f.width]).nice();
	const y = d3.scaleLinear().domain([0, max]).range([f.height, 0]).nice();
	axes(f, x, y, { xLabel: 'nominal width W (px)', yLabel: 'effective width We (px)' });
	const top = Math.min(x.domain()[1], y.domain()[1]);
	f.g.append('line').attr('class', 'ref-line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(top)).attr('y2', y(top));
	f.g
		.append('text')
		.attr('class', 'axis-label')
		.attr('x', x(top) - 4)
		.attr('y', y(top) + 14)
		.attr('text-anchor', 'end')
		.text('We = W');

	const shown = datasets.filter((ds) => points.some((c) => c.datasetId === ds.id));
	for (const ds of shown) {
		const color = slotColor(ds.slot);
		dots(
			f.g,
			points.filter((c) => c.datasetId === ds.id),
			{
				x: (c) => x(c.Wnominal),
				y: (c) => y(c.We),
				color: () => color,
				tooltip: (c) => ({
					title: `${ds.label} · ${c.label}`,
					rows: [
						{ value: `${fmt.one(c.We)} px`, label: 'We', color },
						{ value: `${fmt.one(c.Wnominal)} px`, label: 'W' },
						{ value: fmt.three(c.sigmaU), label: 'σ of offset / width' },
					],
				}),
			},
		);
	}
	legend(
		el.legend,
		shown.map((ds) => ({ label: ds.label, color: slotColor(ds.slot) })),
	);
	if (!points.length) emptyMessage(f, 'Needs ≥ 3 completed trials per condition');
}

/** Fig. 8: distribution of per-trial throughput. */
function throughput(el, { conditions, datasets }) {
	const f = frame(el.chart, { height: HEIGHT });
	const values = trialThroughputs(conditions);
	const shown = datasets.filter((ds) => values.some((v) => v.datasetId === ds.id));
	const max = d3.max(values, (v) => v.tp) || 10;
	const x = d3
		.scaleLinear()
		.domain([0, max * 1.02])
		.range([0, f.width])
		.nice(20);
	const thresholds = x.ticks(20);
	const binner = d3.bin().domain(x.domain()).thresholds(thresholds);

	const series = shown.map((ds) => {
		const own = values.filter((v) => v.datasetId === ds.id).map((v) => v.tp);
		return { ds, bins: binner(own), n: own.length };
	});
	const ymax = d3.max(series.flatMap((s) => s.bins.map((b) => b.length / s.n))) || 0.2;
	const y = d3.scaleLinear().domain([0, ymax]).range([f.height, 0]).nice();
	axes(f, x, y, { xLabel: 'throughput IDe / MT (s⁻¹)', yLabel: 'share of trials', yFormat: d3.format('.0%') });

	if (series.length) {
		const band = x(thresholds[1] ?? max) - x(thresholds[0] ?? 0);
		const bw = Math.max(1, Math.min(24, (band - 2) / series.length - 2));
		series.forEach((s, k) => {
			const color = slotColor(s.ds.slot);
			const offset = (band - series.length * (bw + 2)) / 2 + k * (bw + 2) + 1;
			f.g
				.append('g')
				.selectAll('rect')
				.data(s.bins.filter((b) => b.length))
				.join('rect')
				.attr('x', (b) => x(b.x0) + offset)
				.attr('width', bw)
				.attr('y', (b) => y(b.length / s.n))
				.attr('height', (b) => y(0) - y(b.length / s.n))
				.attr('rx', Math.min(2, bw / 2))
				.style('fill', color)
				.on('pointermove', (event, b) =>
					showTooltip(event, {
						title: `${s.ds.label} · ${fmt.one(b.x0)}–${fmt.one(b.x1)} s⁻¹`,
						rows: [{ value: fmt.pct(b.length / s.n), label: `${b.length} of ${s.n} trials`, color }],
					}),
				)
				.on('pointerleave', hideTooltip);
		});
	}
	legend(
		el.legend,
		shown.map((ds) => ({ label: ds.label, color: slotColor(ds.slot), kind: 'rect' })),
	);
	if (!values.length) emptyMessage(f, 'Needs ≥ 3 completed trials per condition');
}

export function renderAnalysis(els, { trials, datasets, focusId, idMode }) {
	const conditions = summarizeConditions(trials);
	const models = datasetModels(conditions);
	const law = localLaw(trials);
	const focus = datasets.find((d) => d.id === focusId) || datasets[0];
	const ctx = { trials, conditions, models, law, datasets, focus, idMode };

	mtVsId(els.mtId, ctx);
	modelTable(els.table, ctx);
	shapes(els.shapes, ctx);
	errors(els.errors, ctx);
	localLawPlot(els.localLaw, ctx);
	profiles(els.profile, ctx);
	widths(els.widths, ctx);
	throughput(els.throughput, ctx);
}
