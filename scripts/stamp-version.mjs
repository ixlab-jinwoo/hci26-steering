/**
 * Writes version.json next to index.html. The page stores this version with
 * every recorded trial, so data can be traced back to the code that produced
 * it. In GitHub Actions the tag (or commit) of the run is used; locally the
 * output of `git describe`.
 *
 *   node scripts/stamp-version.mjs [output path]
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'version.json';
const env = process.env;

function git(args) {
	try {
		return execSync('git ' + args, { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return null;
	}
}

const commit = env.GITHUB_SHA || git('rev-parse HEAD');
const version = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : git('describe --tags --always --dirty') || 'dev';

writeFileSync(out, JSON.stringify({ version, commit, built: new Date().toISOString() }, null, 2) + '\n');
console.log(`${out}: ${version}` + (commit ? ` (${commit.slice(0, 7)})` : ''));
