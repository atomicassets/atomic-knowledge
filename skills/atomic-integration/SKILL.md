---
name: atomic-integration
description: Use when building or debugging an integration with AtomicAssets/AtomicMarket contracts, the atomicassets-api indexer, or WAX chain reads — routes to validated reference knowledge
---

# Atomic integration

## When to use

Use this skill whenever the task touches the Atomic NFT ecosystem on WAX/Antelope chains: listing or trading through the AtomicMarket contract, reading AtomicAssets state, calling atomicassets-api endpoints, running or extending the eosio-contract-api indexer, deploying contract releases, or reading chain tables and accounts through @wharfkit/antelope or raw RPC.

## Steps

1. Identify the domain the task touches (contract, indexer, API, chain RPC, client library, releases).
2. Read the matching `reference/` file(s) in full — the routing table below maps domains to files.
3. Follow `guides/querying-the-api.md` for API access patterns (pagination, state filters, table reads, error classification).
4. Re-verify version-pinned facts (library versions, contract releases, operator-configurable limits) against current source before relying on them.

## Routing table

| Working on | Read |
| --- | --- |
| AtomicMarket contract behavior — sales, auctions, buyoffers, marketplace attribution, fees, royalties, bundles, contract guards | `reference/atomicmarket.md` |
| AtomicAssets contract — V2 upgrade and indexer/chain compatibility | `reference/atomicassets.md` |
| Calling atomicassets-api HTTP endpoints — pagination limits, buyoffer lifecycle states | `reference/api.md` |
| Running or extending the eosio-contract-api indexer — handler configuration, drain gating, data freshness, migrations, CI | `reference/eosio-contract-api.md` |
| Building or deploying contract releases — ABI artifacts, setcode resource needs, deploy permissions | `reference/contract-releases.md` |
| @wharfkit/antelope client behavior — table reads, authority checks, show_payer, eosjs migration | `reference/wharfkit.md` |
| Chain RPC error semantics — account-not-found and error classification | `reference/chain.md` |
| Querying the API and reading chain tables end to end | `guides/querying-the-api.md` |
