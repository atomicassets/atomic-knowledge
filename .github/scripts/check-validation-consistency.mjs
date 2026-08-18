#!/usr/bin/env node
/**
 * Holds the provenance ledger and the pages to each other. This is the check
 * nobody downstream can run: a consumer of this corpus sees a page and a tier,
 * and cannot tell that the tier belongs to a page that no longer exists or that
 * a page was never graded at all.
 *
 * Three arms:
 *   - a reference or guides page with no row in the ledger,
 *   - a ledger row naming a page that does not exist,
 *   - a page whose `key-modules` names a baseline the ledger does not pin.
 *
 * Usage: node .github/scripts/check-validation-consistency.mjs [root]
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pagesUnder, readPage } from './lib/pages.mjs';

/** The trees the ledger grades. Tutorials and concepts carry no tier by design. */
const GRADED = ['reference', 'guides'];

/** Every tree that carries `key-modules`, so a new one is covered when it lands. */
const PINNED = ['reference', 'guides', 'tutorials', 'concepts'];

/** The ledger's own path. It sits in a graded tree and takes no row of its own. */
const LEDGER = 'reference/validation.md';

const root = resolve(process.argv[2] ?? process.cwd());

/** The body of one `## ` section, by its exact heading text. */
function section(source, heading) {
    const pattern = new RegExp(String.raw`^## ${heading}\s*$([\s\S]*?)(?=^## |\Z)`, 'm');
    const found = pattern.exec(source);

    return found === null ? null : found[1];
}

async function readLedger() {
    try {
        return { path: LEDGER, source: await readFile(join(root, LEDGER), 'utf8') };
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    return null;
}

const ledger = await readLedger();
const findings = [];

if (ledger === null) {
    console.error(`error: no provenance ledger at ${LEDGER}`);
    process.exit(1);
}

const baselinesSection = section(ledger.source, 'Pinned baselines');
const pagesSection = section(ledger.source, 'Pages');

if (baselinesSection === null) findings.push(`${ledger.path} has no "## Pinned baselines" section`);
if (pagesSection === null) findings.push(`${ledger.path} has no "## Pages" section`);

/**
 * A pin rather than a name: a version, a commit, or a branch. One bullet can
 * pin two baselines at once, so every backticked token on a bullet line is a
 * candidate and the pins are what gets dropped.
 */
function isPin(token) {
    return /^v?\d/.test(token) || /^[0-9a-f]{7,40}$/.test(token) || token === 'main';
}

const baselines = [...(baselinesSection ?? '').matchAll(/^- .*$/gm)]
    .flatMap((line) => [...line[0].matchAll(/`([^`]+)`/g)].map((found) => found[1]))
    .filter((token) => !isPin(token));

/** The first cell of each table row is the page the row grades. */
const rows = new Map();
for (const found of (pagesSection ?? '').matchAll(/^\| *`([^`]+)` *\|/gm)) {
    rows.set(found[1], (rows.get(found[1]) ?? 0) + 1);
}

const graded = [];
for (const tree of GRADED) graded.push(...(await pagesUnder(root, tree)));

for (const page of graded) {
    if (page === ledger.path) continue;
    if (!rows.has(page)) findings.push(`${page} has no row in ${ledger.path}`);
}

for (const [page, count] of rows) {
    if (!graded.includes(page)) findings.push(`${ledger.path} grades a page that does not exist: ${page}`);
    if (count > 1) findings.push(`${ledger.path} grades ${page} in ${count} rows`);
}

const pinned = [];
for (const tree of PINNED) pinned.push(...(await pagesUnder(root, tree)));

for (const page of pinned) {
    if (page === ledger.path) continue;
    const { values } = await readPage(root, page);

    for (const entry of values.get('key-modules') ?? []) {
        if (baselines.some((baseline) => entry.includes(baseline))) continue;
        findings.push(`${page} key-modules names a baseline ${ledger.path} does not pin: ${entry}`);
    }
}

console.log(
    `validation-consistency: ${graded.length} graded pages, ${rows.size} ledger rows, ${baselines.length} pinned baselines`,
);

for (const finding of findings) console.error(`error: ${finding}`);

process.exit(findings.length === 0 ? 0 : 1);
