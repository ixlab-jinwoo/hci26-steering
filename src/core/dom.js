/**
 * Minimal DOM building. Text always goes in as text nodes, never as HTML.
 *
 *   h('button', { class: 'primary', onclick: start }, 'Start')
 */
export function h(tag, attrs = {}, ...children) {
	const el = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs || {})) {
		if (value === null || value === undefined || value === false) continue;
		if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
		else if (key === 'class') el.className = value;
		else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
		else if (value === true) el.setAttribute(key, '');
		else el.setAttribute(key, value);
	}
	append(el, children);
	return el;
}

function append(el, children) {
	for (const child of children) {
		if (child === null || child === undefined || child === false) continue;
		if (Array.isArray(child)) append(el, child);
		else el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
	}
}

/** Download text content as a file. */
export function download(name, type, content) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const a = h('a', { href: url, download: name });
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-name friendly version of a label. */
export function slug(text) {
	return (
		String(text)
			.trim()
			.replace(/[^A-Za-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'x'
	);
}

export function dateStamp() {
	return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

/** Call fn when the window width changes (debounced). Returns a remover. */
export function onResize(fn, delay = 200) {
	let timer = null;
	let width = window.innerWidth;
	const handler = () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (window.innerWidth === width) return;
			width = window.innerWidth;
			fn();
		}, delay);
	};
	window.addEventListener('resize', handler);
	return () => {
		clearTimeout(timer);
		window.removeEventListener('resize', handler);
	};
}
