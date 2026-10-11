/**
 * Assignment 1 screens. One laptop per team: the team members take turns as
 * participants, with an external mouse.
 *
 *   participants (and team results) → new participant → run → results
 *
 * Everyone who finished stays in the participant list of this laptop. A
 * running session is saved after every sequence, so a reload can continue
 * it.
 */

import { h, download, slug, dateStamp, onResize } from '../core/dom.js';
import { pageHeader } from '../home.js';
import { environment, newSessionId } from '../core/device.js';
import { VERSION, versionLabel } from '../core/version.js';
import { load, save } from '../core/storage.js';
import {
	loadSession,
	saveSession,
	clearSession,
	loadParticipants,
	finishSession,
	removeParticipant,
	clearParticipants,
} from '../core/session.js';
import { toCSV } from '../core/csv.js';
import { mean } from '../core/stats.js';
import { fmt } from '../core/chart.js';
import { steps, rowActions } from '../core/ui.js';
import { buildPlan, indexOfDifficulty, TECHNIQUE_LABEL, MOVEMENTS, PRACTICE } from './design.js';
import { ReciprocalSequence } from './reciprocal.js';
import { A1_SCHEMA, VELOCITY_KEYS } from './schema.js';
import { summarizeSession, summarizeGroup } from './analysis.js';
import { SUMMARY_SCHEMA, summaryRows } from './summary.js';
import { A1Stage, STAGE_W, STAGE_H } from './stage.js';
import { renderIndividual, renderGroup, participantTable, TECH_COLOR } from './results.js';

const NAME = 'a1';
const TITLE = 'Assignment 1 · Fitts’ law vs. crossing';
const STEPS = ['Participant', 'Test', 'Results'];
const MIN_W = STAGE_W + 40;
const MIN_H = STAGE_H + 160;

const CUE = {
	pointing: 'POINT: click inside the highlighted bar',
	crossing: 'CROSS: sweep through the highlighted line, no clicking',
};

/** The fields of a session kept in the participant list. */
const infoOf = (session) => ({ id: session.id, participant: session.participant, team: session.team });

const csvName = (person) => `A1_${slug(person.team)}_${slug(person.participant)}_${dateStamp()}.csv`;

export function a1View(root) {
	let cleanup = null;

	function show(screen, ...args) {
		if (cleanup) cleanup();
		root.replaceChildren();
		window.scrollTo(0, 0);
		cleanup = screen(...args) || null;
	}

	// Older versions kept a finished session as the running one.
	const old = loadSession(NAME);
	if (old && old.finished) finishSession(NAME, infoOf(old), old.rows, A1_SCHEMA);

	show(participantsScreen);

	// ------------------------------------------------------------ participants

	function participantsScreen() {
		const pending = loadSession(NAME);
		const people = loadParticipants(NAME, A1_SCHEMA);
		const byId = new Map(people.map((p) => [p.id, p]));
		const rows = people.flatMap((p) => p.rows);
		const group = summarizeGroup(rows);
		const team = people.length ? people[people.length - 1].team : '';
		const body = h('div');

		const actions = (p) => {
			const person = byId.get(p.session);
			return rowActions([
				{ label: 'Results', onclick: () => show(resultsScreen, person) },
				{ label: 'CSV', onclick: () => download(csvName(person), 'text/csv', toCSV(person.rows, A1_SCHEMA)) },
				{
					label: 'Delete',
					danger: true,
					onclick: () => {
						if (!window.confirm(`Delete ${person.participant}? Their data is removed from this laptop.`)) return;
						removeParticipant(NAME, person.id);
						show(participantsScreen);
					},
				},
			]);
		};

		root.append(
			pageHeader(TITLE),
			h(
				'main',
				{ class: 'wrap' },
				h('h1', {}, 'Fitts’ law vs. crossing'),
				h(
					'p',
					{ class: 'lead' },
					'One laptop per team. The team members take turns as participants on this laptop, with an external mouse; ' +
						'the team results below are updated after every participant.',
				),
				pending
					? h(
							'div',
							{ class: 'notice warn' },
							h(
								'p',
								{ style: { marginTop: 0 } },
								`${pending.participant} has not finished: ${pending.index} of ${pending.plan.length} sequences done.`,
							),
							h(
								'div',
								{ class: 'btn-row' },
								h('button', { class: 'btn primary', onclick: () => show(runScreen, pending) }, 'Continue'),
								h(
									'button',
									{
										class: 'btn',
										onclick: () => {
											if (!window.confirm(`Discard the unfinished run of ${pending.participant}?`)) return;
											clearSession(NAME);
											show(participantsScreen);
										},
									},
									'Discard',
								),
							),
						)
					: null,
				h(
					'section',
					{ class: 'card' },
					h('h2', { style: { marginTop: 0 } }, `Participants on this laptop (${people.length})`),
					people.length
						? participantTable(group, actions)
						: h('p', { class: 'muted' }, 'Nobody yet: add the first participant.'),
					h(
						'div',
						{ class: 'btn-row', style: { marginTop: '12px' } },
						h(
							'button',
							{ class: 'btn primary', disabled: Boolean(pending), onclick: () => show(participantScreen) },
							'Add participant',
						),
						pending ? h('span', { class: 'muted' }, 'Finish or discard the unfinished run first.') : null,
					),
				),
				people.length
					? [
							h('h2', {}, `Team results (${people.length} participant${people.length === 1 ? '' : 's'})`),
							body,
							h(
								'div',
								{ class: 'btn-row', style: { marginTop: '16px' } },
								h(
									'button',
									{
										class: 'btn',
										onclick: () =>
											download(`A1_${slug(team)}_team_${dateStamp()}.csv`, 'text/csv', toCSV(rows, A1_SCHEMA)),
									},
									'Download team CSV',
								),
								h(
									'button',
									{
										class: 'btn',
										onclick: () =>
											download(
												`A1_${slug(team)}_participants_${dateStamp()}.csv`,
												'text/csv',
												toCSV(summaryRows(group), SUMMARY_SCHEMA),
											),
									},
									'Download participant summary',
								),
							),
						]
					: null,
				h(
					'footer',
					{ class: 'footer btn-row' },
					`Version ${versionLabel()}`,
					people.length
						? h(
								'button',
								{
									class: 'btn small danger',
									onclick: () => {
										if (
											!window.confirm(
												`Delete all ${people.length} participants from this laptop? Download the team CSV first.`,
											)
										)
											return;
										clearParticipants(NAME);
										show(participantsScreen);
									},
								},
								'Delete all participants',
							)
						: null,
				),
			),
		);
		if (!people.length) return null;
		renderGroup(body, group);
		return onResize(() => {
			body.replaceChildren();
			renderGroup(body, group);
		});
	}

	// ------------------------------------------------------------ new participant

	function participantScreen() {
		const people = loadParticipants(NAME, A1_SCHEMA);
		const team = h('input', {
			type: 'text',
			id: 'a1-team',
			autocomplete: 'off',
			value: load('a1-team', '') || '',
		});
		const participant = h('input', { type: 'text', id: 'a1-participant', autocomplete: 'off' });
		const mouse = h('input', { type: 'checkbox', id: 'a1-mouse' });
		const error = h('p', { class: 'error-text', role: 'alert' });
		const sizeNote = h('p', { class: 'notice warn', hidden: true });
		const checkSize = () => {
			const ok = window.innerWidth >= MIN_W && window.innerHeight >= MIN_H;
			sizeNote.hidden = ok;
			sizeNote.textContent =
				`The browser window is ${window.innerWidth} × ${window.innerHeight} pixels; the test needs at least ` +
				`${MIN_W} × ${MIN_H}. Maximise the window, or zoom out (Ctrl or ⌘ and −).`;
			return ok;
		};
		checkSize();
		window.addEventListener('resize', checkSize);

		const form = h(
			'form',
			{
				class: 'form',
				onsubmit: (e) => {
					e.preventDefault();
					const name = participant.value.trim();
					const problem = !team.value.trim()
						? 'Enter the team.'
						: !name
							? 'Enter the participant’s name or ID.'
							: people.some((p) => p.participant === name && p.team === team.value.trim())
								? `There is already a participant called ${name} in this team. Use another name.`
								: !mouse.checked
									? 'This assignment needs an external mouse. Touchpads are not allowed.'
									: !checkSize()
										? 'Make the browser window larger first.'
										: '';
					error.textContent = problem;
					if (problem) return;
					save('a1-team', team.value.trim());
					const session = {
						id: newSessionId(),
						team: team.value.trim(),
						participant: name,
						device: 'mouse',
						env: environment(),
						plan: buildPlan(),
						index: 0,
						rows: [],
						last: null,
					};
					saveSession(NAME, session);
					show(runScreen, session);
				},
			},
			h('div', { class: 'field' }, h('label', { for: 'a1-team' }, 'Team'), team),
			h(
				'div',
				{ class: 'field' },
				h('label', { for: 'a1-participant' }, 'Participant name or ID'),
				participant,
				h('span', { class: 'hint' }, 'Shown in the team results.'),
			),
			h(
				'label',
				{ class: 'check', for: 'a1-mouse' },
				mouse,
				'An external mouse is connected and used, not the touchpad.',
			),
			error,
			h(
				'div',
				{ class: 'btn-row' },
				h('button', { class: 'btn primary', type: 'submit' }, 'Start'),
				h('button', { class: 'btn', type: 'button', onclick: () => show(participantsScreen) }, 'Cancel'),
			),
		);

		root.append(
			pageHeader(TITLE),
			h(
				'main',
				{ class: 'wrap' },
				steps(STEPS, 0),
				h('h1', {}, 'New participant'),
				h(
					'p',
					{ class: 'lead' },
					'Is it faster to cross a target than to point at it? You will do both, at the same indexes of difficulty.',
				),
				h(
					'section',
					{ class: 'prose' },
					h('h2', {}, 'What you will do'),
					h(
						'ul',
						{},
						h(
							'li',
							{},
							h('strong', {}, 'Pointing: '),
							'move to the highlighted bar and click inside it. The bar is W pixels wide.',
						),
						h(
							'li',
							{},
							h('strong', {}, 'Crossing: '),
							'sweep the pointer through the highlighted line without clicking and without stopping. The line is W pixels long.',
						),
						h(
							'li',
							{},
							'The two targets are A pixels apart and alternate: go back and forth as fast as you can while staying accurate.',
						),
						h(
							'li',
							{},
							`Each sequence has ${MOVEMENTS} timed movements; the first activation only starts the clock. ` +
								`There are 2 short practice sequences and 12 sequences in random order, about 4 minutes in total.`,
						),
						h('li', {}, 'Use the external mouse only.'),
					),
					h(
						'p',
						{},
						'Both techniques use the same distances and sizes, so each condition has the same index of difficulty ID = log₂(A / W + 1).',
					),
				),
				sizeNote,
				h('h2', {}, 'Participant'),
				form,
			),
		);
		(team.value ? participant : team).focus();
		return () => window.removeEventListener('resize', checkSize);
	}

	// ------------------------------------------------------------ run

	function runScreen(session) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'stage');
		svg.setAttribute('aria-label', 'Test area');
		const stage = new A1Stage(svg);
		const cue = h('div', { class: 'run-cue' });
		const counter = h('div', { class: 'muted' });
		const progressFill = h('div');
		const overlay = h('div', { class: 'overlay' });
		const status = h('div', { class: 'run-status' }, '');
		const run = h(
			'div',
			{ class: 'run' },
			h('div', { class: 'run-bar' }, cue, counter),
			h('div', { class: 'progress' }, progressFill),
			h('div', { class: 'stage-box' }, svg, overlay),
			status,
			h(
				'div',
				{ class: 'run-help' },
				`${session.participant} · Esc restarts the current sequence. Progress is saved after every sequence.`,
			),
		);
		root.append(run);

		let seq = null;
		let spec = null;

		function setStatus(text, tone = '') {
			status.textContent = text;
			status.className = 'run-status ' + tone;
		}

		function updateProgress() {
			progressFill.style.width = `${(100 * session.index) / session.plan.length}%`;
			counter.textContent = `Sequence ${Math.min(session.index + 1, session.plan.length)} of ${session.plan.length}`;
		}

		function intro(note = '') {
			seq = null;
			spec = session.plan[session.index];
			stage.clear();
			updateProgress();
			cue.replaceChildren(
				h(
					'span',
					{ class: 'technique-tag', style: { background: TECH_COLOR[spec.technique] } },
					TECHNIQUE_LABEL[spec.technique],
				),
				spec.practice ? '  Practice' : '',
			);
			setStatus('');
			const start = h('button', { class: 'btn primary', onclick: begin }, 'Start sequence');
			overlay.replaceChildren(
				...[
					note ? h('p', {}, note) : null,
					session.last
						? h(
								'p',
								{},
								`Last sequence: mean ${fmt.int(session.last.mt)} ms, ${session.last.misses} miss${session.last.misses === 1 ? '' : 'es'}.`,
							)
						: null,
					h('h2', {}, CUE[spec.technique]),
					h(
						'p',
						{},
						`A = ${spec.A} px · W = ${spec.W} px · ID = ${fmt.two(indexOfDifficulty(spec.A, spec.W))} bits · ${spec.movements} movements` +
							(spec.practice ? ' · practice, not analysed' : ''),
					),
					start,
				].filter(Boolean),
			);
			overlay.hidden = false;
			start.focus();
		}

		function begin() {
			overlay.hidden = true;
			seq = new ReciprocalSequence({ ...spec, cx: STAGE_W / 2, cy: STAGE_H / 2 });
			stage.show(seq, TECH_COLOR[spec.technique]);
			cue.replaceChildren(
				h(
					'span',
					{ class: 'technique-tag', style: { background: TECH_COLOR[spec.technique] } },
					TECHNIQUE_LABEL[spec.technique],
				),
				'  ' + CUE[spec.technique].split(': ')[1],
			);
			setStatus(spec.technique === 'pointing' ? 'Click the left bar to start.' : 'Cross the left line to start.');
		}

		function toStage(e) {
			const pt = svg.createSVGPoint();
			pt.x = e.clientX;
			pt.y = e.clientY;
			return pt.matrixTransform(svg.getScreenCTM().inverse());
		}

		function handle(activation) {
			if (!activation) return;
			if (activation.ignored) {
				setStatus(
					spec.technique === 'pointing'
						? 'Start by clicking inside the highlighted bar.'
						: 'Start by crossing the highlighted line between its end marks.',
					'bad',
				);
				return;
			}
			stage.update(seq);
			if (!activation.hit) stage.flashMiss(activation.target);
			setStatus(
				seq.started && seq.completed > 0 ? `${seq.completed} / ${seq.movements}` : 'Go!',
				activation.hit ? '' : 'bad',
			);
			if (seq.done) finishSequence();
		}

		function finishSequence() {
			const data = seq.movementData();
			const order = session.index + 1;
			const time = new Date().toISOString();
			for (const m of data) {
				const row = {
					assignment: 'A1',
					version: VERSION,
					session: session.id,
					team: session.team,
					participant: session.participant,
					device: session.device,
					browser: session.env.browser,
					viewport_w: session.env.viewportW,
					viewport_h: session.env.viewportH,
					dpr: session.env.dpr,
					sequence: order,
					practice: spec.practice,
					technique: spec.technique,
					A: spec.A,
					W: spec.W,
					ID: indexOfDifficulty(spec.A, spec.W),
					movement: m.movement,
					direction: m.direction,
					mt_ms: m.mt,
					hit: m.hit,
					deviation_px: m.deviation,
					amplitude_px: m.amplitude,
					pointer_type: m.pointerType,
					time,
				};
				VELOCITY_KEYS.forEach((k, i) => (row[k] = m.velocity[i]));
				session.rows.push(row);
			}
			session.last = { mt: mean(data.map((m) => m.mt)), misses: data.filter((m) => !m.hit).length };
			session.index++;
			seq = null;
			if (session.index >= session.plan.length) {
				const person = finishSession(NAME, infoOf(session), session.rows, A1_SCHEMA);
				show(resultsScreen, person || { ...infoOf(session), rows: session.rows }, { next: true, unsaved: !person });
				return;
			}
			saveSession(NAME, session);
			intro();
		}

		// Mouse only: pen and touch input is ignored.
		function onMove(e) {
			if (!seq || e.pointerType !== 'mouse') return;
			const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
			for (const ev of events.length ? events : [e]) {
				const p = toStage(ev);
				handle(seq.move(p.x, p.y, ev.timeStamp, e.pointerType));
				if (!seq) break;
			}
		}

		function onDown(e) {
			if (!seq || e.button !== 0 || !overlay.hidden) return;
			if (e.pointerType !== 'mouse') {
				setStatus('Use the mouse. Pen and touch input is ignored.', 'bad');
				return;
			}
			const p = toStage(e);
			const activation = seq.press(p.x, p.y, e.timeStamp, e.pointerType);
			if (spec.technique === 'crossing' && seq.started) setStatus('No clicking needed: just sweep through the lines.');
			handle(activation);
		}

		function onKey(e) {
			if (e.key === 'Escape' && seq) intro('Sequence restarted.');
		}

		const noMenu = (e) => e.preventDefault();
		run.addEventListener('pointermove', onMove);
		run.addEventListener('pointerdown', onDown);
		run.addEventListener('contextmenu', noMenu);
		window.addEventListener('keydown', onKey);
		intro(session.index > 0 ? `Welcome back, ${session.participant}.` : '');

		return () => {
			window.removeEventListener('keydown', onKey);
		};
	}

	// ------------------------------------------------------------ results

	/**
	 * Results of one participant. `next`: just finished, so the next
	 * participant comes first; `unsaved`: the browser could not store them.
	 */
	function resultsScreen(person, { next = false, unsaved = false } = {}) {
		const summary = summarizeSession(person.rows);
		const body = h('div');
		const nextButton = h(
			'button',
			{ class: 'btn' + (next ? ' primary' : ''), onclick: () => show(participantScreen) },
			'Next participant',
		);
		root.append(
			pageHeader(TITLE),
			h(
				'main',
				{ class: 'wrap' },
				next ? steps(STEPS, 2) : null,
				h('h1', {}, `Results of ${person.participant}`),
				h('p', { class: 'lead' }, `Team ${person.team} · ${summary.conditions.length} conditions`),
				unsaved
					? h(
							'p',
							{ class: 'notice warn' },
							'This browser could not store the results. Download the CSV file now: the results are lost when you leave this page.',
						)
					: null,
				h(
					'div',
					{ class: 'btn-row' },
					nextButton,
					h('button', { class: 'btn', onclick: () => show(participantsScreen) }, 'All participants and team results'),
					h(
						'button',
						{
							class: 'btn' + (unsaved ? ' primary' : ''),
							onclick: () => download(csvName(person), 'text/csv', toCSV(person.rows, A1_SCHEMA)),
						},
						'Download CSV',
					),
				),
				body,
				h(
					'footer',
					{ class: 'footer' },
					`Version ${versionLabel()} · practice A = ${PRACTICE.A}, W = ${PRACTICE.W} not included`,
				),
			),
		);
		renderIndividual(body, summary);
		if (next) nextButton.focus();
		return onResize(() => {
			body.replaceChildren();
			renderIndividual(body, summary);
		});
	}

	return () => cleanup && cleanup();
}
