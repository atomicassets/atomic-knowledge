---
scope: Domain-to-file routing table and entry point for agents working in this repository
depends-on: []
key-modules: []
---

# AGENTS.md

Start here. Identify the domain the task touches, then read the matching file below in full; see README.md for what this repository covers and how facts are validated.

## Routing table

| Working on | Read |
| --- | --- |
| AtomicMarket fee model: maker/taker fees, collection fee timing, royalty splits, bonus fees | `reference/atomicmarket/fees-and-royalties.md` |
| AtomicMarket marketplaces: registration, name constraints, maker/taker attribution, fee collection | `reference/atomicmarket/marketplaces.md` |
| AtomicMarket RAM: who pays for which row, `pay*ram` actions, sizing for high-volume marketplaces | `reference/atomicmarket/ram.md` |
| AtomicMarket action reference: every action, parameters, RAM payer, "Changed in V2" notes | `reference/atomicmarket/actions.md` |
| AtomicMarket tables (schema, scopes, indexes) | `reference/atomicmarket/tables.md` |
| AtomicMarket V2 behavior changes and defensive guards: bundle retirement, execution-time fees, trace-only royalty logs, guards | `reference/atomicmarket/v2-changes.md` |
| AtomicAssets data model: collections, schemas, templates, assets | `reference/atomicassets/structure.md` |
| AtomicAssets action reference: every action, parameters, auth, notifications, RAM payer, "Changed in V2" notes | `reference/atomicassets/actions.md` |
| AtomicAssets tables (schema, scopes, indexes) | `reference/atomicassets/tables.md` |
| AtomicAssets attribute type system: FORMAT, ATOMIC_ATTRIBUTE, ATTRIBUTE_MAP | `reference/atomicassets/custom-types.md` |
| AtomicAssets attribute serialization: binary encoding of collection/template/asset data | `reference/atomicassets/serialization.md` |
| AtomicAssets attribute data precedence: template vs asset immutable vs asset mutable data | `reference/atomicassets/data-precedence.md` |
| AtomicAssets notifications: collection notify accounts, require_recipient targets per action | `reference/atomicassets/notifications.md` |
| AtomicAssets backing tokens: deposit/backasset flow, balances table, burnasset recovery | `reference/atomicassets/backing-tokens.md` |
| AtomicAssets V2 upgrade and indexer/chain compatibility | `reference/atomicassets/v2-upgrade.md` |
| Calling atomicassets-api HTTP endpoints: pagination limits, buyoffer lifecycle states | `reference/api.md` |
| Running or extending the atomicassets-api indexer (also known as eosio-contract-api): handler configuration, drain gating, data freshness, migrations, CI | `reference/atomicassets-api.md` |
| Building or deploying contract releases: ABI artifacts, setcode resource needs, deploy permissions | `reference/contract-releases.md` |
| @wharfkit/antelope client behavior: table reads, authority checks, show_payer, eosjs migration | `reference/wharfkit.md` |
| Chain RPC error semantics: account-not-found and error classification | `reference/chain.md` |
| AtomicAssets creator flow end to end: create collection, schema, template, mint, transfer, burn | `guides/asset-lifecycle.md` |
| AtomicAssets offers: two-sided trade offers, accept, decline, cancel | `guides/offers.md` |
| AtomicMarket sales end to end: announce, purchase, cancel, Delphi-priced sales | `guides/sales.md` |
| AtomicMarket auctions end to end: announce, bid, claim, cancel | `guides/auctions.md` |
| AtomicMarket buyoffers and template buyoffers: create, accept, decline, cancel | `guides/buyoffers.md` |
| AtomicMarket deposits: balances, deposit and withdraw, which actions consume balance | `guides/deposits.md` |
| Querying the API and reading chain tables end to end | `guides/querying-the-api.md` |

## How to use this repo as an agent

- Look up the domain file above before coding against a contract, the indexer, or the API: the facts there encode behavior you cannot guess from method signatures.
- Each fact stands alone; take a section at face value and do not extrapolate beyond what it states.
- When a fact names a specific library version (for example @wharfkit/antelope 1.1.1), re-check that fact when the dependency is upgraded.
