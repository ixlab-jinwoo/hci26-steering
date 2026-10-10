/**
 * The running or finished session of an assignment, kept in localStorage
 * so that a reload or a closed tab can continue where it stopped.
 */

import { load, save, remove } from './storage.js';

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
