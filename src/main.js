/**
 * Hash router of the single-file app.
 *
 *   #/        home
 *   #/a1      Assignment 1: Fitts' law vs. crossing
 *   #/a2      Assignment 2: linear vs. circular steering
 *   #/merge   combine exported CSV files of a team or class
 *
 * A view is a function mount(root) that may return a cleanup function.
 */

import { home } from './home.js';
import { placeholder } from './placeholder.js';
import { a1View } from './a1/view.js';
import { mergeView } from './merge/view.js';

const routes = {
	'': home,
	a1: a1View,
	a2: placeholder('Assignment 2: linear vs. circular steering'),
	merge: mergeView,
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
