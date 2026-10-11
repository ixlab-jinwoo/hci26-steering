import { h } from './core/dom.js';
import { versionLabel } from './core/version.js';

const OFFLINE_FILE = 'https://github.com/ixlab-jinwoo/hci26-steering/releases/latest/download/hci26-steering.html';

/** Top bar shared by all views. */
export function pageHeader(title) {
	return h(
		'header',
		{ class: 'topbar' },
		h('a', { class: 'home-link', href: '#/' }, 'HCI 2026 Lab'),
		title ? h('span', { class: 'topbar-title' }, title) : null,
	);
}

function card({ href, kicker, title, text, meta }) {
	return h(
		'a',
		{ class: 'card link-card', href },
		h('span', { class: 'kicker' }, kicker),
		h('h2', {}, title),
		h('p', {}, text),
		h('span', { class: 'card-meta' }, meta),
	);
}

export function home(root) {
	const hosted = location.protocol === 'http:' || location.protocol === 'https:';
	root.append(
		pageHeader(null),
		h(
			'main',
			{ class: 'wrap' },
			h('h1', {}, 'Pointing, crossing and steering'),
			h(
				'p',
				{ class: 'lead' },
				'Two experiments for HCI 2026. Run them, export your data as CSV, and analyse the results in the browser.',
			),
			h(
				'div',
				{ class: 'card-grid' },
				card({
					href: '#/a1',
					kicker: 'Assignment 1 · in-class team activity',
					title: 'Fitts’ law vs. crossing',
					text: 'Point at targets and cross goals of the same index of difficulty. One laptop per team: every member takes a turn, and the team results build up on the laptop.',
					meta: 'About 4 minutes per person · external mouse',
				}),
				card({
					href: '#/a2',
					kicker: 'Assignment 2 · individual homework',
					title: 'Linear vs. circular steering',
					text: 'Steer through straight and circular tunnels of the same index of difficulty. Run your participants on your laptop, download each one’s CSV file and merge the files.',
					meta: 'About 4 minutes per person · mouse, touchpad or stylus',
				}),
			),
			h(
				'section',
				{ class: 'notes' },
				h('h2', {}, 'Before you start'),
				h(
					'ul',
					{},
					h('li', {}, 'Data stays in this browser until you download it as CSV. Nothing is uploaded.'),
					h('li', {}, 'Use Chrome, Edge, Firefox or Safari on a laptop or desktop, with the browser zoom at 100 %.'),
					h(
						'li',
						{},
						'Finished participants are kept in this browser, and an interrupted run can be continued: open the page again in the same browser. ' +
							'Do not use a private window, which forgets everything when it is closed.',
					),
					hosted
						? h(
								'li',
								{},
								'This page also works offline as a single file: ',
								h('a', { href: OFFLINE_FILE }, 'download hci26-steering.html'),
								' and open it with a double-click.',
							)
						: null,
				),
			),
			h('footer', { class: 'footer' }, `Version ${versionLabel()}`),
		),
	);
}
