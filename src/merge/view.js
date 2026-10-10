/**
 * Merge view: drop the CSV files exported by several participants to see
 * them together. Files are recognised by their `assignment` column; a
 * participant session that is loaded twice is skipped. Nothing is stored:
 * reload the page to start over.
 */

import { h, download, dateStamp, onResize } from '../core/dom.js';
import { pageHeader } from '../home.js';
import { fromCSV, toCSV } from '../core/csv.js';
import { groupBy } from '../core/stats.js';
import { KINDS } from './kinds.js';

export function mergeView(root) {
	const rows = new Map(KINDS.map((k) => [k.code, []]));
	const sessions = new Set();
	const filters = new Map();
	const log = h('ul', { class: 'file-list', 'aria-live': 'polite' });
	const results = h('div');

	const input = h('input', {
		type: 'file',
		accept: '.csv,text/csv',
		multiple: true,
		hidden: true,
		onchange: (e) => {
			addFiles([...e.target.files]);
			e.target.value = '';
		},
	});
	const zone = h(
		'div',
		{
			class: 'dropzone',
			ondragover: (e) => {
				e.preventDefault();
				zone.classList.add('over');
			},
			ondragleave: () => zone.classList.remove('over'),
			ondrop: (e) => {
				e.preventDefault();
				zone.classList.remove('over');
				addFiles([...e.dataTransfer.files]);
			},
		},
		h('p', {}, 'Drop CSV files here'),
		h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, 'Choose files'),
		input,
	);

	root.append(
		pageHeader('Merge results'),
		h(
			'main',
			{ class: 'wrap' },
			h('h1', {}, 'Merge results'),
			h(
				'p',
				{ class: 'lead' },
				'Drop the CSV files of your team, or of the whole class, to see everyone’s results together. ' +
					'Each participant is analysed on their own first; the figures show the mean of the participants with 95 % confidence intervals.',
			),
			zone,
			log,
			h(
				'div',
				{ class: 'btn-row' },
				h(
					'button',
					{
						class: 'btn',
						type: 'button',
						onclick: () => {
							for (const list of rows.values()) list.length = 0;
							sessions.clear();
							log.replaceChildren();
							render();
						},
					},
					'Clear',
				),
			),
			results,
		),
	);

	async function addFiles(files) {
		for (const file of files) {
			let text;
			try {
				text = await file.text();
			} catch {
				note(file.name, 'could not be read');
				continue;
			}
			const probe = fromCSV(text, []);
			const code = probe.records[0] && probe.records[0].assignment;
			const kind = KINDS.find((k) => k.code === code);
			if (!kind) {
				note(file.name, 'not a CSV file exported by this app');
				continue;
			}
			const parsed = fromCSV(text, kind.schema).records.filter((r) => r.assignment === kind.code);
			let added = 0;
			let skipped = 0;
			for (const [session, rs] of groupBy(parsed, (r) => r.session)) {
				if (sessions.has(session)) {
					skipped++;
					continue;
				}
				sessions.add(session);
				rows.get(kind.code).push(...rs);
				added++;
			}
			note(
				file.name,
				`${kind.code}: ${added} participant${added === 1 ? '' : 's'} added` +
					(skipped ? `, ${skipped} already loaded (skipped)` : ''),
			);
		}
		render();
	}

	function note(name, text) {
		log.append(h('li', {}, h('strong', {}, name), ': ', text));
	}

	function render() {
		results.replaceChildren();
		for (const kind of KINDS) {
			const all = rows.get(kind.code);
			if (!all.length) continue;
			const section = h('section');
			results.append(section);
			renderKind(section, kind, all);
		}
	}

	function renderKind(section, kind, all) {
		const values = [...new Set(all.map((r) => r[kind.filter.key]).filter(Boolean))].sort();
		const current = filters.get(kind.code) || 'all';
		const select = h(
			'select',
			{
				onchange: (e) => {
					filters.set(kind.code, e.target.value);
					render();
				},
			},
			h('option', { value: 'all' }, `All (${values.length})`),
			values.map((v) => h('option', { value: v, selected: v === current }, v)),
		);
		const selected = current === 'all' ? all : all.filter((r) => r[kind.filter.key] === current);
		const group = kind.summarize(selected);
		const versions = [...new Set(selected.map((r) => r.version))];

		section.append(
			h(
				'div',
				{},
				h('h2', {}, kind.title),
				h('div', { class: 'filter-row' }, h('label', {}, `${kind.filter.label} `, select)),
				versions.length > 1
					? h(
							'p',
							{ class: 'notice warn' },
							`These files come from different versions of the app (${versions.join(', ')}). Check that everyone used the same file.`,
						)
					: null,
				h('h3', { style: { marginTop: '16px' } }, `Participants (${group.participants.length})`),
				kind.participantTable(group),
			),
		);
		const body = h('div');
		section.append(body);
		kind.render(body, group);
		const label = current === 'all' ? 'all' : current;
		section.append(
			h(
				'div',
				{ class: 'btn-row', style: { marginTop: '16px' } },
				h(
					'button',
					{
						class: 'btn',
						onclick: () =>
							download(`${kind.code}_merged_${label}_${dateStamp()}.csv`, 'text/csv', toCSV(selected, kind.schema)),
					},
					'Download merged CSV',
				),
				h(
					'button',
					{
						class: 'btn',
						onclick: () =>
							download(
								`${kind.code}_participants_${label}_${dateStamp()}.csv`,
								'text/csv',
								toCSV(kind.summaryRows(group), kind.summarySchema),
							),
					},
					'Download participant summary',
				),
			),
		);
	}

	return onResize(render);
}
