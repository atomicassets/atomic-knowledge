#!/usr/bin/env node
/**
 * Writes a copy of every markdown page with its code removed, so a prose rule
 * never reads a code sample.
 *
 * Fenced blocks and inline code spans become blank space of the same shape:
 * every character goes to a space and every newline survives, so a finding in
 * the stripped copy carries the line and column of the source line it came
 * from. The corpus writes account names, ABI type names, and shell snippets in
 * code, and a prose rule that cannot tell code from prose either fails on a
 * sample or gets turned off.
 *
 * Usage: node .github/scripts/strip-code.mjs <outdir> [root]
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const SKIP = new Set(['.git', 'node_modules', '.github']);

/** Every markdown page under `root`, repository-relative, sorted. */
async function markdownFiles(root, directory = root, found = []) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory()) {
            if (SKIP.has(entry.name)) continue;
            await markdownFiles(root, join(directory, entry.name), found);
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.md')) {
            found.push(relative(root, join(directory, entry.name)));
        }
    }

    return found;
}

/** Same width, same newlines, no content. */
function blank(text) {
    return text.replaceAll(/[^\n]/g, ' ');
}

/**
 * Blanks fenced blocks first, because a fence is one opaque region: a backtick
 * inside a shell sample is not a code-span delimiter, and pairing it with a
 * later one would swallow the prose between them.
 */
function stripFences(source) {
    const lines = source.split('\n');
    let fence = null;

    return lines
        .map((line) => {
            const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line);

            if (fence === null) {
                if (opener === null) return line;
                fence = opener[1][0].repeat(opener[1].length);
                return blank(line);
            }

            const closer = new RegExp(String.raw`^ {0,3}${fence[0]}{${fence.length},}\s*$`).exec(line);
            if (closer !== null) fence = null;

            return blank(line);
        })
        .join('\n');
}

/**
 * A code span opens on a backtick run and closes on the next run of the same
 * length, which is the CommonMark rule. A run with no partner is a literal
 * backtick and stays.
 */
function stripCodeSpans(source) {
    const characters = [...source];
    const runs = [];

    for (let at = 0; at < characters.length; ) {
        if (characters[at] !== '`') {
            at += 1;
            continue;
        }
        let end = at;
        while (end < characters.length && characters[end] === '`') end += 1;
        runs.push({ start: at, length: end - at });
        at = end;
    }

    const open = new Map();
    const spans = [];

    for (const run of runs) {
        const partner = open.get(run.length);
        if (partner === undefined) {
            open.set(run.length, run);
            continue;
        }
        spans.push([partner.start, run.start + run.length]);
        open.clear();
    }

    let stripped = source;
    for (const [start, end] of spans.reverse()) {
        stripped = stripped.slice(0, start) + blank(stripped.slice(start, end)) + stripped.slice(end);
    }

    return stripped;
}

export function strip(source) {
    return stripCodeSpans(stripFences(source));
}

const [outdir, root = process.cwd()] = process.argv.slice(2);

if (outdir === undefined) {
    console.error('usage: node .github/scripts/strip-code.mjs <outdir> [root]');
    process.exit(2);
}

const from = resolve(root);
const to = resolve(outdir);

for (const page of await markdownFiles(from)) {
    const target = join(to, page);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, strip(await readFile(join(from, page), 'utf8')));
}
