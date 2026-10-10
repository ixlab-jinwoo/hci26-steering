/** Descriptive statistics and least-squares fits. Pure functions. */

export function mean(xs) {
	if (!xs.length) return NaN;
	let sum = 0;
	for (const x of xs) sum += x;
	return sum / xs.length;
}

/** Sample standard deviation (n − 1). */
export function sd(xs) {
	if (xs.length < 2) return 0;
	const m = mean(xs);
	let sum = 0;
	for (const x of xs) sum += (x - m) ** 2;
	return Math.sqrt(sum / (xs.length - 1));
}

/** Least-squares fit y = a + b·x. Returns null for fewer than 2 distinct x. */
export function linearFit(xs, ys) {
	const n = xs.length;
	if (n < 2) return null;
	const mx = mean(xs);
	const my = mean(ys);
	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		sxx += (xs[i] - mx) ** 2;
		sxy += (xs[i] - mx) * (ys[i] - my);
		syy += (ys[i] - my) ** 2;
	}
	if (sxx === 0) return null;
	const b = sxy / sxx;
	return { a: my - b * mx, b, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy), n };
}

// Two-sided 95 % quantiles of Student's t for 1–30 degrees of freedom.
const T95 = [
	12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
	2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function t95(df) {
	if (df < 1) return NaN;
	if (df <= 30) return T95[df - 1];
	if (df <= 40) return 2.021;
	if (df <= 60) return 2.0;
	if (df <= 120) return 1.98;
	return 1.96;
}

/** Mean with its 95 % confidence interval half-width (t distribution). */
export function meanCI(xs) {
	const n = xs.length;
	const m = mean(xs);
	const half = n > 1 ? (t95(n - 1) * sd(xs)) / Math.sqrt(n) : NaN;
	return { mean: m, half, lo: m - half, hi: m + half, n };
}

/** Drop values further than k standard deviations from the mean (n ≥ 4). */
export function withoutOutliers(items, value, k = 3) {
	if (items.length < 4) return items;
	const vs = items.map(value);
	const m = mean(vs);
	const s = sd(vs);
	if (s === 0) return items;
	return items.filter((it) => Math.abs(value(it) - m) <= k * s);
}

export function groupBy(items, key) {
	const map = new Map();
	for (const it of items) {
		const k = key(it);
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(it);
	}
	return map;
}
