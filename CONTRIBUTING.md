# Contributing

Everything in `reference/` and `guides/` was checked before it was written down. The rules below are what keeps that true, and they are the ones a first-time contributor cannot guess from reading the pages.

## Every claim carries a Source line

A section states a fact and then cites it on a `Source:` line. The citation names the repository and the pinned tag or commit it was read at, with the file and line ranges, or it names the live endpoint and the request that was made. A claim with no `Source:` line does not land in `reference/` or `guides/`, however obvious it looks.

## An unchecked claim goes to learning/

If a claim has not been checked against source at a pinned tag, or against a live chain or API read, it belongs in `learning/` and nowhere else, however confident the write-up sounds. `learning/INSTRUCTIONS.md` gives the entry format and the promotion gate: what would settle the claim, and which polished file it would land in once it is settled.

## Tiers and the ledger

`validation-log.md` grades every polished page:

- `source-read`: read from the pinned contract or library source, so the fact is a property of code that does not move without a release.
- `live-chain`: confirmed by a read against a live endpoint, so the fact is a property of observed behavior.
- `both`: the page carries facts of each kind, or one fact was checked both ways.

A change that adds a page, or that changes what a page claims, updates that page's row in `validation-log.md` with the tier and the baseline the page draws from. The ledger and the pages are one artifact; a page with no row is an unfinished change.

## Pull requests

Keep a pull request to one page, or to one claim across several pages, so a reviewer can check it against its source without reconstructing which citation belongs to which sentence. The template asks for the `Source:` citation and the tier. Fill both in the body rather than in a comment: that text is what the claim is reviewed against. Pull requests are squash merged onto a linear history.

Write with the protocol's own nouns (collection, schema, template, asset, offer, sale). Headings are sentence case, and there is no em-dash anywhere in the tree.

A wrong fact with no fix attached goes to a fact-error issue rather than a pull request. The page, the quoted claim, and what you observed instead are worth more than a guessed correction.
