/**
 * Code version, written into the bundle by scripts/build.mjs. Every exported
 * record carries it, so data can be traced back to the code that made it.
 */

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';

export function versionLabel() {
	return COMMIT && !VERSION.includes(COMMIT.slice(0, 7)) ? `${VERSION} (${COMMIT.slice(0, 7)})` : VERSION;
}
