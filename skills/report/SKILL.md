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
2. For each instance, fill every field below: the category, the page and section, the claim quoted as the page writes it, what was observed instead, the chain and endpoint it was observed on, the version it was observed against, the confidence, whether it got resolved and how, and roughly how many tool uses it cost before resolution.
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
- page: [atomic-knowledge path(s), e.g. reference/atomicmarket/fees-and-royalties.md, or "none identifiable"]
- claim: [the sentence as the page writes it, quoted; for a gap, the fact the pages had to state]
- observed: [the chain response, error text, or API payload that settled it, verbatim]
- chain: [chain and endpoint, e.g. WAX mainnet through wax.greymass.com]
- contract-version: [the contract, indexer, or library version the observation was made against, or "unknown"]
- confidence: [verified | inferred]
- resolved: [yes, how it was resolved | no]
- cost: [tool uses spent before resolving or giving up, rounded to the nearest 5]

[Freeform body]
```

The five fields from `page` through `contract-version` are the atomic-knowledge issue forms, field for field, so a maintainer opens an issue by pasting one finding across rather than re-deriving it. The `category` picks the form: a `doc-error` or `doc-misleading` finding fills the fact-error form; a `doc-gap` or `design-pattern` finding fills the missing-fact form. The last three fields have no form field and stay in the report.

## Categories

| Category | Meaning |
| --- | --- |
| `doc-error` | The docs state something false. |
| `doc-gap` | A fact needed to proceed was absent from the docs. |
| `doc-misleading` | The docs are technically correct but led to a wrong conclusion or approach. |
| `design-pattern` | A reusable integration pattern emerged that the docs should teach but do not. |

## Fields

| Field | What it holds |
| --- | --- |
| `category` | Exactly one of the four above. Split a finding that spans two. |
| `page` | The specific atomic-knowledge file and, where identifiable, the section or heading. For a `doc-gap`, every page that was read before concluding the fact was missing, because a fact present on one page and absent from the page the task started at is a missing cross-reference rather than missing content. Say "none identifiable" rather than guessing. |
| `claim` | The sentence as the page writes it, quoted rather than paraphrased. For a `doc-gap` or a `design-pattern`, the fact or pattern the pages had to state for the task to proceed. |
| `observed` | The chain response, error text, or API payload that settled the question, verbatim, with the contract or indexer source file and line range if source was read to settle it. |
| `chain` | The chain and the endpoint the observation came from, for example WAX mainnet through `wax.greymass.com`. |
| `contract-version` | The contract, indexer, or library version the observation was made against. Say "unknown" rather than guessing; the form treats it as optional. |
| `confidence` | `verified` if checked against contract or indexer source or a live chain or API read, `inferred` if it is a best understanding and unconfirmed. Default to `inferred` when unsure. |
| `resolved` | The actual fix if resolved, since the working code or approach is the strongest evidence. If unresolved, what was tried. |
| `cost` | Tool uses (searches, reads, failed attempts) spent on this specific issue. This is the proxy for how much the gap hurt; it drives ordering and is not a precision metric. |

## Prioritization

Order findings by cost descending. A finding that took 30 tool uses to work around marks a worse documentation gap than one caught in a single re-read, regardless of category, so it goes first.

## Freeform body guidance

Write the body so a maintainer with no session context can act on it without asking follow-up questions. The fields above already carry the quoted claim and the observation, so the body carries what they cannot:

- What was expected from the page, and why the observed behavior contradicts it rather than merely differing from it.
- The working pattern, if resolved: the strongest evidence a fix is correct is the code that now works.
- The workaround used, kept separate from what the page should say instead; they are often different.
- Where the fact belongs, if the page it was looked for on is not the page it should live on.

Do not include:
- Vague complaints ("the docs were confusing") without the doc text and the observed behavior side by side.
- Issues that were bugs in the consuming project's own code rather than in atomic-knowledge.
- Anything the sanitization rule above requires cutting.

## Rules

- One markdown file per invocation, covering every finding from the current session (or the focus area, if the caller names one).
- Findings are additive across a project's lifetime: do not read or merge previous reports in `.claude/atomic-knowledge/reports/`, and do not deduplicate against them. The maintainer reconciles duplicates on ingest.
- Never write into the atomic-knowledge checkout itself, even if it is writable from the consuming project's workspace.
