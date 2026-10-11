/**
 * Hash router of the single-file app.
 *
 *   #/          home
 *   #/a1        Assignment 1: Fitts' law vs. crossing
 *   #/a2        Assignment 2: linear vs. circular steering
 *   #/a2/merge  Assignment 2: combine the participants' CSV files
 *
 * A view is a function mount(root) that may return a cleanup function.
 */

import { home } from './home.js';
import { a1View } from './a1/view.js';
import { a2View } from './a2/view.js';
import { a2MergeView } from './a2/merge.js';

const routes = {
	'': home,
	a1: a1View,
	a2: a2View,
	'a2/merge': a2MergeView,
};

const root = document.getElementById('app');
let cleanup = null;

function route() {
	const name = location.hash.replace(/^#\/?/, '').split('?')[0];
	const view = routes[name] || home;
	if (cleanup) cleanup();
	root.replaceChildren();
	window.scrollTo(0, 0);
	cleanup = view(root) || null;
}

window.addEventListener('hashchange', route);
route();
