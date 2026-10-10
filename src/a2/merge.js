/** How the merge view handles Assignment 2 files. */

import { A2_SCHEMA } from './schema.js';
import { summarizeGroup } from './analysis.js';
import { renderGroup, participantTable } from './results.js';

const NUMBERS = [
	'a_linear',
	'b_linear',
	'r2_linear',
	'ip_linear',
	'tp_linear',
	'error_linear',
	'a_circular',
	'b_circular',
	'r2_circular',
	'ip_circular',
	'tp_circular',
	'error_circular',
];

const SUMMARY_SCHEMA = [
	...['participant', 'session', 'device', 'hand'].map((key) => ({ key, type: 'string' })),
	...NUMBERS.map((key) => ({ key, type: 'number' })),
];

function summaryRows(group) {
	return group.participants.map((p) => {
		const row = { participant: p.participant, session: p.session, device: p.device, hand: p.hand };
		for (const shape of ['linear', 'circular']) {
			const s = p.shapes[shape];
			row['a_' + shape] = s && s.fit ? s.fit.a : null;
			row['b_' + shape] = s && s.fit ? s.fit.b : null;
			row['r2_' + shape] = s && s.fit ? s.fit.r2 : null;
			row['ip_' + shape] = s ? s.ip : null;
			row['tp_' + shape] = s ? s.tp : null;
			row['error_' + shape] = s ? s.errorRate : null;
		}
		return row;
	});
}

export const A2_MERGE = {
	code: 'A2',
	title: 'Assignment 2 · linear vs. circular steering',
	schema: A2_SCHEMA,
	filter: { key: 'device', label: 'Device' },
	summarize: summarizeGroup,
	render: renderGroup,
	participantTable,
	summarySchema: SUMMARY_SCHEMA,
	summaryRows,
};
