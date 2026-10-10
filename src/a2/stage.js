/**
 * Drawing of a tunnel, its start and finish zones and the pointer trace for
 * Assignment 2. The stage is drawn 1:1 in CSS pixels, never scaled, so the
 * tunnel sizes are what they claim to be.
 */

import { bandPolygon, crossSection, pointAt, walls } from '../core/geometry.js';
import { START_ZONE } from '../core/steering-trial.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const STAGE_W = 920;
export const STAGE_H = 360;
export const FINISH_ZONE = 30;
/** Straight tunnels get a start zone at least this tall, so it is easy to press in. */
export const MIN_ZONE = 40;

function pathOf(points, close = false) {
	return 'M' + points.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + (close ? 'Z' : '');
}

function el(name, attrs) {
	const node = document.createElementNS(SVG_NS, name);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
	return node;
}

/** Start zone outline: the tunnel band, widened to MIN_ZONE for open tunnels. */
function startZone(tunnel) {
	if (tunnel.closed) return bandPolygon(tunnel, -START_ZONE, 0);
	const p0 = pointAt(tunnel, -START_ZONE);
	const p1 = pointAt(tunnel, 0);
	const half = Math.max(p1.w, MIN_ZONE) / 2;
	return [
		[p0.x - p0.nx * half, p0.y - p0.ny * half],
		[p1.x - p1.nx * half, p1.y - p1.ny * half],
		[p1.x + p1.nx * half, p1.y + p1.ny * half],
		[p0.x + p0.nx * half, p0.y + p0.ny * half],
	];
}

export class TunnelStage {
	constructor(svg) {
		this.svg = svg;
		svg.setAttribute('width', STAGE_W);
		svg.setAttribute('height', STAGE_H);
		svg.setAttribute('viewBox', `0 0 ${STAGE_W} ${STAGE_H}`);
		this.tunnelLayer = el('g', {});
		this.traceLayer = el('g', {});
		svg.append(this.tunnelLayer, this.traceLayer);
		this.trace = null;
		this.points = [];
		this.flashTimer = null;
	}

	clear() {
		this.tunnelLayer.replaceChildren();
		this.clearTrace();
		this.svg.classList.remove('flash-ok', 'flash-fail', 'armed');
	}

	show(tunnel) {
		this.clear();
		const g = this.tunnelLayer;
		const { left, right } = walls(tunnel);
		if (tunnel.closed) {
			g.append(
				el('path', { class: 'tunnel-body', d: pathOf(left, true) + pathOf(right, true) }),
				el('path', { class: 'tunnel-wall', d: pathOf(left, true) }),
				el('path', { class: 'tunnel-wall', d: pathOf(right, true) }),
			);
		} else {
			g.append(
				el('path', {
					class: 'finish-zone',
					d: pathOf(bandPolygon(tunnel, tunnel.length, tunnel.length + FINISH_ZONE), true),
				}),
				el('path', { class: 'tunnel-body', d: pathOf(left.concat(right.slice().reverse()), true) }),
				el('path', { class: 'tunnel-wall', d: pathOf(left) }),
				el('path', { class: 'tunnel-wall', d: pathOf(right) }),
			);
		}
		g.append(el('path', { class: 'start-zone', d: pathOf(startZone(tunnel), true) }));

		// Direction arrow in the middle of the start zone.
		const a = pointAt(tunnel, -START_ZONE / 2);
		const size = Math.min(9, a.w / 3 + 3);
		const tip = [a.x + a.tx * size, a.y + a.ty * size];
		const back = [a.x - a.tx * size * 0.6, a.y - a.ty * size * 0.6];
		g.append(
			el('path', {
				class: 'arrow',
				d: pathOf(
					[
						tip,
						[back[0] + a.nx * size * 0.7, back[1] + a.ny * size * 0.7],
						[back[0] - a.nx * size * 0.7, back[1] - a.ny * size * 0.7],
					],
					true,
				),
			}),
		);
		if (!tunnel.closed) g.append(el('path', { class: 'finish-line', d: pathOf(crossSection(tunnel, tunnel.length)) }));
		g.append(el('path', { class: 'start-line', d: pathOf(crossSection(tunnel, 0)) }));
		// Invisible centreline, for automated tests.
		g.append(
			el('path', {
				class: 'centreline',
				id: 'centreline',
				'data-closed': tunnel.closed,
				d: pathOf(
					tunnel.samples.map((p) => [p.x, p.y]),
					tunnel.closed,
				),
			}),
		);
	}

	setArmed(armed) {
		this.svg.classList.toggle('armed', armed);
	}

	startTrace(x, y) {
		this.clearTrace();
		this.points = [[x, y]];
		this.trace = el('path', { class: 'trace' });
		this.traceLayer.append(this.trace);
	}

	extendTrace(points) {
		if (!this.trace) return;
		for (const p of points) this.points.push(p);
		this.trace.setAttribute('d', pathOf(this.points));
	}

	clearTrace() {
		this.traceLayer.replaceChildren();
		this.trace = null;
		this.points = [];
	}

	markFailure(x, y) {
		const s = 7;
		this.traceLayer.append(
			el('path', { class: 'fail-mark', d: `M${x - s},${y - s}L${x + s},${y + s}M${x - s},${y + s}L${x + s},${y - s}` }),
		);
	}

	flash(kind) {
		this.svg.classList.toggle('flash-ok', kind === 'ok');
		this.svg.classList.toggle('flash-fail', kind === 'fail');
		clearTimeout(this.flashTimer);
		this.flashTimer = setTimeout(() => this.svg.classList.remove('flash-ok', 'flash-fail'), 450);
	}
}
