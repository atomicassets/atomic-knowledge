# Atomic Knowledge

Validated, source-cited knowledge for building on the Atomic NFT ecosystem on WAX and other Antelope chains: the AtomicAssets and AtomicMarket smart contracts, the atomicassets-api (eosio-contract-api) indexer, and the chain and client-library behavior around them.

Every statement in this repository was validated against contract or indexer source code, or against live chain reads, before inclusion. The material is aimed at developers and coding agents building Atomic integrations: marketplaces, wallets, indexers, bots, and tooling.

## What it covers

| Area | Behavior documented |
| --- | --- |
| Contracts | AtomicAssets, AtomicMarket, and AtomicTools (claim links): listing semantics, fee application, royalty logging, the claim-link escrow-and-signature flow, upgrade compatibility, and defensive guards |
| Indexer | atomicassets-api (formerly eosio-contract-api) operation: handler dependencies, drain gating, data freshness, migrations, and CI |
| API | The hosted atomicassets-api endpoints (e.g. wax.api.atomicassets.io): pagination limits, lifecycle states, query semantics, rate limits, and the Socket.IO realtime surface |
| Chain and clients | nodeos RPC behavior, error semantics, and @wharfkit/antelope client-library behavior |
| SDKs | The official @atomichub/atomicassets and @atomichub/atomicmarket JavaScript/TypeScript clients: typed API and chain-table reads, attribute serialization, and V2 action building |
| Media | How NFT media is referenced on chain (bare IPFS CIDs under de-facto img/backimg/video fields), value-shape parsing, and gateway resolution |
| Testing | Running compiled Antelope contracts in-process with @atomichub/vert (VeRT): action calls, table reads, time control, the per-chain host-function gate, and the emulation's limits |

## Organization

| Directory | Contents |
| --- | --- |
| `reference/` | Facts: `atomicassets/`, `atomicmarket/`, `atomictools/`, and `sdk/` directories with per-topic pages (structure, actions, tables, fees, serialization, SDK surfaces), plus one file each for the indexer, API, API streaming, media conventions, chain, and client libraries |
| `guides/` | End-to-end workflows: asset lifecycle, offers, sales, auctions, buyoffers, deposits, claim links, notification integration, contract testing with VeRT, and querying the API |
| `skills/` | Agent skills that route coding agents to the relevant reference material |

Agents should start at `AGENTS.md`; humans can browse `reference/` directly.

## License

This work is licensed under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](LICENSE).
