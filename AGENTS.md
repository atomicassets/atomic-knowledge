---
scope: Outcome-to-file routing for agents working in this repository, plus the version pins a fact has to be re-checked against
depends-on: []
key-modules: []
---

# AGENTS.md

Start here. Find the outcome you are working toward below, read the file on that row in full, then come back for the next one. See README.md for what this repository covers and how its facts were validated.

## Routing table

| To do this | Read |
| --- | --- |
| Go from an empty testnet account to a minted asset, one step at a time | `tutorials/first-collection.md` |
| Clone runnable code for a read, a mint, or a listing | `tutorials/starters.md` |
| Weigh AtomicAssets against the single-token standard on an EVM chain | `concepts/compared-with-erc721.md` |
| Choose between a chain table read and the hosted API before writing the reader | `concepts/reading-atomic-data.md` |
| Read assets, sales, and collections over HTTP, with no key and no account | `guides/querying-the-api.md` |
| Look up one hosted-API endpoint: pagination caps, lifecycle states, rate limits, the two sales routes | `reference/api.md` |
| Classify a chain RPC error, and tell a missing account apart from a broken node | `reference/chain.md` |
| Read asset data and build AtomicAssets actions from JavaScript or TypeScript | `reference/sdk/atomicassets.md` |
| Read market data and compose AtomicMarket flows from JavaScript or TypeScript | `reference/sdk/atomicmarket.md` |
| Read a table or check an authority through the client library, or migrate off eosjs | `reference/wharfkit.md` |
| Subscribe to live asset, sale, and auction events over Socket.IO | `reference/api-streaming.md` |
| Show an asset's image or video from what the chain actually stores | `reference/media.md` |
| Say what the chain guarantees about an owner, and what it does not guarantee about media | `concepts/ownership-on-chain.md` |
| Sign anything: build the session, pick the chain, install the signer | `guides/signing.md` |
| Mint an asset on testnet, from collection and schema through transfer and burn | `guides/asset-lifecycle.md` |
| Work out why the data is split across four levels, and what a level below inherits | `concepts/four-level-model.md` |
| Work out what a collection, a schema, a template, and an asset each own | `reference/atomicassets/structure.md` |
| Look up one AtomicAssets action: parameters, authorization, RAM payer, V2 changes | `reference/atomicassets/actions.md` |
| Read or index one AtomicAssets table row | `reference/atomicassets/tables.md` |
| Choose an attribute type, or find out why a value was rejected | `reference/atomicassets/custom-types.md` |
| Decode an attribute blob read straight from a chain table | `reference/atomicassets/serialization.md` |
| Decide which layer an attribute value comes from when template and asset disagree | `reference/atomicassets/data-precedence.md` |
| Find out whether a chain runs V2 yet, and what V2 added | `reference/atomicassets/v2-upgrade.md` |
| Handle a token-backed asset minted before backing was deprecated | `reference/atomicassets/backing-tokens.md` |
| List an asset for sale and settle the purchase, oracle-priced sales included | `guides/sales.md` |
| Run an auction from announce through claim | `guides/auctions.md` |
| Offer to buy an asset nobody has listed, or accept such an offer | `guides/buyoffers.md` |
| Swap assets with another account without going through the market | `guides/offers.md` |
| Fund a buyer's balance, or find out why a payout is still parked | `guides/deposits.md` |
| Say why a resale royalty is paid at settlement rather than requested of a storefront | `concepts/royalties.md` |
| Work out what a settlement actually pays: fee stack, royalty splits, the dust rule | `reference/atomicmarket/fees-and-royalties.md` |
| Look up one AtomicMarket action | `reference/atomicmarket/actions.md` |
| Read or index one AtomicMarket table row | `reference/atomicmarket/tables.md` |
| Find what V2 changed on the market, bundle retirement and the guards included | `reference/atomicmarket/v2-changes.md` |
| Work out why every listing lands in one contract, and how a storefront still earns | `concepts/one-order-book.md` |
| Run a storefront that earns maker and taker fees | `reference/atomicmarket/marketplaces.md` |
| Size RAM for a busy marketplace, and find out who pays for which row | `reference/atomicmarket/ram.md` |
| Hand assets to someone who has no account yet, through a claim link | `guides/links.md` |
| Look up one AtomicTools action | `reference/atomictools/actions.md` |
| Read the claim-link tables | `reference/atomictools/tables.md` |
| React to contract notifications from a contract of your own | `guides/notification-integration.md` |
| Find which action notifies which account, and what a handler may assume | `reference/atomicassets/notifications.md` |
| Test contract logic in-process before spending a testnet deploy | `guides/testing-with-vert.md` |
| Build and deploy a contract release: ABI artifacts, setcode resources, permissions | `reference/contract-releases.md` |
| Run or extend the atomicassets-api indexer | `reference/atomicassets-api.md` |

## Working in this repository

Read the routed file in full rather than searching it. The facts there encode behavior no method signature carries: which account is billed for a row, which read answers with a null instead of an error, which flag lets a transaction commit while delivering nothing.

Take each section at face value and do not extrapolate past what it states. A page says what was checked, and what it does not say was not checked. `validation-log.md` records how every page was validated and against what. It grades `reference/` and `guides/` only: a tutorial's claim is that its steps run, and a concepts page restates facts the pages it links already carry, so neither takes a row there.

Re-check any fact that names a version when that dependency moves. The two SDK pages are pinned to `@atomichub/atomicassets` 2.1.1, read at tag `v2.1.1`, and `@atomichub/atomicmarket` 2.4.1, read at tag `v2.4.1`; the client-library page is pinned to `@wharfkit/antelope` 1.1.1, and the AtomicAssets and AtomicMarket contract pages to `v2.0.0-rc4` and `v2.0.0-rc2`. A fact read at one of those pins is a fact about that release, not about the package name.

Two skills sit beside these pages. `skills/atomic-integration/SKILL.md` carries the procedures a routing table cannot: the mint flow, the market composers, and the network choice. `skills/report/SKILL.md` writes a difficulty report when a page here turned out wrong, missing, or misleading, in the field shape this repository's issue forms accept.
