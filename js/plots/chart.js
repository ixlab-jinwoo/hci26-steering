/**
 * Small helpers shared by all plots: frame and axes, legend, tooltip and
 * colours. D3 v7 is loaded as a classic script and used through the global.
 */

const d3 = window.d3;

/** Colour of a data set's colour slot (grey once all 8 slots are taken). */
export function slotColor(slot) {
	return slot >= 0 && slot < 8 ? `var(--series-${slot + 1})` : 'var(--series-other)';
}

export const SHAPE_COLORS = {
	straight: 'var(--series-1)',
	circular: 'var(--series-2)',
	tapered: 'var(--series-3)',
};

/**
 * Create an empty chart in container. The width follows the container; the
 * height is fixed so the x-axis band is always inside the frame.
 */
export function frame(container, { height = 220, margin = {} } = {}) {
	const m = { top: 10, right: 12, bottom: 38, left: 58, ...margin };
	const width = Math.max(200, container.clientWidth || 260);
	const root = d3.select(container);
	root.selectAll('*').remove();
	const svg = root
		.append('svg')
		.attr('class', 'chart')
		.attr('width', width)
		.attr('height', height)
		.attr('viewBox', `0 0 ${width} ${height}`);
	const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
	return {
		svg,
		g,
		margin: m,
		width: width - m.left - m.right,
		height: height - m.top - m.bottom,
	};
}

/** Recessive gridlines, tick labels and axis titles. */
export function axes(f, x, y, { xLabel, yLabel, xTicks = 5, yTicks = 5, xFormat, yFormat } = {}) {
	const grid = f.g.append('g').attr('class', 'grid');
	grid
		.selectAll('line.h')
		.data(y.ticks(yTicks))
		.join('line')
		.attr('class', 'h')
		.attr('x1', 0)
		.attr('x2', f.width)
		.attr('y1', (d) => y(d))
		.attr('y2', (d) => y(d));

	const xAxis = d3.axisBottom(x).ticks(xTicks).tickSize(4).tickPadding(4);
	if (xFormat) xAxis.tickFormat(xFormat);
	const yAxis = d3.axisLeft(y).ticks(yTicks).tickSize(0).tickPadding(6);
	if (yFormat) yAxis.tickFormat(yFormat);

	const gx = f.g.append('g').attr('transform', `translate(0,${f.height})`).call(xAxis);
	gx.select('.domain').attr('class', 'baseline');
	gx.selectAll('.tick line').attr('stroke', 'var(--axis)');
	const gy = f.g.append('g').call(yAxis);
	gy.select('.domain').remove();

	if (xLabel) {
		f.g
			.append('text')
			.attr('class', 'axis-label')
			.attr('x', f.width / 2)
			.attr('y', f.height + 32)
			.attr('text-anchor', 'middle')
			.text(xLabel);
	}
	if (yLabel) {
		f.g
			.append('text')
			.attr('class', 'axis-label')
			.attr('transform', `translate(${12 - f.margin.left},${f.height / 2}) rotate(-90)`)
			.attr('text-anchor', 'middle')
			.text(yLabel);
	}
}

export function emptyMessage(f, text) {
	f.g
		.append('text')
		.attr('class', 'empty')
		.attr('x', f.width / 2)
		.attr('y', f.height / 2)
		.text(text);
}

/**
 * HTML legend above a chart.
 * @param items {label, color, kind: 'dot' | 'line' | 'rect' | 'hollow'}
 */
export function legend(container, items) {
	const root = d3.select(container);
	root.selectAll('*').remove();
	for (const item of items) {
		const span = root.append('span');
		const key = span.append('i').attr('class', 'key-' + (item.kind || 'dot'));
		if (item.kind === 'hollow') key.style('border-color', item.color);
		else key.style('background', item.color);
		span.append('span').text(item.label);
	}
}

let tooltipEl = null;

function tooltipNode() {
	if (!tooltipEl) {
		tooltipEl = document.createElement('div');
		tooltipEl.className = 'tooltip';
		tooltipEl.setAttribute('role', 'tooltip');
		document.body.appendChild(tooltipEl);
	}
	return tooltipEl;
}

/**
 * Show the tooltip next to the pointer.
 * @param content {title, rows: [{value, label, color}]}
 */
export function showTooltip(event, { title, rows }) {
	const el = tooltipNode();
	el.replaceChildren();
	if (title) {
		const t = document.createElement('div');
		t.className = 'tt-title';
		t.textContent = title;
		el.appendChild(t);
	}
	for (const row of rows) {
		const r = document.createElement('div');
		r.className = 'tt-row';
		if (row.color) {
			const k = document.createElement('i');
			k.className = 'tt-key';
			k.style.background = row.color;
			r.appendChild(k);
		}
		const v = document.createElement('strong');
		v.textContent = row.value;
		r.appendChild(v);
		if (row.label) {
			const l = document.createElement('span');
			l.textContent = row.label;
			r.appendChild(l);
		}
		el.appendChild(r);
	}
	const pad = 14;
	const rect = el.getBoundingClientRect();
	let x = event.clientX + pad;
	let y = event.clientY + pad;
	if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
	if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
	el.style.left = x + 'px';
	el.style.top = y + 'px';
	el.classList.add('visible');
}

export function hideTooltip() {
	if (tooltipEl) tooltipEl.classList.remove('visible');
}

/**
 * Dots with a surface ring and a larger invisible hit area that shows a
 * tooltip on hover.
 */
export function dots(g, data, { x, y, color, r = 4.5, hollow = () => false, tooltip }) {
	const groups = g.append('g').selectAll('g').data(data).join('g');
	const hit = groups.append('circle').attr('class', 'hit').attr('cx', x).attr('cy', y).attr('r', 12);
	groups
		.append('circle')
		.attr('class', (d) => 'dot' + (hollow(d) ? ' hollow' : ''))
		.attr('cx', x)
		.attr('cy', y)
		.attr('r', r)
		.style('fill', color)
		.style('stroke', (d) => (hollow(d) ? color(d) : null))
		.style('pointer-events', 'none');
	if (tooltip) {
		hit.on('pointermove', (event, d) => showTooltip(event, tooltip(d))).on('pointerleave', hideTooltip);
	}
	return groups;
}

export const fmt = {
	int: d3.format(',.0f'),
	one: d3.format('.1f'),
	two: d3.format('.2f'),
	three: d3.format('.3f'),
	pct: d3.format('.0%'),
};
