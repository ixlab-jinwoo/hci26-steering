/** Page pieces shared by the assignment and merge views. */

import { h } from './dom.js';

/** A figure card with a legend row, a chart box and a caption. */
export function figure(title, caption, { wide = false } = {}) {
	const legendEl = h('div', { class: 'legend' });
	const chart = h('div', { class: 'chart-box' });
	const el = h(
		'figure',
		{ class: 'card' + (wide ? ' wide' : '') },
		h('h3', {}, title),
		legendEl,
		chart,
		h('figcaption', { class: 'caption' }, caption),
	);
	return { el, chart, legend: legendEl };
}

/** Step indicator: Setup › Run › Results. */
export function steps(names, current) {
	return h(
		'ol',
		{ class: 'steps' },
		names.map((name, i) => h('li', { 'aria-current': i === current ? 'step' : null }, name)),
	);
}

/** A table from column definitions [{label, value(row)}]. */
export function table(columns, rows) {
	return h(
		'div',
		{ class: 'table-scroll' },
		h(
			'table',
			{ class: 'data' },
			h(
				'thead',
				{},
				h(
					'tr',
					{},
					columns.map((c) => h('th', {}, c.label)),
				),
			),
			h(
				'tbody',
				{},
				rows.map((r) =>
					h(
						'tr',
						{},
						columns.map((c) => h('td', {}, c.value(r))),
					),
				),
			),
		),
	);
}

/** Radio buttons styled as choices. Returns the element and a getter. */
export function choices(name, options, checked = null) {
	const el = h(
		'div',
		{ class: 'choices', role: 'radiogroup' },
		options.map((o) =>
			h('label', {}, h('input', { type: 'radio', name, value: o.value, checked: o.value === checked }), o.label),
		),
	);
	return {
		el,
		get value() {
			const c = el.querySelector('input:checked');
			return c ? c.value : null;
		},
	};
}

/** Formats a mean with its 95 % CI, e.g. "4.31 ± 0.42". */
export function withCI(ci, format) {
	if (!ci) return '–';
	return Number.isFinite(ci.half) ? `${format(ci.mean)} ± ${format(ci.half)}` : format(ci.mean);
}
