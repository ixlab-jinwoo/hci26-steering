/**
 * Builds the whole app into one self-contained HTML file:
 *
 *   dist/hci26-steering.html   the file students download and double-click
 *   dist/index.html            the same file, published on GitHub Pages
 *
 * JavaScript (with the parts of D3 that are used) and CSS are inlined, so
 * the page needs no server and no network.
 *
 *   node scripts/build.mjs           build once
 *   node scripts/build.mjs --watch   rebuild on every change in src/
 */

import { context } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const env = process.env;

function git(args) {
	try {
		return execSync('git ' + args, { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

const commit = env.GITHUB_SHA || git('rev-parse HEAD');
const version = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : git('describe --tags --always --dirty') || 'dev';

const NOTICE = `<!--
  HCI 2026 pointing, crossing and steering assignments, version ${version}.
  MIT license, see https://github.com/ixlab-jinwoo/hci26-steering.
  Includes D3 (https://d3js.org), Copyright 2010-2023 Mike Bostock, ISC license:
  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted, provided that the above
  copyright notice and this permission notice appear in all copies.
-->`;

function assemble(js) {
	const template = readFileSync('src/index.html', 'utf8');
	const css = readFileSync('src/styles.css', 'utf8');
	// A literal "</script" inside the bundle would end the inline script early.
	const safeJs = js.replace(/<\/script/gi, '<\\/script');
	const html = template
		.replace('<!--NOTICE-->', () => NOTICE)
		.replace('<!--STYLE-->', () => `<style>\n${css}</style>`)
		.replace('<!--SCRIPT-->', () => `<script>\n${safeJs}</script>`);
	mkdirSync('dist', { recursive: true });
	writeFileSync('dist/hci26-steering.html', html);
	writeFileSync('dist/index.html', html);
	console.log(`dist/hci26-steering.html: ${version}, ${(html.length / 1024).toFixed(0)} KB`);
}

const ctx = await context({
	entryPoints: ['src/main.js'],
	bundle: true,
	format: 'iife',
	minify: true,
	target: ['es2020'],
	write: false,
	legalComments: 'none',
	define: {
		__APP_VERSION__: JSON.stringify(version),
		__APP_COMMIT__: JSON.stringify(commit),
	},
	plugins: [
		{
			name: 'inline-html',
			setup(build) {
				build.onEnd((result) => {
					if (result.errors.length) return;
					assemble(result.outputFiles[0].text);
				});
			},
		},
	],
});

if (watch) {
	await ctx.watch();
	console.log('Watching src/ for changes…');
} else {
	await ctx.rebuild();
	await ctx.dispose();
}
