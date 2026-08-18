# Changelog

What each release of this corpus changed, one release per tag. `Corrected` comes first in every release, because a fact that was wrong is what a returning reader has to see before anything else. The other sections are `Added`, `Revalidated`, and `Removed`, in that order, and a section with nothing in it is left out.

## 2026.08.3

### Corrected

- `reference/api.md` and `reference/api-streaming.md` say the template-buyoffer socket handler is wired: at the pinned 2.2.0 tag `new_template_buyoffer` broadcasts on `lognewtbuyo`, where both pages previously recorded the handler as defined but never called.
- `reference/atomicassets/tables.md` records that the `mediatype`/`info` synthesis is live on both hosted deployments, which now report 2.2.0 on `/health`, replacing the note that pinned mainnet to the pre-2.0 behavior.

### Revalidated

- The atomicassets-api baseline moves from an untagged main-branch state to tag `2.2.0`: of the twenty-one cited files, fifteen are byte-identical to the old pin and the rest change nothing cited except the socket wiring above; both line-range citations into the repo still point at byte-identical content.

## 2026.08.2

### Revalidated

- `reference/wharfkit.md` reads at `@wharfkit/antelope` 1.2.0: the only source change since 1.1.1 is `send_transaction2` exception handling, and every fact on the page holds unchanged.

## 2026.08.1

### Corrected

- `reference/atomicassets/actions.md` states the GA acceptance boundary for `acceptauswap`: the boundary second is accepted, and the note about a source comment the GA release fixed is gone.
- `reference/atomicassets/tables.md` marks `acceptance_date` as the second at or after which `acceptauswap` is callable.
- `reference/atomicassets/actions.md` and `reference/atomicassets/tables.md` cite `internal_create_template` at its real bounds, which the previous citation missed on both ends.

### Added

- `reference/atomicassets/v2-upgrade.md` records that both testnets run the GA build byte for byte: the live `get_code_hash` equals the `v2.0.0` Release checksum.

### Revalidated

- Every page pinned to a contract release candidate now reads at the GA `v2.0.0` tags: `atomicmarket-contract` `v2.0.0` is the same commit as `v2.0.0-rc2`, and every `atomicassets-contract` citation was re-anchored and re-verified across the GA diff.

## 2026.08.0

### Corrected

- `reference/sdk/atomicassets.md` no longer says that constructing an `ExplorerApi` fires a `/v1/config` request: construction starts no request, and the action surface is a getter that resolves on first use.
- `reference/sdk/atomicassets.md` no longer says that `transfer` remaps its account parameters. The signature takes `from` and `to`, so there is nothing to remap.
- `reference/sdk/atomicmarket.md` no longer says the action layer covers the royalty configuration alone. It covers the sale, auction, buyoffer, template-buyoffer, marketplace, balance, royalty, and RAM families, with five composers over them.
- `reference/sdk/atomicmarket.md` and `reference/api.md` say the mainnet royalty route answers 416 rather than 404, which inverts the guard advice: `getRoyaltyConfig` maps 416 to `null`, so a caller matching on `ApiError` sees a silent `null` instead.
- `reference/api.md` names both sales list routes the hosted deployment answers on, because the served OpenAPI document describes only the newer one and a generated client disagrees with a hand-written one about which exists.
- `reference/sdk/atomicmarket.md` samples `getConfig` from a deployment that runs V2, because the mainnet value it carried belongs to a chain with no royalty layer at all.
- `reference/atomicassets/structure.md` describes an asset as the individually owned item at the bottom of the four-level model, which reserves the fungible vocabulary for the balances the contract holds.
- `reference/atomicassets/structure.md` and `reference/atomicmarket/fees-and-royalties.md` point their three dead cross-references at something a reader can reach.
- `guides/deposits.md`, `guides/links.md`, `guides/sales.md`, and `reference/atomicassets/backing-tokens.md` write `account` when the holder of an asset or a balance is an account, rather than naming the signing software in front of it.
- Thirty-one `scope` lines across `reference/` and `guides/` moved into the 140 to 160 character band the site renders as a meta description, and twenty more write the product name as a proper noun or mark the account name as code.
- `guides/asset-lifecycle.md` is titled with the query it answers rather than with its category, and three headings across `guides/links.md`, `reference/sdk/atomicassets.md`, and `reference/sdk/atomicmarket.md` write the product name the way the product spells it.
- `reference/validation.md` lists `@wharfkit/antelope` 1.1.1 among the pinned baselines, a source its own row for `reference/wharfkit.md` already named.

### Added

- `tutorials/first-collection.md` walks an empty WAX testnet account to a minted asset, with a checkpoint after every step and an appendix for each way a step fails.
- `tutorials/starters.md` names each starter, what it does, and whether it needs a key.
- `concepts/` explains why the protocol is shaped the way it is, one page each for the four-level model, ownership as chain state, the single order book, royalties as settlement math, choosing a read path, and the comparison against the single-token standard on an EVM chain.
- `starters/` carries five directories a reader clones and runs whole. `read-assets` and `storefront-read` need no key; `create-collection`, `mint-asset`, and `list-a-sale` sign on WAX testnet.
- `guides/signing.md` builds the session every write snippet in this corpus opens against, with one chain id per chain read from a running node.
- `guides/asset-lifecycle.md` shows the same mint built through the SDK builder beside the hand-written payload, and names the numeric guards that throw at the call instead of on chain.
- `guides/sales.md`, `guides/auctions.md`, and `guides/buyoffers.md` name the composer behind each multi-action flow, its memo literals, the two bundle opt-outs, and what a settlement quantity has to be.
- `guides/querying-the-api.md` raises percent-encoding and the testnet host pair out of its preamble into sections of their own.
- `reference/sdk/atomicassets.md` and `reference/sdk/atomicmarket.md` carry their read and action surfaces as tables, with the path-segment guard, the numeric ABI-type guards, the settlement helpers, and the royalty payout ledger the shipped releases added.
- `guides/auctions.md`, `guides/sales.md`, `reference/atomicassets/structure.md`, and `reference/atomicmarket/fees-and-royalties.md` open on a diagram of the sequence their prose states worst.
- `reference/validation.md` carries the provenance ledger, which moved out of the repository root so it renders beside the pages it grades.
- `AGENTS.md` routes by the outcome an agent arrives with, one row per outcome, and names the pins a version-sensitive fact has to be re-checked against.
- `skills/atomic-integration/SKILL.md` carries the mint procedure, the market composers, and the network choice instead of one indirection, and `skills/report/SKILL.md` opens a report with the fields the issue forms accept.
- `.github/frontmatter.schema.json` states the three frontmatter keys a page may carry, and `.github/workflows/checks.yml` gates a merge on ten checks a reviewer cannot run by eye, among them a fragment with no matching heading, a description outside the band the site renders it into, and a ledger row for a page that no longer exists.
- `reference/atomicassets/tables.md` and `reference/atomicassets/actions.md` state that no action decrements a template's `issued_supply`, `burnasset` included, so the field counts lifetime mints and a circulating supply has to subtract burns.
- `reference/atomicmarket/fees-and-royalties.md` states that no per-listing guard caps a seller's exposure to the execution-time collection fee, because `assertsale` takes no fee parameter.
- `reference/atomicassets/actions.md` and `reference/atomicmarket/ram.md` pin the two RAM byte costs a caller pays: 112 bytes for the table scope a first transfer creates, and 121 + 16N bytes for a market balances row holding N token symbols, both computed from a pinned `AntelopeIO/leap` baseline and observed on WAX mainnet.

### Revalidated

- `guides/asset-lifecycle.md`, `guides/auctions.md`, `guides/buyoffers.md`, and `guides/sales.md` were re-read at `@atomichub/atomicassets` 2.1.1 and `@atomichub/atomicmarket` 2.4.1. Every builder and helper they cite is byte-identical to the tag before it, so only the pins moved.

### Removed

- `CLAUDE.md` drops the six lines that restated `AGENTS.md` and keeps the pointer to it.
