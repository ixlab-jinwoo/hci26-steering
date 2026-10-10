/**
 * Wires the test area, the control panel, the data store and the plots.
 */

import { DataStore, toCSV } from './data.js';
import { makeTunnel } from './geometry.js';
import { SteeringTrial } from './trial.js';
import {
	DEFAULT_DESIGN,
	DIRECTIONS,
	Session,
	buildPlan,
	conditionKey,
	conditionLabel,
	trialSpec,
	parseNumberList,
	parseWidthPairs,
} from './experiment.js';
import { Stage, STAGE_SIZE } from './stage.js';
import { START_ZONE } from './trial.js';
import { renderLive } from './plots/live.js';
import { renderAnalysis } from './plots/analysis.js';
import { slotColor, fmt } from './plots/chart.js';

const $ = (id) => document.getElementById(id);

const NEXT_TRIAL_DELAY = 600; // ms between the end of a trial and the next tunnel
const ANALYSIS_DELAY = 800; // ms of quiet before the evaluation figures update
const MARGIN = 10; // px between tunnel extent and the edge of the test area

const store = new DataStore();
const stage = new Stage($('test-area'));

const app = {
	mode: 'free',
	policy: 'strict',
	free: {
		shape: 'straight',
		length: 400,
		width: 30,
		radius: 150,
		startWidth: 80,
		endWidth: 20,
		index: 0,
		randomize: false,
	},
	experiment: null, // { session, participant, device, sessionId }
	spec: null,
	tunnel: null,
	trial: null,
	busy: false,
	idMode: 'nominal',
	focusId: null,
	// Code version (from version.json, written at deploy time) stored with
	// every trial so recorded data can be traced back to the code.
	version: { version: 'unknown', commit: null },
};

const LIMITS = {
	length: [100, 600],
	radius: [60, 300],
	width: [10, 120],
};

// ------------------------------------------------------------------ status

function setStatus(text, tone = '') {
	const el = $('status-main');
	el.textContent = text;
	el.className = tone;
}

function updateStatusDetail() {
	const el = $('status-detail');
	if (!app.spec) {
		el.textContent = '';
		return;
	}
	const id = 'ID ' + fmt.two(app.tunnel.id);
	if (app.mode === 'experiment' && app.experiment) {
		const s = app.experiment.session;
		const p = s.progress;
		const cur = s.current;
		el.textContent =
			(cur && cur.practice ? 'Practice · ' : '') +
			`Sequence ${p.sequence}/${p.sequences} · Trial ${p.trial}/${p.trials}` +
			(cur && cur.attempt > 1 ? ` (attempt ${cur.attempt})` : '');
	} else {
		el.textContent = `${conditionLabel(app.spec)} · ${id} · trial ${(app.free.index % DIRECTIONS.length) + 1}/8`;
	}
}

// ------------------------------------------------------------------ trials

function freeCondition() {
	const f = app.free;
	if (f.shape === 'straight') return { shape: 'straight', length: f.length, width: f.width };
	if (f.shape === 'circular') return { shape: 'circular', radius: f.radius, width: f.width };
	return { shape: 'tapered', length: f.length, startWidth: f.startWidth, endWidth: f.endWidth };
}

function currentSpec() {
	if (app.mode === 'experiment') {
		if (!app.experiment || app.experiment.session.done) return null;
		return app.experiment.session.current.spec;
	}
	return trialSpec(freeCondition(), app.free.index);
}

function loadTrial() {
	const spec = currentSpec();
	app.spec = spec;
	if (!spec) {
		app.tunnel = null;
		app.trial = null;
		stage.clear();
		updateStatusDetail();
		return;
	}
	app.tunnel = makeTunnel(spec, stage.center, stage.center);
	app.trial = new SteeringTrial(app.tunnel, { policy: app.policy });
	stage.show(app.tunnel);
	setStatus('Press in the green zone and drag through the tunnel');
	updateStatusDetail();
	updateFreeReadout();
	renderLivePlots();
}

function svgPoint(event) {
	const svg = $('test-area');
	const m = svg.getScreenCTM().inverse();
	const pt = svg.createSVGPoint();
	pt.x = event.clientX;
	pt.y = event.clientY;
	const p = pt.matrixTransform(m);
	return { x: p.x, y: p.y };
}

function onPointerDown(event) {
	if (event.button !== 0 || !app.trial || app.busy) return;
	event.preventDefault();
	const p = svgPoint(event);
	if (app.trial.press(p.x, p.y, event.timeStamp) === 'ready') {
		$('test-area').setPointerCapture(event.pointerId);
		stage.setArmed(true);
		stage.startTrace(p.x, p.y);
		setStatus('Drag through the tunnel…');
	} else {
		setStatus('Press inside the green start zone', 'bad');
	}
}

function onPointerMove(event) {
	const trial = app.trial;
	if (!trial || (trial.state !== 'ready' && trial.state !== 'steering')) return;
	const coalesced = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
	const events = coalesced.length ? coalesced : [event];
	const points = [];
	for (const e of events) {
		const p = svgPoint(e);
		points.push([p.x, p.y]);
		const result = trial.move(p.x, p.y, e.timeStamp);
		if (result) handleTrialEvent(result, p);
		if (trial.state !== 'ready' && trial.state !== 'steering') break;
	}
	stage.extendTrace(points);
}

function onPointerUp(event) {
	const trial = app.trial;
	if (!trial || (trial.state !== 'ready' && trial.state !== 'steering')) return;
	const p = svgPoint(event);
	const result = trial.release(p.x, p.y, event.timeStamp);
	if (result) handleTrialEvent(result, p);
}

function handleTrialEvent(result, p) {
	switch (result) {
		case 'start':
			setStatus('Steer!');
			break;
		case 'invalid-start':
			stage.setArmed(false);
			stage.clearTrace();
			setStatus('Enter the tunnel through the green start line', 'bad');
			break;
		case 'cancel':
			stage.setArmed(false);
			stage.clearTrace();
			setStatus('Released before the start line, try again');
			break;
		case 'exit':
			setStatus('Outside the tunnel, get back in', 'bad');
			break;
		case 'reenter':
			setStatus('Steer!');
			break;
		case 'fail':
			stage.markFailure(p.x, p.y);
			finishTrial();
			break;
		case 'complete':
			finishTrial();
			break;
	}
}

function finishTrial() {
	const trial = app.trial;
	const result = trial.result();
	stage.setArmed(false);
	if (!result) return;

	const exp = app.mode === 'experiment' ? app.experiment : null;
	const cur = exp ? exp.session.current : null;
	const { samples, ...summary } = result;
	store.addTrial({
		mode: app.mode,
		participant: exp ? exp.participant : null,
		device: exp ? exp.device : null,
		session: exp ? exp.sessionId : null,
		sequence: cur ? cur.sequence + 1 : null,
		attempt: cur ? cur.attempt : null,
		practice: cur ? cur.practice : false,
		...app.spec,
		L: app.tunnel.length,
		ID: app.tunnel.id,
		timestamp: new Date().toISOString(),
		appVersion: app.version.version,
		appCommit: app.version.commit,
		...summary,
		samples,
	});
	showSaveState();

	if (result.completed) {
		stage.flash('ok');
		setStatus(
			`MT ${fmt.int(result.mt)} ms` + (result.exits ? ` · left the tunnel ${result.exits}×` : ''),
			result.exits ? 'bad' : 'good',
		);
	} else {
		stage.flash('fail');
		setStatus(
			result.failReason === 'release' ? 'Button released, trial failed' : 'Left the tunnel, trial failed',
			'bad',
		);
	}

	// Advance to the next trial.
	if (exp) {
		exp.session.advance(result.completed);
	} else if (result.completed) {
		app.free.index++;
		if (app.free.randomize && app.free.index % DIRECTIONS.length === 0) randomizeFree();
	}

	app.busy = true;
	setTimeout(() => {
		app.busy = false;
		if (exp && exp.session.done) {
			finishExperiment();
			return;
		}
		loadTrial();
		updateExperimentProgress();
	}, NEXT_TRIAL_DELAY);

	renderLivePlots();
	scheduleAnalysis();
}

// ------------------------------------------------------------------ free mode

function randomInt(lo, hi, step = 1) {
	return lo + step * Math.floor(Math.random() * ((hi - lo) / step + 1));
}

function randomizeFree() {
	const f = app.free;
	f.length = randomInt(...LIMITS.length, 10);
	f.radius = randomInt(...LIMITS.radius, 10);
	f.width = randomInt(...LIMITS.width);
	f.startWidth = randomInt(...LIMITS.width);
	f.endWidth = randomInt(...LIMITS.width);
	f.index = 0;
	syncFreeControls();
}

function syncFreeControls() {
	const f = app.free;
	$('p-length').value = f.length;
	$('p-radius').value = f.radius;
	$('p-width').value = f.width;
	$('p-start-width').value = f.startWidth;
	$('p-end-width').value = f.endWidth;
	document.querySelectorAll('input[name="shape"]').forEach((r) => (r.checked = r.value === f.shape));
	document.querySelectorAll('#free-panel [data-shapes]').forEach((el) => {
		el.hidden = !el.dataset.shapes.split(' ').includes(f.shape);
	});
	updateFreeReadout();
}

function updateFreeReadout() {
	const f = app.free;
	$('o-length').textContent = f.length + ' px';
	$('o-radius').textContent = f.radius + ' px';
	$('o-width').textContent = f.width + ' px';
	$('o-start-width').textContent = f.startWidth + ' px';
	$('o-end-width').textContent = f.endWidth + ' px';
	if (app.mode === 'free' && app.tunnel) {
		$('o-id').textContent = fmt.two(app.tunnel.id);
		$('o-path').textContent = fmt.int(app.tunnel.length);
	}
}

function bindFreeControls() {
	const bind = (id, key) =>
		$(id).addEventListener('input', (e) => {
			app.free[key] = Number(e.target.value);
			app.free.index = 0;
			app.free.randomize = false;
			$('randomize').checked = false;
			updateFreeReadout();
			if (app.mode === 'free' && !trialInProgress()) loadTrial();
		});
	bind('p-length', 'length');
	bind('p-radius', 'radius');
	bind('p-width', 'width');
	bind('p-start-width', 'startWidth');
	bind('p-end-width', 'endWidth');

	document.querySelectorAll('input[name="shape"]').forEach((r) =>
		r.addEventListener('change', () => {
			app.free.shape = r.value;
			app.free.index = 0;
			syncFreeControls();
			if (app.mode === 'free') loadTrial();
		}),
	);
	$('randomize').addEventListener('change', (e) => (app.free.randomize = e.target.checked));
	$('randomize-now').addEventListener('click', () => {
		randomizeFree();
		if (app.mode === 'free') loadTrial();
	});
}

function trialInProgress() {
	return app.trial && (app.trial.state === 'ready' || app.trial.state === 'steering');
}

// ------------------------------------------------------------------ experiment mode

const DESIGN_FIELDS = {
	'x-straight-lengths': (d) => d.straight.lengths.join(', '),
	'x-straight-widths': (d) => d.straight.widths.join(', '),
	'x-straight-trials': (d) => d.straight.trials,
	'x-circular-radii': (d) => d.circular.radii.join(', '),
	'x-circular-widths': (d) => d.circular.widths.join(', '),
	'x-circular-trials': (d) => d.circular.trials,
	'x-tapered-length': (d) => d.tapered.length,
	'x-tapered-pairs': (d) => d.tapered.pairs.map((p) => p.join('>')).join(', '),
	'x-tapered-trials': (d) => d.tapered.trials,
};

function fillDesignForm(design) {
	for (const [id, get] of Object.entries(DESIGN_FIELDS)) $(id).value = get(design);
}

function trialCount(id) {
	const n = Number($(id).value);
	if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error('Trials per condition must be between 1 and 32.');
	return n;
}

/** Read and validate the design form. Throws with a readable message. */
function readDesign() {
	const maxLength = 2 * (STAGE_SIZE / 2 - MARGIN - START_ZONE);
	const maxRing = STAGE_SIZE / 2 - MARGIN;
	const check = (ok, msg) => {
		if (!ok) throw new Error(msg);
	};
	const design = {
		practice: $('x-practice').checked,
		shuffleBlocks: $('x-shuffle').checked,
		maxAttempts: DEFAULT_DESIGN.maxAttempts,
		straight: { enabled: $('x-straight-on').checked },
		circular: { enabled: $('x-circular-on').checked },
		tapered: { enabled: $('x-tapered-on').checked },
	};
	check(design.straight.enabled || design.circular.enabled || design.tapered.enabled, 'Select at least one shape.');

	if (design.straight.enabled) {
		const s = design.straight;
		s.lengths = parseNumberList($('x-straight-lengths').value);
		s.widths = parseNumberList($('x-straight-widths').value);
		s.trials = trialCount('x-straight-trials');
		check(Math.max(...s.lengths) <= maxLength, `Straight: lengths up to ${maxLength} px fit the test area.`);
		check(Math.max(...s.widths) <= 200, 'Straight: widths up to 200 px.');
	}
	if (design.circular.enabled) {
		const c = design.circular;
		c.radii = parseNumberList($('x-circular-radii').value);
		c.widths = parseNumberList($('x-circular-widths').value);
		c.trials = trialCount('x-circular-trials');
		for (const r of c.radii) {
			for (const w of c.widths) {
				check(r + w / 2 <= maxRing, `Circular: R + W/2 must be at most ${maxRing} px (R=${r}, W=${w}).`);
				check(r - w / 2 >= 10, `Circular: the tunnel is wider than its radius allows (R=${r}, W=${w}).`);
			}
		}
	}
	if (design.tapered.enabled) {
		const t = design.tapered;
		const lengths = parseNumberList($('x-tapered-length').value);
		check(lengths.length === 1, 'Tapered: enter a single length.');
		t.length = lengths[0];
		t.pairs = parseWidthPairs($('x-tapered-pairs').value);
		t.trials = trialCount('x-tapered-trials');
		check(t.length <= maxLength, `Tapered: lengths up to ${maxLength} px fit the test area.`);
		check(Math.max(...t.pairs.flat()) <= 200, 'Tapered: widths up to 200 px.');
	}
	return design;
}

function updateDesignSummary() {
	try {
		const design = readDesign();
		const plan = buildPlan(design);
		const trials = plan.reduce((a, s) => a + s.trials.length, 0);
		const practice = plan.filter((s) => s.practice).reduce((a, s) => a + s.trials.length, 0);
		$('x-summary').textContent =
			`${plan.length} sequences · ${trials} trials` + (practice ? ` (${practice} practice)` : '');
		$('x-error').textContent = '';
		$('x-start').disabled = false;
	} catch (e) {
		$('x-summary').textContent = '';
		$('x-error').textContent = e.message;
		$('x-start').disabled = true;
	}
}

function startExperiment(event) {
	event.preventDefault();
	let design;
	try {
		design = readDesign();
	} catch (e) {
		$('x-error').textContent = e.message;
		return;
	}
	const participant = $('x-participant').value.trim() || 'P';
	const device = $('x-device').value.trim();
	store.addDataset(device ? `${participant} · ${device}` : participant);
	app.experiment = {
		session: new Session(buildPlan(design), { maxAttempts: design.maxAttempts }),
		participant,
		device,
		sessionId: new Date().toISOString(),
	};
	lockForExperiment(true);
	$('x-run-label').textContent = `Running: ${store.active.label}`;
	loadTrial();
	updateExperimentProgress();
}

function updateExperimentProgress() {
	if (!app.experiment) return;
	const s = app.experiment.session;
	const total = s.sequences.reduce((a, q) => a + q.queue.length, 0);
	const done = s.sequences.slice(0, s.seqIndex).reduce((a, q) => a + q.queue.length, 0) + s.trialIndex;
	$('x-progress').style.width = `${(100 * done) / total}%`;
	$('x-progress-text').textContent = s.done
		? `Done: ${total} trials`
		: `${done} of ${total} trials (including repeats so far)`;
}

function finishExperiment() {
	updateExperimentProgress();
	const label = store.active.label;
	app.experiment = null;
	lockForExperiment(false);
	loadTrial(); // nothing to show in experiment mode
	setStatus(`Experiment complete. The data is in "${label}"; export it below.`, 'good');
	scheduleAnalysis();
}

function abortExperiment() {
	if (!window.confirm('Abort the experiment? Trials recorded so far are kept.')) return;
	app.experiment = null;
	lockForExperiment(false);
	loadTrial();
	setStatus('Experiment aborted. Recorded trials are kept.');
}

function lockForExperiment(locked) {
	$('experiment-setup').hidden = locked;
	$('experiment-run').hidden = !locked;
	$('tab-free').disabled = locked;
	document.querySelectorAll('input[name="policy"]').forEach((r) => (r.disabled = locked));
	$('dataset-list').classList.toggle('locked', locked);
	$('add-dataset')
		.querySelectorAll('input, button')
		.forEach((el) => (el.disabled = locked));
	['import-json', 'clear-data'].forEach((id) => ($(id).disabled = locked));
	renderDatasets();
}

function setMode(mode) {
	if (app.mode === mode || app.experiment) return;
	app.mode = mode;
	$('tab-free').setAttribute('aria-selected', mode === 'free');
	$('tab-experiment').setAttribute('aria-selected', mode === 'experiment');
	$('free-panel').hidden = mode !== 'free';
	$('experiment-panel').hidden = mode !== 'experiment';
	loadTrial();
	if (mode === 'experiment') {
		setStatus('Set up the design and press Start experiment');
		updateDesignSummary();
	}
}

function bindExperimentControls() {
	fillDesignForm(DEFAULT_DESIGN);
	$('experiment-setup').addEventListener('input', updateDesignSummary);
	$('experiment-setup').addEventListener('submit', startExperiment);
	$('x-abort').addEventListener('click', abortExperiment);
	$('tab-free').addEventListener('click', () => setMode('free'));
	$('tab-experiment').addEventListener('click', () => setMode('experiment'));
}

// ------------------------------------------------------------------ policy & data sets

const POLICY_HELP = {
	strict: 'Leaving the tunnel ends the trial as an error. In experiment mode the trial is repeated later.',
	lenient: 'Leaving the tunnel is counted (how often, where, for how long) and the trial continues.',
};

function bindPolicy() {
	document.querySelectorAll('input[name="policy"]').forEach((r) =>
		r.addEventListener('change', () => {
			app.policy = r.value;
			$('policy-help').textContent = POLICY_HELP[app.policy];
			if (!trialInProgress()) loadTrial();
		}),
	);
	$('policy-help').textContent = POLICY_HELP[app.policy];
}

function renderDatasets() {
	const list = $('dataset-list');
	list.replaceChildren();
	const counts = new Map();
	for (const t of store.trials) counts.set(t.datasetId, (counts.get(t.datasetId) || 0) + 1);
	const locked = !!app.experiment;
	for (const ds of store.datasets) {
		const li = document.createElement('li');
		li.setAttribute('aria-current', ds.id === store.active.id);
		li.tabIndex = locked ? -1 : 0;
		const sw = document.createElement('i');
		sw.className = 'swatch';
		sw.style.background = slotColor(ds.slot);
		const name = document.createElement('span');
		name.className = 'name';
		name.textContent = ds.label;
		const count = document.createElement('span');
		count.className = 'count';
		count.textContent = counts.get(ds.id) || 0;
		const del = document.createElement('button');
		del.type = 'button';
		del.textContent = '×';
		del.title = `Delete ${ds.label}`;
		del.setAttribute('aria-label', `Delete ${ds.label}`);
		del.disabled = locked || store.datasets.length <= 1;
		del.addEventListener('click', (e) => {
			e.stopPropagation();
			const n = counts.get(ds.id) || 0;
			if (n && !window.confirm(`Delete "${ds.label}" and its ${n} trials?`)) return;
			store.removeDataset(ds.id);
		});
		const activate = () => {
			if (!locked) store.setActive(ds.id);
		};
		li.addEventListener('click', activate);
		li.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				activate();
			}
		});
		li.append(sw, name, count, del);
		list.appendChild(li);
	}

	const select = $('focus-dataset');
	select.replaceChildren();
	if (!store.dataset(app.focusId)) app.focusId = store.active.id;
	for (const ds of store.datasets) {
		const opt = document.createElement('option');
		opt.value = ds.id;
		opt.textContent = ds.label;
		opt.selected = ds.id === app.focusId;
		select.appendChild(opt);
	}
}

function showSaveState() {
	const el = $('save-warning');
	if (store.saveError) {
		el.hidden = false;
		el.textContent = 'Browser storage is full or unavailable: new trials are not saved. Export JSON to keep them.';
	} else {
		el.hidden = true;
	}
}

function download(name, type, content) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
	return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function bindDataControls() {
	$('add-dataset').addEventListener('submit', (e) => {
		e.preventDefault();
		store.addDataset($('new-dataset').value.trim());
		$('new-dataset').value = '';
	});
	$('export-csv').addEventListener('click', () =>
		download(`steering-trials-${stamp()}.csv`, 'text/csv', toCSV(store.trials, store.datasets)),
	);
	$('export-json').addEventListener('click', () =>
		download(`steering-data-${stamp()}.json`, 'application/json', JSON.stringify(store.toJSON())),
	);
	$('import-json').addEventListener('click', () => $('import-file').click());
	$('import-file').addEventListener('change', async (e) => {
		const file = e.target.files[0];
		e.target.value = '';
		if (!file) return;
		try {
			const n = store.importJSON(JSON.parse(await file.text()));
			setStatus(`Imported ${n} trials.`, 'good');
		} catch (err) {
			setStatus('Import failed: ' + err.message, 'bad');
		}
		showSaveState();
	});
	$('clear-data').addEventListener('click', () => {
		if (!window.confirm('Delete all data sets and trials? Export first if you want to keep them.')) return;
		store.clear();
		showSaveState();
	});
	$('focus-dataset').addEventListener('change', (e) => {
		app.focusId = Number(e.target.value);
		scheduleAnalysis(0);
	});
	document.querySelectorAll('input[name="id-mode"]').forEach((r) =>
		r.addEventListener('change', () => {
			app.idMode = r.value;
			scheduleAnalysis(0);
		}),
	);

	store.onChange((what) => {
		renderDatasets();
		if (what !== 'trials') {
			renderLivePlots();
			scheduleAnalysis();
		}
	});
}

// ------------------------------------------------------------------ plots

const liveEls = {};
for (const [key, id] of Object.entries({
	trajectory: 'live-trajectory',
	speed: 'live-speed',
	deviation: 'live-deviation',
	scatter: 'live-scatter',
})) {
	const fig = $(id);
	liveEls[key] = { chart: fig.querySelector('.chart-box'), sub: fig.querySelector('.chart-sub') };
}

const analysisEls = { table: $('model-table') };
for (const [key, id] of Object.entries({
	mtId: 'fig-mt-id',
	shapes: 'fig-shapes',
	errors: 'fig-errors',
	localLaw: 'fig-local-law',
	profile: 'fig-profile',
	widths: 'fig-widths',
	throughput: 'fig-throughput',
})) {
	const fig = $(id);
	analysisEls[key] = { chart: fig.querySelector('.chart-box'), legend: fig.querySelector('.legend') };
}

function renderLivePlots() {
	const active = store.active;
	const datasetTrials = store.trialsOf(active.id);
	const tunnel = app.tunnel;
	if (!tunnel) {
		renderLive(liveEls, {
			tunnel: makeTunnel(trialSpec(freeCondition(), 0), 0, 0),
			recent: [],
			datasetTrials,
			tunnelLabel: 'No tunnel',
			color: slotColor(active.slot),
		});
		return;
	}
	const key = conditionKey(app.spec);
	const recent = datasetTrials.filter((t) => conditionKey(t) === key).slice(-12);
	renderLive(liveEls, {
		tunnel,
		recent,
		datasetTrials,
		tunnelLabel: conditionLabel(app.spec),
		color: slotColor(active.slot),
	});
}

let analysisTimer = null;

function scheduleAnalysis(delay = ANALYSIS_DELAY) {
	clearTimeout(analysisTimer);
	analysisTimer = setTimeout(() => {
		// Never redraw in the middle of a trial.
		if (trialInProgress()) {
			scheduleAnalysis();
			return;
		}
		renderAnalysis(analysisEls, {
			trials: store.trials,
			datasets: store.datasets,
			focusId: app.focusId,
			idMode: app.idMode,
		});
	}, delay);
}

let resizeTimer = null;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => {
		if (trialInProgress()) return;
		renderLivePlots();
		scheduleAnalysis(0);
	}, 200);
});

// ------------------------------------------------------------------ init

async function loadVersion() {
	try {
		const response = await fetch('version.json', { cache: 'no-store' });
		if (response.ok) app.version = await response.json();
	} catch {
		// Served without version.json (e.g. plain `python3 -m http.server`).
	}
	const { version, commit } = app.version;
	$('app-version').textContent = `Version ${version}` + (commit ? ` (${commit.slice(0, 7)})` : '');
}

const svg = $('test-area');
svg.addEventListener('pointerdown', onPointerDown);
svg.addEventListener('pointermove', onPointerMove);
svg.addEventListener('pointerup', onPointerUp);
svg.addEventListener('pointercancel', onPointerUp);

bindFreeControls();
bindExperimentControls();
bindPolicy();
bindDataControls();
syncFreeControls();
renderDatasets();
showSaveState();
loadTrial();
scheduleAnalysis(0);
loadVersion();
