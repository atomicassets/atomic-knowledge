# Atomic Knowledge

Validated, source-cited knowledge for building on the Atomic NFT ecosystem on WAX and other Antelope chains: the AtomicAssets and AtomicMarket smart contracts, the atomicassets-api (eosio-contract-api) indexer, and the chain and client-library behavior around them.

Every statement in this repository was validated against contract or indexer source code, or against live chain reads, before inclusion. The material is aimed at developers and coding agents building Atomic integrations: marketplaces, wallets, indexers, bots, and tooling.

## What it covers

- **Contracts**, AtomicAssets and AtomicMarket behavior: listing semantics, fee application, royalty logging, upgrade compatibility, and defensive guards.
- **Indexer**, atomicassets-api (formerly eosio-contract-api) operational behavior: handler dependencies, drain gating, data freshness, migrations, and CI.
- **API**, the hosted atomicassets-api endpoints (e.g. wax.api.atomicassets.io): pagination limits, lifecycle states, and query semantics.
- **Chain and clients**: nodeos RPC behavior, error semantics, and @wharfkit/antelope client-library behavior.

## Organization

| Directory | Contents |
| --- | --- |
| `reference/` | Facts: `atomicassets/` and `atomicmarket/` directories with per-topic contract pages (structure, actions, tables, fees, serialization), plus one file each for the indexer, API, chain, and client libraries |
| `guides/` | End-to-end workflows: asset lifecycle, offers, sales, auctions, buyoffers, deposits, and querying the API |
| `skills/` | Agent skills that route coding agents to the relevant reference material |

Agents should start at `AGENTS.md`; humans can browse `reference/` directly.

## License

This work is licensed under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](LICENSE).
