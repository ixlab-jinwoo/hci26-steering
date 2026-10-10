/**
 * Assignment 1 screens: setup → run → results. The session is saved after
 * every sequence, so a reload continues with the next one.
 */

import { h, download, slug, dateStamp, onResize } from '../core/dom.js';
import { pageHeader } from '../home.js';
import { environment, newSessionId } from '../core/device.js';
import { VERSION, versionLabel } from '../core/version.js';
import { loadSession, saveSession, clearSession } from '../core/session.js';
import { toCSV } from '../core/csv.js';
import { mean } from '../core/stats.js';
import { fmt } from '../core/chart.js';
import { steps, choices } from '../core/ui.js';
import { buildPlan, indexOfDifficulty, TECHNIQUE_LABEL, MOVEMENTS, PRACTICE } from './design.js';
import { ReciprocalSequence } from './reciprocal.js';
import { A1_SCHEMA, VELOCITY_KEYS } from './schema.js';
import { summarizeSession } from './analysis.js';
import { A1Stage, STAGE_W, STAGE_H } from './stage.js';
import { renderIndividual, TECH_COLOR } from './results.js';

const NAME = 'a1';
const TITLE = 'Assignment 1 · Fitts’ law vs. crossing';
const STEPS = ['Setup', 'Run', 'Results'];

const CUE = {
	pointing: 'POINT: click inside the highlighted bar',
	crossing: 'CROSS: sweep through the highlighted line, no clicking',
};

export function a1View(root) {
	let cleanup = null;

	function show(screen, ...args) {
		if (cleanup) cleanup();
		root.replaceChildren();
		window.scrollTo(0, 0);
		cleanup = screen(...args) || null;
	}

	const existing = loadSession(NAME);
	if (existing && existing.finished) show(resultsScreen, existing);
	else if (existing) show(resumeScreen, existing);
	else show(setupScreen);

	// ------------------------------------------------------------------ setup

	function setupScreen() {
		const team = h('input', { type: 'text', id: 'a1-team', autocomplete: 'off', required: true });
		const participant = h('input', { type: 'text', id: 'a1-participant', autocomplete: 'off', required: true });
		const device = choices(
			'a1-device',
			[
				{ value: 'mouse', label: 'Mouse' },
				{ value: 'touchpad', label: 'Touchpad' },
				{ value: 'pen', label: 'Pen / stylus' },
				{ value: 'other', label: 'Other' },
			],
			null,
		);
		const error = h('p', { class: 'error-text', role: 'alert' });
		const env = environment();
		const small = env.viewportW < STAGE_W + 40 || env.viewportH < STAGE_H + 160;

		const form = h(
			'form',
			{
				class: 'form',
				onsubmit: (e) => {
					e.preventDefault();
					if (!team.value.trim() || !participant.value.trim()) {
						error.textContent = 'Enter your team and your name or ID.';
						return;
					}
					if (!device.value) {
						error.textContent = 'Choose the input device you are using.';
						return;
					}
					const session = {
						id: newSessionId(),
						team: team.value.trim(),
						participant: participant.value.trim(),
						device: device.value,
						env: environment(),
						plan: buildPlan(),
						index: 0,
						rows: [],
						last: null,
						finished: false,
					};
					saveSession(NAME, session);
					show(runScreen, session);
				},
			},
			h('div', { class: 'field' }, h('label', { for: 'a1-team' }, 'Team'), team),
			h(
				'div',
				{ class: 'field' },
				h('label', { for: 'a1-participant' }, 'Your name or student ID'),
				participant,
				h('span', { class: 'hint' }, 'Shown to your team in the merged results.'),
			),
			h('div', { class: 'field' }, h('span', { class: 'label' }, 'Input device'), device.el),
			error,
			h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Start')),
		);

		root.append(
			pageHeader(TITLE),
			h(
				'main',
				{ class: 'wrap' },
				steps(STEPS, 0),
				h('h1', {}, 'Fitts’ law vs. crossing'),
				h(
					'p',
					{ class: 'lead' },
					'Is it faster to cross a target than to point at it? You will do both, at the same indexes of difficulty, and compare.',
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
					),
					h(
						'p',
						{},
						'Both techniques use the same distances and sizes, so each condition has the same index of difficulty ID = log₂(A / W + 1).',
					),
				),
				small
					? h(
							'p',
							{ class: 'notice warn' },
							`Your browser window is small (${env.viewportW} × ${env.viewportH}). Make it at least ${STAGE_W + 40} × ${STAGE_H + 160} pixels, or reduce the browser zoom.`,
						)
					: null,
				h('h2', {}, 'About you'),
				form,
			),
		);
		team.focus();
	}

	// ------------------------------------------------------------------ resume

	function resumeScreen(session) {
		root.append(
			pageHeader(TITLE),
			h(
				'main',
				{ class: 'wrap' },
				h('h1', {}, 'Continue where you stopped?'),
				h(
					'p',
					{ class: 'lead' },
					`${session.participant} (team ${session.team}) has finished ${session.index} of ${session.plan.length} sequences.`,
				),
				h(
					'div',
					{ class: 'btn-row' },
					h('button', { class: 'btn primary', onclick: () => show(runScreen, session) }, 'Continue'),
					h(
						'button',
						{
							class: 'btn',
							onclick: () => {
								if (!window.confirm('Discard this run and start again?')) return;
								clearSession(NAME);
								show(setupScreen);
							},
						},
						'Start again',
					),
				),
			),
		);
	}

	// ------------------------------------------------------------------ run

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
				'Esc restarts the current sequence. Your progress is saved after every sequence.',
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
				session.finished = true;
				saveSession(NAME, session);
				show(resultsScreen, session);
				return;
			}
			saveSession(NAME, session);
			intro();
		}

		function onMove(e) {
			if (!seq) return;
			const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
			for (const ev of events.length ? events : [e]) {
				const p = toStage(ev);
				handle(seq.move(p.x, p.y, ev.timeStamp, e.pointerType));
				if (!seq) break;
			}
		}

		function onDown(e) {
			if (!seq || e.button !== 0 || !overlay.hidden) return;
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
		intro(session.index > 0 ? 'Welcome back.' : '');

		return () => {
			window.removeEventListener('keydown', onKey);
		};
	}

	// ------------------------------------------------------------------ results

	function resultsScreen(session) {
		const summary = summarizeSession(session.rows);
		const fileName = `A1_${slug(session.team)}_${slug(session.participant)}_${dateStamp()}.csv`;
		const body = h('div');
		root.append(
			pageHeader(TITLE),
			h(
				'main',
				{ class: 'wrap' },
				steps(STEPS, 2),
				h('h1', {}, 'Your results'),
				h(
					'p',
					{ class: 'lead' },
					`${session.participant} · team ${session.team} · ${session.device} · ${summary.conditions.length} conditions`,
				),
				h(
					'section',
					{ class: 'card' },
					h('h2', { style: { marginTop: 0 } }, 'Save your data'),
					h(
						'p',
						{},
						'Download your CSV file and share it with your team. Drop all team members’ files into ',
						h('a', { href: '#/merge' }, 'Merge results'),
						' to see the team together.',
					),
					h(
						'div',
						{ class: 'btn-row' },
						h(
							'button',
							{
								class: 'btn primary',
								onclick: () => download(fileName, 'text/csv', toCSV(session.rows, A1_SCHEMA)),
							},
							'Download CSV',
						),
						h('a', { class: 'btn', href: '#/merge' }, 'Merge results'),
						h(
							'button',
							{
								class: 'btn',
								onclick: () => {
									if (
										!window.confirm(
											'Start a new run? These results are removed from this browser; download the CSV first.',
										)
									)
										return;
									clearSession(NAME);
									show(setupScreen);
								},
							},
							'New run',
						),
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
		return onResize(() => {
			body.replaceChildren();
			renderIndividual(body, summary);
		});
	}

	return () => cleanup && cleanup();
}
