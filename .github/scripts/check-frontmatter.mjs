#!/usr/bin/env node
/**
 * The frontmatter arms that a JSON Schema cannot express, plus the extraction
 * ajv validates.
 *
 * Each arm mirrors a failure that would otherwise surface in the docs-site
 * repository at pin-bump time, where the person who caused it is not looking:
 * the site takes a page title from the leading H1 and a meta description from
 * `scope`, and it throws on a page whose body does not open with an H1.
 *
 * Usage: node .github/scripts/check-frontmatter.mjs <outdir> [root]
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { leadingHeading, pagesUnder, readPage, FrontmatterError } from './lib/pages.mjs';

/** Every tree the schema binds. `skills/` carries a skill's own frontmatter and README.md carries none. */
const TREES = ['reference', 'guides', 'tutorials', 'concepts', 'learning'];
const ROOT_PAGES = ['AGENTS.md', 'CLAUDE.md'];

/**
 * The trees the docs site renders as routes. The band below is a meta
 * description budget, so it binds a page that becomes one and says nothing
 * about a page the site excludes from rendering.
 */
const RENDERED = ['reference/', 'guides/', 'tutorials/', 'concepts/'];

/** The site composes a title from the H1 and fails its own build over the budget. */
const MAX_HEADING = 40;

/** The meta description band the site's SEO gate holds a rendered page to. */
const SCOPE_BAND = { min: 140, max: 160 };

const [outdir, root = process.cwd()] = process.argv.slice(2);

if (outdir === undefined) {
    console.error('usage: node .github/scripts/check-frontmatter.mjs <outdir> [root]');
    process.exit(2);
}

const from = resolve(root);
const to = resolve(outdir);
const findings = [];

async function exists(path) {
    try {
        await access(join(from, path));

        return true;
    } catch {
        return false;
    }
}

const pages = [];
for (const tree of TREES) pages.push(...(await pagesUnder(from, tree)));
for (const page of ROOT_PAGES) if (await exists(page)) pages.push(page);

await mkdir(to, { recursive: true });

for (const page of pages) {
    let read;
    try {
        read = await readPage(from, page);
    } catch (error) {
        if (!(error instanceof FrontmatterError)) throw error;
        findings.push(error.message);
        continue;
    }

    await writeFile(join(to, `${page.replaceAll('/', '__').replace(/\.md$/, '')}.yml`), `${read.block}\n`);

    const heading = leadingHeading(read.body);
    if (heading === null) findings.push(`${page} body does not open with an H1`);
    else if (heading.length > MAX_HEADING) {
        findings.push(`${page} H1 is ${heading.length} characters, over ${MAX_HEADING}: ${heading}`);
    }

    const scope = read.values.get('scope');
    if (typeof scope === 'string' && RENDERED.some((tree) => page.startsWith(tree))) {
        if (scope.length < SCOPE_BAND.min || scope.length > SCOPE_BAND.max) {
            findings.push(`${page} scope is ${scope.length} characters, outside ${SCOPE_BAND.min} to ${SCOPE_BAND.max}`);
        }
    }

    for (const entry of read.values.get('depends-on') ?? []) {
        if (!(await exists(entry))) findings.push(`${page} depends-on names a page that does not exist: ${entry}`);
    }
}

console.log(`frontmatter: read ${pages.length} pages, wrote ${pages.length} frontmatter blocks for ajv`);

for (const finding of findings) console.error(`error: ${finding}`);

process.exit(findings.length === 0 ? 0 : 1);
