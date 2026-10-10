/**
 * localStorage access that never throws: private windows, blocked storage
 * or a full quota only mean that nothing is remembered.
 */

const PREFIX = 'hci26-steering/';

export function load(key, fallback = null) {
	try {
		const raw = window.localStorage.getItem(PREFIX + key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

/** Returns false when the value could not be stored. */
export function save(key, value) {
	try {
		window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

export function remove(key) {
	try {
		window.localStorage.removeItem(PREFIX + key);
	} catch {
		// Nothing stored, nothing to remove.
	}
}
