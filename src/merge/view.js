/**
 * Merge view of an assignment: drop the CSV files of single participants (or
 * merged files) to see everyone together, and add the participants stored
 * on this laptop. Files are recognised by their `assignment` column; a
 * participant session that is loaded twice is skipped. Nothing is stored:
 * reload the page to start over.
 *
 * `kind` describes the assignment (see a2/merge.js).
 */

import { h, download, dateStamp, onResize } from '../core/dom.js';
import { pageHeader } from '../home.js';
import { fromCSV, toCSV } from '../core/csv.js';
import { groupBy } from '../core/stats.js';

export function mergeView(root, kind) {
	const rows = [];
	const sessions = new Set();
	let filter = 'all';
	const log = h('ul', { class: 'file-list', 'aria-live': 'polite' });
	const results = h('div');
	const local = kind.local();

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
	const localCount = new Set(local.map((r) => r.session)).size;

	root.append(
		pageHeader(kind.title),
		h(
			'main',
			{ class: 'wrap' },
			h('h1', {}, 'Merge participant files'),
			h(
				'p',
				{ class: 'lead' },
				'Drop the CSV files of your participants to see them together. ' +
					'Each participant is analysed on their own first; the figures show the mean of the participants with 95 % confidence intervals.',
			),
			zone,
			h(
				'div',
				{ class: 'btn-row', style: { marginTop: '12px' } },
				localCount
					? h(
							'button',
							{
								class: 'btn',
								type: 'button',
								onclick: () => {
									note('This laptop', describe(addRecords(local)));
									render();
								},
							},
							`Add the ${localCount} participant${localCount === 1 ? '' : 's'} on this laptop`,
						)
					: null,
				h(
					'button',
					{
						class: 'btn',
						type: 'button',
						onclick: () => {
							rows.length = 0;
							sessions.clear();
							log.replaceChildren();
							render();
						},
					},
					'Clear',
				),
				h('a', { class: 'btn', href: kind.back.href }, kind.back.label),
			),
			log,
			results,
		),
	);

	/** Adds records grouped by session; returns { added, skipped } sessions. */
	function addRecords(records) {
		let added = 0;
		let skipped = 0;
		for (const [session, rs] of groupBy(records, (r) => r.session)) {
			if (sessions.has(session)) {
				skipped++;
				continue;
			}
			sessions.add(session);
			rows.push(...rs);
			added++;
		}
		return { added, skipped };
	}

	function describe({ added, skipped }) {
		return (
			`${added} participant${added === 1 ? '' : 's'} added` + (skipped ? `, ${skipped} already loaded (skipped)` : '')
		);
	}

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
			if (code !== kind.code) {
				note(
					file.name,
					/^A\d$/.test(code || '')
						? `a file of Assignment ${code.slice(1)}, not of this assignment`
						: 'not a CSV file exported by this app',
				);
				continue;
			}
			const parsed = fromCSV(text, kind.schema).records.filter((r) => r.assignment === kind.code);
			note(file.name, describe(addRecords(parsed)));
		}
		render();
	}

	function note(name, text) {
		log.append(h('li', {}, h('strong', {}, name), ': ', text));
	}

	function render() {
		results.replaceChildren();
		if (!rows.length) return;
		const values = [...new Set(rows.map((r) => r[kind.filter.key]).filter(Boolean))].sort();
		if (filter !== 'all' && !values.includes(filter)) filter = 'all';
		const select = h(
			'select',
			{
				onchange: (e) => {
					filter = e.target.value;
					render();
				},
			},
			h('option', { value: 'all' }, `All (${values.length})`),
			values.map((v) => h('option', { value: v, selected: v === filter }, v)),
		);
		const selected = filter === 'all' ? rows : rows.filter((r) => r[kind.filter.key] === filter);
		const group = kind.summarize(selected);
		const versions = [...new Set(selected.map((r) => r.version))];
		const body = h('div', { style: { marginTop: '16px' } });
		// Element.append would insert null as text; h() skips it.
		results.append(
			h(
				'div',
				{},
				h('div', { class: 'filter-row' }, h('label', {}, `${kind.filter.label} `, select)),
				versions.length > 1
					? h(
							'p',
							{ class: 'notice warn' },
							`These files come from different versions of the app (${versions.join(', ')}). Check that the same file was used for everyone.`,
						)
					: null,
				h('h2', {}, `Participants (${group.participants.length})`),
				kind.participantTable(group),
			),
			body,
			h(
				'div',
				{ class: 'btn-row', style: { marginTop: '16px' } },
				h(
					'button',
					{
						class: 'btn',
						onclick: () =>
							download(`${kind.code}_merged_${filter}_${dateStamp()}.csv`, 'text/csv', toCSV(selected, kind.schema)),
					},
					'Download merged CSV',
				),
				h(
					'button',
					{
						class: 'btn',
						onclick: () =>
							download(
								`${kind.code}_participants_${filter}_${dateStamp()}.csv`,
								'text/csv',
								toCSV(kind.summaryRows(group), kind.summarySchema),
							),
					},
					'Download participant summary',
				),
			),
		);
		kind.render(body, group);
	}

	return onResize(render);
}
