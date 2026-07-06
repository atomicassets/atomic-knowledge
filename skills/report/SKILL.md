---
name: report
description: "Use when a documentation gap in this repository caused friction while building an Atomic integration: reviews the session, writes a sanitized difficulty report into the consuming project for the atomic-knowledge maintainer"
scope: Emits a sanitized difficulty report on this repository's docs, written into the consuming project rather than into atomic-knowledge itself
depends-on: []
key-modules: []
---

# Report

## When to use

Invoke this skill when a `reference/` or `guides/` file in this repository was wrong, missing, or misleading during the current session, or when the session settled on a reusable integration pattern the docs do not teach yet. Run it once the difficulty is resolved (or given up on) rather than mid-investigation, so the entry can record the actual outcome.

This skill never edits atomic-knowledge. It writes one report file into the project that vendored atomic-knowledge, for a maintainer to read later and use to fix the docs.

## Mandatory sanitization

The report leaves this session in a file that ships to an outside maintainer who has no relationship to the consuming project. Before writing:

- Strip the consuming project's name, product names, and any internal codenames. Replace with generic terms (`the app`, `the indexer`, `my_service`).
- Strip private file paths, repo names, internal hostnames, account names, wallet addresses, and API keys or other secrets.
- Keep atomic-knowledge file paths, contract action names, table names, error codes, and library versions verbatim; those are exactly what the maintainer needs.
- Re-read the finished report, header included, and remove anything that would leak what the consuming project is or does. When in doubt, cut it rather than hedge it.

If a finding cannot be described without exposing something that must stay private, drop the finding rather than write it half-sanitized.

## Steps

1. Review the conversation for every place atomic-knowledge docs caused friction: a fact that turned out false, a fact needed but absent, a fact that was true but pointed toward the wrong approach, or a design pattern the docs should have taught up front.
2. For each instance, work out which category it falls in (see below), which file and section it concerns, how confident you are, whether it got resolved and how, and roughly how many tool uses it cost before resolution.
3. Sanitize every finding per the rule above.
4. Determine the consuming project's root (the top of its own git working tree, not atomic-knowledge's). Create `.claude/atomic-knowledge/reports/` there if it does not exist, and write the report to `.claude/atomic-knowledge/reports/<short-slug>.md`, where `<short-slug>` is a kebab-case summary of the task (3-6 words) with a 4-character random hex suffix (`openssl rand -hex 2`) to avoid collisions between reports from concurrent sessions.
5. Print the file path when done. If the session hit no documentation difficulties, write nothing and say so.

## Report format

Header block, then one entry per finding, most expensive first.

```
# Atomic-knowledge difficulty report
- baseline: [contract/indexer versions or tags atomic-knowledge was pinned to, if stated in the docs you read]
- task: [one-line, project-neutral description of the integration work, e.g. "computing marketplace fee splits for a sale settlement"]
```

Each finding:

```
## [5-10 word summary of the finding]
- category: [doc-error | doc-gap | doc-misleading | design-pattern]
- file: [atomic-knowledge path(s), e.g. reference/atomicmarket/fees-and-royalties.md, or "none identifiable"]
- confidence: [verified | inferred]
- resolved: [yes, how it was resolved | no]
- cost: [tool uses spent before resolving or giving up, rounded to the nearest 5]

[Freeform body]
```

## Categories

| Category | Meaning |
| --- | --- |
| `doc-error` | The docs state something false. |
| `doc-gap` | A fact needed to proceed was absent from the docs. |
| `doc-misleading` | The docs are technically correct but led to a wrong conclusion or approach. |
| `design-pattern` | A reusable integration pattern emerged that the docs should teach but do not. |

## Fields

- **category**: exactly one of the four above; split a finding that spans two.
- **file**: the specific atomic-knowledge file and, if identifiable, section or heading. Say "none identifiable" rather than guessing.
- **confidence**: `verified` if checked against contract/indexer source or a live chain or API read; `inferred` if it is your best understanding but unconfirmed. Default to `inferred` when unsure.
- **resolved**: state the actual fix if resolved (the working code or approach is the strongest evidence). If unresolved, say what was tried.
- **cost**: tool uses (searches, reads, failed attempts) spent on this specific issue. This is the proxy for how much the gap hurt; it drives ordering, not a precision metric.

## Prioritization

Order findings by cost descending. A finding that took 30 tool uses to work around marks a worse documentation gap than one caught in a single re-read, regardless of category, so it goes first.

## Freeform body guidance

Write the body so a maintainer with no session context can act on it without asking follow-up questions.

Include:
- What the doc said (quote it) or state plainly that the fact was absent.
- What was expected based on the doc, and what actually happened (error text, chain response, indexer behavior) verbatim.
- The working pattern, if resolved: the strongest evidence a fix is correct is the code that now works.
- Contract or indexer source file and line range, if source was read to settle the question. This saves the maintainer from repeating the search.
- The workaround used, kept separate from what the doc should say instead; they are often different.

For `doc-gap` findings, name which atomic-knowledge files were checked before concluding the fact was missing. A gap found after checking one file may really be a missing cross-reference, not missing content.

Do not include:
- Vague complaints ("the docs were confusing") without the doc text and the observed behavior side by side.
- Issues that were bugs in the consuming project's own code rather than in atomic-knowledge.
- Anything the sanitization rule above requires cutting.

## Rules

- One markdown file per invocation, covering every finding from the current session (or the focus area, if the caller names one).
- Findings are additive across a project's lifetime: do not read or merge previous reports in `.claude/atomic-knowledge/reports/`, and do not deduplicate against them. The maintainer reconciles duplicates on ingest.
- Never write into the atomic-knowledge checkout itself, even if it is writable from the consuming project's workspace.
