/** How the merge view handles Assignment 1 files. */

import { A1_SCHEMA } from './schema.js';
import { summarizeGroup } from './analysis.js';
import { renderGroup, participantTable } from './results.js';

const SUMMARY_SCHEMA = [
	'team',
	'participant',
	'session',
	'device',
	'tp_pointing',
	'tp_crossing',
	'a_pointing',
	'b_pointing',
	'r2_pointing',
	'a_crossing',
	'b_crossing',
	'r2_crossing',
	'error_pointing',
	'error_crossing',
].map((key) => ({ key, type: ['team', 'participant', 'session', 'device'].includes(key) ? 'string' : 'number' }));

function summaryRows(group) {
	return group.participants.map((p) => {
		const row = { team: p.team, participant: p.participant, session: p.session, device: p.device };
		for (const t of ['pointing', 'crossing']) {
			const s = p.techniques[t];
			row['tp_' + t] = s ? s.tp : null;
			row['a_' + t] = s && s.fit ? s.fit.a : null;
			row['b_' + t] = s && s.fit ? s.fit.b : null;
			row['r2_' + t] = s && s.fit ? s.fit.r2 : null;
			row['error_' + t] = s ? s.errorRate : null;
		}
		return row;
	});
}

export const A1_MERGE = {
	code: 'A1',
	title: 'Assignment 1 · Fitts’ law vs. crossing',
	schema: A1_SCHEMA,
	filter: { key: 'team', label: 'Team' },
	summarize: summarizeGroup,
	render: renderGroup,
	participantTable,
	summarySchema: SUMMARY_SCHEMA,
	summaryRows,
};
