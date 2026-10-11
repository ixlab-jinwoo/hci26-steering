/**
 * Assignment 2 screens. The student runs the test with their participants
 * on their own laptop, one after the other:
 *
 *   participants → new participant → run → results
 *
 * The page shows the results of all participants on this laptop. Each
 * participant's data can be downloaded as a CSV file; the merge view
 * (#/a2/merge) combines files from several laptops. Mouse or stylus only: finger touches are
 * ignored, and a mismatch between the chosen device and the actual input is
 * pointed out once. A running session is saved after every trial, so a
 * reload can continue it.
 */

import { h, download, slug, dateStamp, onResize } from '../core/dom.js';
import { pageHeader } from '../home.js';
import { environment, newSessionId } from '../core/device.js';
import { VERSION, versionLabel } from '../core/version.js';
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
import { fmt } from '../core/chart.js';
import { steps, choices, rowActions } from '../core/ui.js';
import { SteeringTrial } from '../core/steering-trial.js';
import {
	buildPlan,
	conditions,
	makeTunnel,
	requeue,
	radiusFor,
	SHAPE_LABEL,
	LENGTHS,
	WIDTHS,
	REPS,
	PRACTICE,
	SHAPES,
} from './design.js';
import { A2_SCHEMA, SPEED_KEYS } from './schema.js';
import { speedProfile, offsets, summarizeSession, summarizeGroup } from './analysis.js';
import { TunnelStage, STAGE_W, STAGE_H, MIN_ZONE } from './stage.js';
import { renderIndividual, renderGroup, participantTable, SHAPE_COLOR } from './results.js';
import { A2_MERGE } from './merge.js';

const NAME = 'a2';
const TITLE = 'Assignment 2 · linear vs. circular steering';
const STEPS = ['Participant', 'Test', 'Results'];
const NEXT_DELAY = 500;
const MIN_W = STAGE_W + 40;
const MIN_H = STAGE_H + 220;

const DEVICE_LABEL = { mouse: 'a mouse', stylus: 'a stylus' };
const POINTER_DEVICE = { mouse: 'mouse', pen: 'stylus' };

/** The fields of a session kept in the participant list. */
const infoOf = (session) => ({
	id: session.id,
	participant: session.participant,
	device: session.device,
	hand: session.hand,
});

const csvName = (person) => `A2_${slug(person.participant)}_${dateStamp()}.csv`;
const list = (xs) => xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1];

export function a2View(root) {
	let cleanup = null;

	function show(screen, ...args) {
		if (cleanup) cleanup();
		root.replaceChildren();
		window.scrollTo(0, 0);
		cleanup = screen(...args) || null;
	}

	// Older versions kept a finished session as the running one.
	const old = loadSession(NAME);
	if (old && old.finished) finishSession(NAME, infoOf(old), old.rows, A2_SCHEMA);

	show(participantsScreen);

	// ------------------------------------------------------------ participants

	function participantsScreen() {
		const pending = loadSession(NAME);
		const people = loadParticipants(NAME, A2_SCHEMA);
		const byId = new Map(people.map((p) => [p.id, p]));
		const rows = people.flatMap((p) => p.rows);
		const group = summarizeGroup(rows);
		const body = h('div');

		const actions = (p) => {
			const person = byId.get(p.session);
			return rowActions([
				{ label: 'Results', onclick: () => show(resultsScreen, person) },
				{ label: 'CSV', onclick: () => download(csvName(person), 'text/csv', toCSV(person.rows, A2_SCHEMA)) },
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
				h('h1', {}, 'Linear vs. circular steering'),
				h(
					'p',
					{ class: 'lead' },
					'Run the test with your participants on this laptop, one after the other. ' +
						'The results of everyone on this laptop are shown below the list; download the CSV files to hand them in.',
				),
				pending
					? h(
							'div',
							{ class: 'notice warn' },
							h(
								'p',
								{ style: { marginTop: 0 } },
								`${pending.participant} has not finished: ${pending.rows.length} attempts done.`,
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
							h(
								'h2',
								{},
								`Results of the participants on this laptop (${people.length} participant${people.length === 1 ? '' : 's'})`,
							),
							body,
							h(
								'div',
								{ class: 'btn-row', style: { marginTop: '16px' } },
								h(
									'button',
									{
										class: 'btn',
										onclick: () => download(`A2_all_${dateStamp()}.csv`, 'text/csv', toCSV(rows, A2_SCHEMA)),
									},
									'Download all participants as one CSV',
								),
								h(
									'button',
									{
										class: 'btn',
										onclick: () =>
											download(
												`A2_participants_${dateStamp()}.csv`,
												'text/csv',
												toCSV(A2_MERGE.summaryRows(group), A2_MERGE.summarySchema),
											),
									},
									'Download participant summary',
								),
							),
						]
					: null,
				h(
					'section',
					{ class: 'card', style: { marginTop: '24px' } },
					h('h2', { style: { marginTop: 0 } }, 'Participants from other laptops'),
					h(
						'p',
						{},
						'Some participants ran the test on another laptop? Merge their CSV files with the participants on this laptop to see everyone together.',
					),
					h('a', { class: 'btn', href: '#/a2/merge' }, 'Merge participant files'),
				),
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
												`Delete all ${people.length} participants from this laptop? Download their CSV files first.`,
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
		const people = loadParticipants(NAME, A2_SCHEMA);
		const participant = h('input', { type: 'text', id: 'a2-participant', autocomplete: 'off' });
		const device = choices('a2-device', [
			{ value: 'mouse', label: 'Mouse' },
			{ value: 'stylus', label: 'Stylus (pen on a tablet or touchscreen)' },
		]);
		const hand = choices('a2-hand', [
			{ value: 'right', label: 'Right' },
			{ value: 'left', label: 'Left' },
		]);
		const noTouchpad = h('input', { type: 'checkbox', id: 'a2-no-touchpad' });
		const mouseCheck = h(
			'label',
			{ class: 'check', for: 'a2-no-touchpad', hidden: true },
			noTouchpad,
			'An external mouse is used, not the touchpad.',
		);
		device.el.addEventListener('change', () => (mouseCheck.hidden = device.value !== 'mouse'));
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
					const problem = !name
						? 'Enter the participant ID.'
						: people.some((p) => p.participant === name)
							? `There is already a participant ${name} on this laptop. Use another ID.`
							: !device.value
								? 'Choose the input device.'
								: device.value === 'mouse' && !noTouchpad.checked
									? 'This assignment needs an external mouse or a stylus. Touchpads are not allowed.'
									: !hand.value
										? 'Choose the hand the participant steers with.'
										: !checkSize()
											? 'Make the browser window larger first.'
											: '';
					error.textContent = problem;
					if (problem) return;
					const session = {
						id: newSessionId(),
						participant: name,
						device: device.value,
						hand: hand.value,
						env: environment(),
						blocks: buildPlan(),
						block: 0,
						index: 0,
						rows: [],
						started: false,
						mismatchNoted: false,
					};
					saveSession(NAME, session);
					show(runScreen, session);
				},
			},
			h('div', { class: 'field' }, h('label', { for: 'a2-participant' }, 'Participant ID'), participant),
			h('div', { class: 'field' }, h('span', { class: 'label' }, 'Input device'), device.el, mouseCheck),
			h('div', { class: 'field' }, h('span', { class: 'label' }, 'Hand used for steering'), hand.el),
			error,
			h(
				'div',
				{ class: 'btn-row' },
				h('button', { class: 'btn primary', type: 'submit' }, 'Start'),
				h('button', { class: 'btn', type: 'button', onclick: () => show(participantsScreen) }, 'Cancel'),
			),
		);

		const trials = conditions().length * REPS;
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
					'Does a tunnel take the same time to steer through whether it is straight or curved, when the index of difficulty is the same?',
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
							h('strong', {}, 'Press '),
							'in the green zone, keep the button pressed (or the pen on the screen), and ',
							h('strong', {}, 'steer'),
							' through the tunnel past the finish line. For a circle, go once around, back to the green line.',
						),
						h(
							'li',
							{},
							'Be as fast as you can without touching the walls. Leaving the tunnel or letting go fails the trial; it is repeated later.',
						),
						h(
							'li',
							{},
							`Straight tunnels have length L, circles have circumference L (L = ${list(LENGTHS)} px); ` +
								`widths W are ${list(WIDTHS)} px. Both shapes have the same index of difficulty ID = L / W.`,
						),
						h(
							'li',
							{},
							`${PRACTICE.length * SHAPES.length} practice trials, then ${trials} trials in random order: about 4 minutes. ` +
								'If you stop, open the file again in the same browser to continue.',
						),
						h('li', {}, 'Use a mouse or a stylus. Touchpads and fingers are not allowed: touches are ignored.'),
					),
				),
				sizeNote,
				h('h2', {}, 'Participant'),
				form,
			),
		);
		participant.focus();
		return () => window.removeEventListener('resize', checkSize);
	}

	// ------------------------------------------------------------ run

	function runScreen(session) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'stage');
		svg.setAttribute('aria-label', 'Test area');
		const stage = new TunnelStage(svg);
		const cue = h('div', { class: 'run-cue' });
		const counter = h('div', { class: 'muted' });
		const progressFill = h('div');
		const overlay = h('div', { class: 'overlay' });
		const status = h('div', { class: 'run-status' });
		const run = h(
			'div',
			{ class: 'run' },
			h('div', { class: 'run-bar' }, cue, counter),
			h('div', { class: 'progress' }, progressFill),
			h('div', { class: 'stage-box' }, svg, overlay),
			status,
			h('div', { class: 'run-help' }, `${session.participant} · Esc pauses. Progress is saved after every trial.`),
		);
		root.append(run);

		let trial = null;
		let spec = null;
		let pending = null;

		const block = () => session.blocks[session.block];

		function setStatus(text, tone = '') {
			status.textContent = text;
			status.className = 'run-status ' + tone;
		}

		function updateProgress() {
			const total = session.blocks.reduce((a, b) => a + b.queue.length, 0);
			const done = session.blocks.slice(0, session.block).reduce((a, b) => a + b.queue.length, 0) + session.index;
			progressFill.style.width = `${(100 * done) / total}%`;
			counter.textContent = `${block().name} · ${Math.min(session.index + 1, block().queue.length)} of ${block().queue.length}`;
		}

		function showOverlay(...children) {
			trial = null;
			stage.clear();
			overlay.replaceChildren(...children.filter(Boolean));
			overlay.hidden = false;
			const button = overlay.querySelector('button');
			if (button) button.focus();
		}

		function blockIntro(note = '') {
			updateProgress();
			cue.textContent = block().name;
			setStatus('');
			const b = block();
			showOverlay(
				note ? h('p', {}, note) : null,
				h('h2', {}, b.practice ? 'Practice' : b.name),
				h(
					'p',
					{},
					b.practice
						? `${b.queue.length} trials to get used to the task: both shapes, a wide and a narrow tunnel. Practice trials are not analysed.`
						: `${b.queue.length} trials in random order. Fast, but stay inside the walls.`,
				),
				h(
					'button',
					{
						class: 'btn primary',
						onclick: () => {
							session.started = true;
							overlay.hidden = true;
							nextTrial();
						},
					},
					session.index > 0 ? 'Continue' : 'Start',
				),
			);
		}

		function nextTrial() {
			pending = null;
			if (session.index >= block().queue.length) {
				session.block++;
				session.index = 0;
				if (session.block >= session.blocks.length) {
					const person = finishSession(NAME, infoOf(session), session.rows, A2_SCHEMA);
					show(resultsScreen, person || { ...infoOf(session), rows: session.rows }, { next: true, unsaved: !person });
					return;
				}
				saveSession(NAME, session);
				blockIntro(
					session.blocks[session.block - 1].practice
						? 'Practice finished.'
						: 'Block finished. Take a short break if you like.',
				);
				return;
			}
			updateProgress();
			spec = block().queue[session.index].spec;
			const tunnel = makeTunnel(spec, STAGE_W / 2, STAGE_H / 2);
			trial = new SteeringTrial(tunnel, { policy: 'strict', minZoneWidth: MIN_ZONE });
			stage.show(tunnel);
			cue.replaceChildren(
				h('span', { class: 'technique-tag', style: { background: SHAPE_COLOR[spec.shape] } }, SHAPE_LABEL[spec.shape]),
				`  L = ${spec.L} px · W = ${spec.W} px · ID = ${fmt.one(spec.ID)}`,
			);
			setStatus('Press in the green zone and steer through the tunnel.');
		}

		function toStage(e) {
			const pt = svg.createSVGPoint();
			pt.x = e.clientX;
			pt.y = e.clientY;
			return pt.matrixTransform(svg.getScreenCTM().inverse());
		}

		function deviceMismatch(pointerType) {
			const actual = POINTER_DEVICE[pointerType];
			if (!actual || actual === session.device || session.mismatchNoted) return false;
			session.mismatchNoted = true;
			saveSession(NAME, session);
			showOverlay(
				h('h2', {}, 'Is this the right device?'),
				h(
					'p',
					{},
					`You chose ${DEVICE_LABEL[session.device]}, but this input comes from ${DEVICE_LABEL[actual]}. ` +
						'If you switched devices, start again and choose the one you use.',
				),
				h(
					'div',
					{ class: 'btn-row' },
					h(
						'button',
						{
							class: 'btn primary',
							onclick: () => {
								overlay.hidden = true;
								nextTrial();
							},
						},
						'Continue anyway',
					),
					h(
						'button',
						{
							class: 'btn',
							onclick: () => {
								clearSession(NAME);
								show(participantScreen);
							},
						},
						'Start again',
					),
				),
			);
			return true;
		}

		function onDown(e) {
			if (!trial || !overlay.hidden || pending) return;
			if (e.pointerType === 'touch') {
				setStatus('Use a mouse or a stylus. Touches are ignored.', 'bad');
				return;
			}
			if (e.button !== 0) return;
			e.preventDefault();
			if (deviceMismatch(e.pointerType)) return;
			const p = toStage(e);
			if (trial.press(p.x, p.y, e.timeStamp) === 'ready') {
				svg.setPointerCapture(e.pointerId);
				trial.pointerType = e.pointerType;
				stage.setArmed(true);
				stage.startTrace(p.x, p.y);
				setStatus('Steer!');
			} else {
				setStatus('Press inside the green start zone.', 'bad');
			}
		}

		function onMove(e) {
			if (!trial || e.pointerType === 'touch') return;
			if (trial.state !== 'ready' && trial.state !== 'steering') return;
			const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
			const points = [];
			for (const ev of events.length ? events : [e]) {
				const p = toStage(ev);
				points.push([p.x, p.y]);
				const result = trial.move(p.x, p.y, ev.timeStamp);
				if (result) handle(result, p);
				if (!trial || (trial.state !== 'ready' && trial.state !== 'steering')) break;
			}
			stage.extendTrace(points);
		}

		function onUp(e) {
			if (!trial || e.pointerType === 'touch') return;
			if (trial.state !== 'ready' && trial.state !== 'steering') return;
			const p = toStage(e);
			const result = trial.release(p.x, p.y, e.timeStamp);
			if (result) handle(result, p);
		}

		function handle(result, p) {
			switch (result) {
				case 'invalid-start':
					stage.setArmed(false);
					stage.clearTrace();
					setStatus('Enter the tunnel through the green start line.', 'bad');
					break;
				case 'cancel':
					stage.setArmed(false);
					stage.clearTrace();
					setStatus('Released before the start line. Press again.');
					break;
				case 'fail':
					stage.markFailure(p.x, p.y);
					finish();
					break;
				case 'complete':
					finish();
					break;
			}
		}

		function finish() {
			const r = trial.result();
			const b = block();
			const item = b.queue[session.index];
			stage.setArmed(false);
			if (r) {
				const off = r.completed ? offsets(r.samples, spec.L, r.mt, spec.shape, spec.direction) : null;
				const speeds = r.completed ? speedProfile(r.samples, spec.L, r.mt) : null;
				const row = {
					assignment: 'A2',
					version: VERSION,
					session: session.id,
					participant: session.participant,
					device: session.device,
					hand: session.hand,
					browser: session.env.browser,
					viewport_w: session.env.viewportW,
					viewport_h: session.env.viewportH,
					dpr: session.env.dpr,
					block: b.number,
					trial: session.rows.length + 1,
					attempt: item.attempt,
					practice: b.practice,
					shape: spec.shape,
					L: spec.L,
					W: spec.W,
					R: spec.shape === 'circular' ? radiusFor(spec.L) : null,
					direction: spec.direction,
					ID: spec.ID,
					completed: r.completed,
					fail_reason: r.failReason,
					fail_position_px: r.failPosition,
					mt_ms: r.mt,
					path_ratio: r.pathRatio,
					mean_abs_offset_px: off ? off.meanAbs : null,
					inside_offset_px: off ? off.inside : null,
					pointer_type: trial.pointerType || null,
					time: new Date().toISOString(),
				};
				SPEED_KEYS.forEach((k, i) => (row[k] = speeds ? speeds[i] : null));
				session.rows.push(row);
			}
			if (r && r.completed) {
				stage.flash('ok');
				setStatus(`${fmt.int(r.mt)} ms`, 'good');
			} else {
				stage.flash('fail');
				const again = requeue(b, session.index);
				setStatus(
					(r && r.failReason === 'release' ? 'Released too early.' : 'Left the tunnel.') +
						(again ? ' This trial comes again later.' : ''),
					'bad',
				);
			}
			session.index++;
			saveSession(NAME, session);
			trial = null;
			pending = setTimeout(nextTrial, NEXT_DELAY);
		}

		function onKey(e) {
			if (e.key !== 'Escape' || !overlay.hidden) return;
			clearTimeout(pending);
			pending = null;
			showOverlay(
				h('h2', {}, 'Paused'),
				h('p', {}, 'The current trial starts again when you continue.'),
				h(
					'button',
					{
						class: 'btn primary',
						onclick: () => {
							overlay.hidden = true;
							nextTrial();
						},
					},
					'Continue',
				),
			);
		}

		const noMenu = (e) => e.preventDefault();
		svg.addEventListener('pointerdown', onDown);
		svg.addEventListener('pointermove', onMove);
		svg.addEventListener('pointerup', onUp);
		svg.addEventListener('pointercancel', onUp);
		run.addEventListener('contextmenu', noMenu);
		window.addEventListener('keydown', onKey);
		blockIntro(session.started ? `Welcome back, ${session.participant}.` : '');

		return () => {
			clearTimeout(pending);
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
				h(
					'p',
					{ class: 'lead' },
					`${person.device} · ${person.hand} hand · ${person.rows.filter((r) => !r.practice).length} attempts`,
				),
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
					h('button', { class: 'btn', onclick: () => show(participantsScreen) }, 'All participants'),
					h(
						'button',
						{
							class: 'btn' + (unsaved ? ' primary' : ''),
							onclick: () => download(csvName(person), 'text/csv', toCSV(person.rows, A2_SCHEMA)),
						},
						'Download CSV',
					),
				),
				body,
				h('footer', { class: 'footer' }, `Version ${versionLabel()} · practice trials not included`),
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
