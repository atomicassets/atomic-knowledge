# Atomic Knowledge

Validated, source-cited knowledge for building on the Atomic ecosystem on WAX and other Antelope chains: the AtomicAssets and AtomicMarket smart contracts, the atomicassets-api (eosio-contract-api) indexer, and the chain and client-library behavior around them.

Every statement in this repository was validated against contract or indexer source code, or against live chain reads, before inclusion. The material is aimed at developers and coding agents building Atomic integrations: marketplaces, wallets, indexers, bots, and tooling.

The rendered site is [docs.atomicassets.io](https://docs.atomicassets.io), which serves one pinned revision of this repository.

## Start here

Agents read `AGENTS.md`, whose routing table maps a task to the file that answers it. Humans read the site, or browse `reference/` for facts and `guides/` for end-to-end workflows. Each fact stands alone: take a section at face value and do not extrapolate past what it states.

## How facts are validated

`reference/validation.md` is the provenance ledger. It records, page by page, which source was read or which endpoint was probed, and it grades each page `source-read`, `live-chain`, or `both`. A claim that has not been checked that way stays in `learning/`, the unverified tier whose promotion gate is `learning/INSTRUCTIONS.md`.

The pages are read against these baselines:

- `atomicassets-contract` at `v2.0.0`
- `atomicmarket-contract` at `v2.0.0`
- `atomicassets-api` at its `main` branch state, which carries no release tag; the streaming and rate-limit pages pin commit `f6419858`
- `atomictools-contract` at commit `d89ce79e4`, which the deployed `atomictoolsx` ABI on WAX matches exactly
- `atomicassets-sdk` at main `80580c5` and `atomicmarket-sdk` at main `278bdfa`, both version 2.0.0
- `@atomichub/vert` at `2.2.0`

WAX mainnet still runs the V1 `atomicassets` and `atomicmarket` contracts while WAX testnet and jungle4 run V2, so an action that exists only in V2 fails when it is sent to mainnet (`reference/validation.md`).

## What it covers

| Area | Behavior documented |
| --- | --- |
| Contracts | AtomicAssets, AtomicMarket, and AtomicTools (claim links): listing semantics, fee application, royalty logging, the claim-link escrow-and-signature flow, upgrade compatibility, and defensive guards |
| Indexer | atomicassets-api (formerly eosio-contract-api) operation: handler dependencies, drain gating, data freshness, migrations, and CI |
| API | The hosted atomicassets-api endpoints (e.g. wax.api.atomicassets.io): pagination limits, lifecycle states, query semantics, rate limits, and the Socket.IO realtime surface |
| Chain and clients | nodeos RPC behavior, error semantics, and @wharfkit/antelope client-library behavior |
| SDKs | The official @atomichub/atomicassets and @atomichub/atomicmarket JavaScript/TypeScript clients: typed API and chain-table reads, attribute serialization, and V2 action building |
| Media | How asset media is referenced on chain (bare IPFS CIDs under de-facto img/backimg/video fields), value-shape parsing, and gateway resolution |
| Testing | Running compiled Antelope contracts in-process with @atomichub/vert (VeRT): action calls, table reads, time control, the per-chain host-function gate, and the emulation's limits |

## Organization

| Directory | Contents |
| --- | --- |
| `reference/` | Facts: `atomicassets/`, `atomicmarket/`, `atomictools/`, and `sdk/` directories with per-topic pages (structure, actions, tables, fees, serialization, SDK surfaces), plus one file each for the indexer, API, API streaming, media conventions, chain, and client libraries |
| `guides/` | End-to-end workflows: asset lifecycle, offers, sales, auctions, buyoffers, deposits, claim links, notification integration, contract testing with VeRT, and querying the API |
| `learning/` | The unverified tier: claims that have not been checked yet, and the gate they pass before promotion |
| `skills/` | Agent skills. `atomic-integration` routes a coding agent to the reference file its task needs. `report` writes a sanitized report about these docs into the consuming project, and never edits this repository |

## Consuming this repository

Pin a revision rather than tracking `main`. A fact is checkable only against the revision it was read at, and the docs site consumes this repository the same way.

The rendered set is the markdown under `reference/` and `guides/`. `AGENTS.md` and `skills/atomic-integration/SKILL.md` are served byte for byte, because both are written to be handed to an agent unedited.

## Reporting a fact error

Open a fact-error issue with the page, the claim as the page writes it, what you observed instead, and the chain and endpoint you read. A wrong fact needs no fix attached to be worth reporting.

A coding agent that lost time to a gap here can run the `report` skill under `skills/`, which writes a sanitized report into the consuming project for a maintainer to collect.

## Contributing

`CONTRIBUTING.md` carries the rules a change has to meet: every claim cites the source it was read from, and an unchecked claim goes to `learning/` rather than to `reference/` or `guides/`.

## Citing

Attribution is what the license asks for. Name the repository (`atomicassets/atomic-knowledge`), the tag you read, and `https://github.com/atomicassets/atomic-knowledge`.

## License

Prose is licensed under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](LICENSE). Code samples in fenced blocks and runnable project directories are licensed under the [MIT License](LICENSE-CODE).

## Not covered

Drops, packs, and EVM chains sit outside the validated tier. Claims about them live in `learning/` until a validation pass covers them, so their absence from `reference/` is deliberate rather than an oversight. Knowledge that is not about the Atomic ecosystem does not belong here at all, however useful it was to discover.
