/** Facts about the screen and browser, recorded with every session. */

export function environment() {
	const ua = navigator.userAgent;
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\//.test(ua)
			? 'Firefox'
			: /Chrome\//.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: 'Other';
	return {
		viewportW: window.innerWidth,
		viewportH: window.innerHeight,
		screenW: window.screen ? window.screen.width : null,
		screenH: window.screen ? window.screen.height : null,
		dpr: window.devicePixelRatio || 1,
		browser,
	};
}

export function newSessionId() {
	const rand = Math.random().toString(36).slice(2, 8);
	return (
		new Date()
			.toISOString()
			.replace(/[-:.TZ]/g, '')
			.slice(0, 14) +
		'-' +
		rand
	);
}
