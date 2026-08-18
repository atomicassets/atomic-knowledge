#!/usr/bin/env node
/**
 * Composes the body of a GitHub Release from the ledger's pinned baselines.
 *
 * A `YYYY.MM.PATCH` tag says when the corpus moved and nothing else, because a
 * knowledge corpus has no API surface to break. What a reader can act on is the
 * set of releases the pages were read against: a fact here is a fact about one
 * pinned contract, indexer, or library version. The ledger is where those pins
 * live, so the Release copies them rather than keeping a second list that drifts.
 *
 * Usage: node .github/scripts/compose-release-notes.mjs <tag> [root]
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { section } from './lib/pages.mjs';

const LEDGER = 'reference/validation.md';

const [tag, root = process.cwd()] = process.argv.slice(2);

if (tag === undefined) {
    console.error('usage: node .github/scripts/compose-release-notes.mjs <tag> [root]');
    process.exit(2);
}

let source;
try {
    source = await readFile(join(resolve(root), LEDGER), 'utf8');
} catch (error) {
    console.error(`error: cannot read ${LEDGER}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
const baselines = section(source, 'Pinned baselines');

if (baselines === null) {
    console.error(`error: ${LEDGER} has no "## Pinned baselines" section`);
    process.exit(1);
}

const pins = [...baselines.matchAll(/^- .*$/gm)].map((found) => found[0]);

/**
 * A Release body naming no baseline is the failure this script exists to
 * prevent, so it fails the run rather than publishing an empty list.
 */
if (pins.length === 0) {
    console.error(`error: ${LEDGER} lists no baseline under "## Pinned baselines"`);
    process.exit(1);
}

const repository = process.env.GITHUB_REPOSITORY ?? 'atomicassets/atomic-knowledge';
const blob = `https://github.com/${repository}/blob/${tag}`;

process.stdout.write(
    [
        'The pages at this tag are read against these baselines. Each page names the ones it draws from in its own `key-modules` line.',
        '',
        ...pins,
        '',
        `What changed: [CHANGELOG.md](${blob}/CHANGELOG.md).`,
        `How each page was checked: [the provenance ledger](${blob}/${LEDGER}).`,
        '',
    ].join('\n'),
);
