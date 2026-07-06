---
name: atomic-integration
description: "Use when building or debugging an integration with AtomicAssets/AtomicMarket contracts, the atomicassets-api indexer, or WAX chain reads: routes to the matching reference file"
scope: Routes Atomic integration tasks to the matching reference file
depends-on: []
key-modules: []
---

# Atomic integration

## When to use

Use this skill whenever the task touches the Atomic NFT ecosystem on WAX/Antelope chains: listing or trading through the AtomicMarket contract, reading AtomicAssets state, calling atomicassets-api endpoints, running or extending the atomicassets-api indexer, deploying contract releases, or reading chain tables and accounts through @wharfkit/antelope or raw RPC.

## Steps

1. Identify the domain the task touches (contract, indexer, API, chain RPC, client library, releases).
2. Read the matching `reference/` file(s) in full; see the routing table in `AGENTS.md` for the domain-to-file mapping.
3. Follow `guides/querying-the-api.md` for API access patterns (pagination, state filters, table reads, error classification).
4. Re-verify version-pinned facts (library versions, contract releases, operator-configurable limits) against current source before relying on them.

## Routing table

For the domain-to-file routing table, see `AGENTS.md`.
