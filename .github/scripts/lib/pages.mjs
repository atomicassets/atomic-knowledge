/**
 * Reads the frontmatter block every page in this corpus carries, walks the page
 * trees the checks run over, and cuts a named section out of a page.
 *
 * The reader covers the shapes `.github/frontmatter.schema.json` admits and
 * nothing else: a scalar, a flow sequence, and a block sequence, each of
 * strings. Anything else throws by name and line rather than parsing to
 * something plausible, because a check that silently reads a shape it does not
 * understand reports green on a page it never looked at. The schema itself is
 * validated by ajv, which is a real YAML and JSON Schema implementation; this
 * reader serves the arms ajv cannot express.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const KEY = /^([A-Za-z][\w-]*):[ \t]*(.*)$/;
const ITEM = /^[ \t]+-[ \t]+(.*)$/;

/** Strips one layer of matching quotes, which is all YAML needs here. */
function unquote(value) {
    const trimmed = value.trim();
    const quote = trimmed.slice(0, 1);

    if ((quote === '"' || quote === "'") && trimmed.length > 1 && trimmed.endsWith(quote)) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

/** Splits a flow sequence on the commas that sit outside a quoted item. */
function splitFlow(body) {
    const items = [];
    let item = '';
    let quote = null;

    for (const character of body) {
        if (quote !== null) {
            if (character === quote) quote = null;
            item += character;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            item += character;
            continue;
        }
        if (character === ',') {
            items.push(item);
            item = '';
            continue;
        }
        item += character;
    }
    items.push(item);

    return items.map(unquote).filter((entry) => entry !== '');
}

export class FrontmatterError extends Error {}

/**
 * Returns the frontmatter as a map, the raw block for ajv, and the body that
 * follows it. A page with no block throws: the site reads `scope` off every
 * page it renders, so an absent block is a failed sync rather than a default.
 */
export function readFrontmatter(source, file) {
    const lines = source.split('\n');

    if (lines[0] !== '---') throw new FrontmatterError(`${file}:1 no frontmatter block`);

    const close = lines.indexOf('---', 1);
    if (close === -1) throw new FrontmatterError(`${file}:1 frontmatter block is never closed`);

    const block = lines.slice(1, close);
    const values = new Map();
    let current = null;

    for (const [offset, line] of block.entries()) {
        const at = `${file}:${offset + 2}`;
        if (line.trim() === '') continue;

        const item = ITEM.exec(line);
        if (item !== null) {
            if (current === null) throw new FrontmatterError(`${at} list item before any key`);
            const list = values.get(current);
            if (!Array.isArray(list)) throw new FrontmatterError(`${at} list item under a scalar key`);
            list.push(unquote(item[1]));
            continue;
        }

        const key = KEY.exec(line);
        if (key === null) throw new FrontmatterError(`${at} unreadable frontmatter line: ${line}`);

        const [, name, rest] = key;
        current = name;

        if (rest === '') {
            values.set(name, []);
            continue;
        }
        if (rest.startsWith('[')) {
            if (!rest.endsWith(']')) throw new FrontmatterError(`${at} flow sequence is never closed`);
            values.set(name, splitFlow(rest.slice(1, -1)));
            continue;
        }
        values.set(name, unquote(rest));
    }

    return { values, block: block.join('\n'), body: lines.slice(close + 1), bodyOffset: close + 2 };
}

/** The leading H1 of a body, or null when the body does not open with one. */
export function leadingHeading(body) {
    for (const line of body) {
        if (line.trim() === '') continue;
        const heading = /^# +(.*?)\s*$/.exec(line);

        return heading === null ? null : heading[1];
    }

    return null;
}

/**
 * The body of one `## ` section, by its exact heading text, or null when the
 * page has no such heading. The section runs to the next `## ` line or to the
 * end of the page, which is what lets a caller read the last section of a file
 * as well as one in the middle.
 */
export function section(source, heading) {
    const lines = source.split('\n');
    const start = lines.findIndex((line) => line.trimEnd() === `## ${heading}`);

    if (start === -1) return null;

    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith('## '));

    return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** Every markdown page under `directory`, repository-relative, sorted. */
export async function pagesUnder(root, directory, found = []) {
    let entries;
    try {
        entries = await readdir(join(root, directory), { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return found;
        throw error;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await pagesUnder(root, path, found);
        else if (entry.isFile() && entry.name.endsWith('.md')) found.push(relative('.', path));
    }

    return found;
}

/** The frontmatter of one page, with the page path carried for the message. */
export async function readPage(root, page) {
    return readFrontmatter(await readFile(join(root, page), 'utf8'), page);
}
