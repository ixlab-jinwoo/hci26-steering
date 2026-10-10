/**
 * Data sets and recorded trials, with localStorage auto-save and CSV/JSON
 * export.
 *
 * A data set groups trials that belong together (a device, a participant,
 * a session). Each data set keeps the colour slot it got when it was
 * created, so its colour never changes when other data sets are removed.
 */

const STORAGE_KEY = 'steering-law/v1';
export const COLOR_SLOTS = 8;

function browserStorage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function emptyState() {
	return { datasets: [], activeId: null, nextDatasetId: 1, nextTrialId: 1, trials: [] };
}

export class DataStore {
	constructor(storage = browserStorage()) {
		this.storage = storage;
		this.listeners = [];
		this.state = emptyState();
		this.saveError = null;
		this.load();
		if (!this.state.datasets.length) this.addDataset('Data set 1');
	}

	onChange(fn) {
		this.listeners.push(fn);
	}

	emit(what) {
		for (const fn of this.listeners) fn(what);
	}

	load() {
		if (!this.storage) return;
		try {
			const raw = this.storage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed.datasets) && Array.isArray(parsed.trials)) {
				this.state = { ...emptyState(), ...parsed };
			}
		} catch {
			// Corrupt or unreadable storage: start empty.
		}
	}

	/** Returns false (and keeps the error) when the data could not be saved. */
	save() {
		if (!this.storage) return false;
		try {
			this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
			this.saveError = null;
			return true;
		} catch (e) {
			this.saveError = e;
			return false;
		}
	}

	get datasets() {
		return this.state.datasets;
	}

	get trials() {
		return this.state.trials;
	}

	get active() {
		return this.state.datasets.find((d) => d.id === this.state.activeId) || this.state.datasets[0] || null;
	}

	dataset(id) {
		return this.state.datasets.find((d) => d.id === id) || null;
	}

	freeSlot() {
		const used = new Set(this.state.datasets.map((d) => d.slot));
		for (let i = 0; i < COLOR_SLOTS; i++) if (!used.has(i)) return i;
		return -1; // drawn in a neutral grey
	}

	addDataset(label) {
		const id = this.state.nextDatasetId++;
		const dataset = { id, label: label || `Data set ${id}`, slot: this.freeSlot() };
		this.state.datasets.push(dataset);
		this.state.activeId = id;
		this.save();
		this.emit('datasets');
		return dataset;
	}

	removeDataset(id) {
		if (this.state.datasets.length <= 1) return false;
		this.state.datasets = this.state.datasets.filter((d) => d.id !== id);
		this.state.trials = this.state.trials.filter((t) => t.datasetId !== id);
		if (this.state.activeId === id) this.state.activeId = this.state.datasets[0].id;
		this.save();
		this.emit('datasets');
		return true;
	}

	setActive(id) {
		if (!this.dataset(id)) return;
		this.state.activeId = id;
		this.save();
		this.emit('active');
	}

	addTrial(record) {
		const trial = { uid: this.state.nextTrialId++, datasetId: this.active.id, ...record };
		this.state.trials.push(trial);
		this.save();
		this.emit('trials');
		return trial;
	}

	trialsOf(datasetId) {
		return this.state.trials.filter((t) => t.datasetId === datasetId);
	}

	clear() {
		this.state = emptyState();
		this.addDataset('Data set 1');
		this.emit('datasets');
	}

	toJSON() {
		return {
			format: 'steering-law-data',
			version: 1,
			exported: new Date().toISOString(),
			datasets: this.state.datasets,
			trials: this.state.trials,
		};
	}

	/** Append the data sets of a previous JSON export. Returns the number of trials added. */
	importJSON(data) {
		if (!data || !Array.isArray(data.datasets) || !Array.isArray(data.trials)) {
			throw new Error('Not a steering law data export.');
		}
		const idMap = new Map();
		for (const d of data.datasets) {
			const id = this.state.nextDatasetId++;
			idMap.set(d.id, id);
			this.state.datasets.push({ id, label: String(d.label), slot: this.freeSlot() });
		}
		let added = 0;
		for (const t of data.trials) {
			if (!idMap.has(t.datasetId)) continue;
			this.state.trials.push({ ...t, uid: this.state.nextTrialId++, datasetId: idMap.get(t.datasetId) });
			added++;
		}
		this.save();
		this.emit('datasets');
		return added;
	}
}

const CSV_COLUMNS = [
	['dataset', (t, ds) => (ds ? ds.label : t.datasetId)],
	['participant', (t) => t.participant],
	['device', (t) => t.device],
	['mode', (t) => t.mode],
	['session', (t) => t.session],
	['sequence', (t) => t.sequence],
	['attempt', (t) => t.attempt],
	['practice', (t) => t.practice],
	['shape', (t) => t.shape],
	['A', (t) => t.length],
	['W', (t) => t.width],
	['W_start', (t) => t.startWidth],
	['W_end', (t) => t.endWidth],
	['R', (t) => t.radius],
	['angle', (t) => t.angle],
	['clockwise', (t) => t.clockwise],
	['L', (t) => t.L],
	['ID', (t) => t.ID],
	['policy', (t) => t.policy],
	['completed', (t) => t.completed],
	['error', (t) => !t.completed || t.exits > 0],
	['fail_reason', (t) => t.failReason],
	['fail_position', (t) => t.failPosition],
	['MT_ms', (t) => t.mt],
	['elapsed_ms', (t) => t.elapsed],
	['exits', (t) => t.exits],
	['time_outside_ms', (t) => t.timeOutside],
	['mean_dev', (t) => t.meanDev],
	['sd_dev', (t) => t.sdDev],
	['max_abs_dev', (t) => t.maxAbsDev],
	['path_length', (t) => t.pathLength],
	['path_ratio', (t) => t.pathRatio],
	['mean_speed', (t) => t.meanSpeed],
	['timestamp', (t) => t.timestamp],
];

function csvField(v) {
	if (v === null || v === undefined) return '';
	if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
	const s = String(v);
	return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** One row per trial (without the raw samples). */
export function toCSV(trials, datasets) {
	const byId = new Map(datasets.map((d) => [d.id, d]));
	const rows = [CSV_COLUMNS.map(([name]) => name).join(',')];
	for (const t of trials) {
		const ds = byId.get(t.datasetId);
		rows.push(CSV_COLUMNS.map(([, get]) => csvField(get(t, ds))).join(','));
	}
	return rows.join('\n') + '\n';
}
