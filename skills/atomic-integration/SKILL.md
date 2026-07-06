---
name: atomic-integration
description: Use when building or debugging an integration with AtomicAssets/AtomicMarket contracts, the atomicassets-api indexer, or WAX chain reads: routes to validated reference knowledge
---

# Atomic integration

## When to use

Use this skill whenever the task touches the Atomic NFT ecosystem on WAX/Antelope chains: listing or trading through the AtomicMarket contract, reading AtomicAssets state, calling atomicassets-api endpoints, running or extending the atomicassets-api indexer, deploying contract releases, or reading chain tables and accounts through @wharfkit/antelope or raw RPC.

## Steps

1. Identify the domain the task touches (contract, indexer, API, chain RPC, client library, releases).
2. Read the matching `reference/` file(s) in full; the routing table below maps domains to files.
3. Follow `guides/querying-the-api.md` for API access patterns (pagination, state filters, table reads, error classification).
4. Re-verify version-pinned facts (library versions, contract releases, operator-configurable limits) against current source before relying on them.

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
| Querying the API and reading chain tables end to end | `guides/querying-the-api.md` |
