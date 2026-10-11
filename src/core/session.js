/**
 * Participants run on this laptop, per assignment: the session in progress,
 * saved after every sequence or trial so that a reload can continue it, and
 * the finished participants. A finished participant is kept as the CSV text
 * of their download, so the results shown are exactly those of the file.
 */

import { load, save, remove } from './storage.js';
import { toCSV, fromCSV } from './csv.js';

export function loadSession(name) {
	return load('session-' + name);
}

/** Returns false when the browser refused to store it. */
export function saveSession(name, session) {
	return save('session-' + name, session);
}

export function clearSession(name) {
	remove('session-' + name);
}

const listKey = (name) => 'participants-' + name;

/** Finished participants, oldest first: [{ id, …info, rows }]. */
export function loadParticipants(name, schema) {
	return load(listKey(name), []).map(({ csv, ...info }) => ({ ...info, rows: fromCSV(csv, schema).records }));
}

/**
 * Moves a finished session into the participant list and clears it as the
 * running session. `info` holds the fields shown in the list (id first).
 * Returns the stored participant, or null when the browser refused to store
 * it; the session is then kept, so nothing is lost before a download.
 */
export function finishSession(name, info, rows, schema) {
	const list = load(listKey(name), []).filter((p) => p.id !== info.id);
	list.push({ ...info, finished: new Date().toISOString(), csv: toCSV(rows, schema) });
	if (!save(listKey(name), list)) return null;
	clearSession(name);
	return loadParticipants(name, schema).find((p) => p.id === info.id);
}

export function removeParticipant(name, id) {
	save(
		listKey(name),
		load(listKey(name), []).filter((p) => p.id !== id),
	);
}

export function clearParticipants(name) {
	remove(listKey(name));
}
