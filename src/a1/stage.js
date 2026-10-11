/**
 * Drawing of the two targets of Assignment 1. The stage is drawn 1:1 in CSS
 * pixels, never scaled.
 *
 *   pointing  a bar of width W (the target, along the movement)
 *   crossing  a goal segment of length W (across the movement), with small
 *             end marks
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const STAGE_W = 760;
export const STAGE_H = 360;
const BAR_TOP = 40;
const BAR_HEIGHT = STAGE_H - 2 * BAR_TOP;

function el(name, attrs) {
	const node = document.createElementNS(SVG_NS, name);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
	return node;
}

export class A1Stage {
	constructor(svg) {
		this.svg = svg;
		svg.setAttribute('width', STAGE_W);
		svg.setAttribute('height', STAGE_H);
		svg.setAttribute('viewBox', `0 0 ${STAGE_W} ${STAGE_H}`);
		this.targets = [];
		this.label = null;
	}

	clear() {
		this.svg.replaceChildren();
		this.targets = [];
	}

	show(seq, color) {
		this.clear();
		this.svg.style.setProperty('--tech', color);
		for (const x of seq.targetX) {
			const g = el('g', { class: 'a1-target' });
			if (seq.technique === 'pointing') {
				g.append(el('rect', { class: 'a1-bar', x: x - seq.W / 2, y: BAR_TOP, width: seq.W, height: BAR_HEIGHT }));
			} else {
				const y0 = seq.cy - seq.W / 2;
				const y1 = seq.cy + seq.W / 2;
				g.append(
					el('line', { class: 'a1-goal', x1: x, x2: x, y1: y0, y2: y1 }),
					el('line', { class: 'a1-goal-end', x1: x - 8, x2: x + 8, y1: y0, y2: y0 }),
					el('line', { class: 'a1-goal-end', x1: x - 8, x2: x + 8, y1: y1, y2: y1 }),
				);
			}
			this.svg.append(g);
			this.targets.push(g);
		}
		this.label = el('text', { class: 'a1-start-label', x: seq.targetX[0], y: BAR_TOP - 12 });
		this.label.textContent = 'Start here';
		this.svg.append(this.label);
		this.update(seq);
	}

	update(seq) {
		this.targets.forEach((g, i) => g.classList.toggle('active', i === seq.active && !seq.done));
		if (this.label) this.label.style.display = seq.started ? 'none' : '';
	}

	flashMiss(index) {
		const g = this.targets[index];
		if (!g) return;
		g.classList.add('miss');
		setTimeout(() => g.classList.remove('miss'), 300);
	}
}
