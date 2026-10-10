import { h } from './core/dom.js';
import { pageHeader } from './home.js';

/** Stand-in for a view that is not part of this build yet. */
export function placeholder(title) {
	return (root) => {
		root.append(
			pageHeader(title),
			h('main', { class: 'wrap' }, h('p', { class: 'lead' }, 'This part is not available in this version yet.')),
		);
	};
}
