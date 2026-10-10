/**
 * Drawing of the tunnel, the start and finish zones and the pointer trace in
 * the test area. The test area is drawn 1:1 in CSS pixels (never scaled), so
 * tunnel sizes are what they claim to be.
 */

import { bandPolygon, crossSection, pointAt, walls } from './geometry.js';
import { START_ZONE } from './trial.js';

const d3 = window.d3;
const SVG_NS = 'http://www.w3.org/2000/svg';

export const STAGE_SIZE = 720;
export const FINISH_ZONE = 30;

function pathOf(points, close = false) {
	return 'M' + points.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + (close ? 'Z' : '');
}

export class Stage {
	constructor(svgElement) {
		this.svg = d3
			.select(svgElement)
			.attr('width', STAGE_SIZE)
			.attr('height', STAGE_SIZE)
			.attr('viewBox', `0 0 ${STAGE_SIZE} ${STAGE_SIZE}`);
		this.tunnelLayer = this.svg.append('g');
		this.traceLayer = this.svg.append('g');
		this.trace = null;
		this.tracePoints = [];
		this.flashTimer = null;
	}

	get center() {
		return STAGE_SIZE / 2;
	}

	/** Draw a tunnel and clear the previous trace. */
	show(tunnel) {
		const g = this.tunnelLayer;
		g.selectAll('*').remove();
		this.clearTrace();
		this.svg.classed('flash-ok flash-fail armed', false);

		// Tunnel body: one polygon for open tunnels, a ring for closed ones.
		const { left, right } = walls(tunnel);
		if (tunnel.closed) {
			g.append('path')
				.attr('class', 'tunnel-body')
				.attr('d', pathOf(left, true) + pathOf(right, true));
			g.append('path').attr('class', 'tunnel-wall').attr('d', pathOf(left, true));
			g.append('path').attr('class', 'tunnel-wall').attr('d', pathOf(right, true));
		} else {
			g.append('path')
				.attr('class', 'finish-zone')
				.attr('d', pathOf(bandPolygon(tunnel, tunnel.length, tunnel.length + FINISH_ZONE), true));
			g.append('path')
				.attr('class', 'tunnel-body')
				.attr('d', pathOf(left.concat(right.slice().reverse()), true));
			g.append('path').attr('class', 'tunnel-wall').attr('d', pathOf(left));
			g.append('path').attr('class', 'tunnel-wall').attr('d', pathOf(right));
		}

		g.append('path')
			.attr('class', 'start-zone')
			.attr('d', pathOf(bandPolygon(tunnel, -START_ZONE, 0), true));

		// Direction arrow in the middle of the start zone.
		const a = pointAt(tunnel, -START_ZONE / 2);
		const size = Math.min(9, a.w / 3 + 3);
		const tip = [a.x + a.tx * size, a.y + a.ty * size];
		const back = [a.x - a.tx * size * 0.6, a.y - a.ty * size * 0.6];
		g.append('path')
			.attr('class', 'arrow')
			.attr(
				'd',
				pathOf(
					[
						tip,
						[back[0] + a.nx * size * 0.7, back[1] + a.ny * size * 0.7],
						[back[0] - a.nx * size * 0.7, back[1] - a.ny * size * 0.7],
					],
					true,
				),
			);

		if (!tunnel.closed) {
			g.append('path')
				.attr('class', 'finish-line')
				.attr('d', pathOf(crossSection(tunnel, tunnel.length)));
		}
		g.append('path')
			.attr('class', 'start-line')
			.attr('d', pathOf(crossSection(tunnel, 0)));

		// Invisible centreline, handy for automated tests and debugging.
		const centre = tunnel.samples.map((p) => [p.x, p.y]);
		g.append('path')
			.attr('class', 'centreline')
			.attr('id', 'centreline')
			.attr('data-closed', tunnel.closed)
			.attr('d', pathOf(centre, tunnel.closed));
	}

	/** Remove the tunnel and the trace. */
	clear() {
		this.tunnelLayer.selectAll('*').remove();
		this.clearTrace();
		this.svg.classed('flash-ok flash-fail armed', false);
	}

	setArmed(armed) {
		this.svg.classed('armed', armed);
	}

	startTrace(x, y) {
		this.clearTrace();
		this.tracePoints = [[x, y]];
		this.trace = document.createElementNS(SVG_NS, 'path');
		this.trace.setAttribute('class', 'trace');
		this.traceLayer.node().appendChild(this.trace);
	}

	extendTrace(points) {
		if (!this.trace) return;
		for (const p of points) this.tracePoints.push(p);
		this.trace.setAttribute('d', pathOf(this.tracePoints));
	}

	fadeTrace() {
		if (this.trace) this.trace.classList.add('fading');
	}

	clearTrace() {
		this.traceLayer.selectAll('*').remove();
		this.trace = null;
		this.tracePoints = [];
	}

	markFailure(x, y) {
		const s = 7;
		this.traceLayer
			.append('path')
			.attr('class', 'fail-mark')
			.attr('d', `M${x - s},${y - s}L${x + s},${y + s}M${x - s},${y + s}L${x + s},${y - s}`);
	}

	flash(kind) {
		this.svg.classed('flash-ok', kind === 'ok').classed('flash-fail', kind === 'fail');
		clearTimeout(this.flashTimer);
		this.flashTimer = setTimeout(() => this.svg.classed('flash-ok flash-fail', false), 450);
	}
}
