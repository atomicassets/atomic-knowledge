# AGENTS.md

This repository holds validated knowledge for building integrations with the Atomic NFT ecosystem on WAX/Antelope chains: the AtomicAssets and AtomicMarket contracts, the atomicassets-api (eosio-contract-api) indexer, the hosted API, and chain/client-library behavior. Every statement was validated against contract or indexer source code or live chain reads before inclusion.

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

## How to use this repo as an agent

- Look up the domain file above before coding against a contract, the indexer, or the API — the facts there encode behavior you cannot guess from method signatures.
- Each fact stands alone; take a section at face value and do not extrapolate beyond what it states.
- When a fact names a specific library version (for example @wharfkit/antelope 1.1.1), re-check that fact when the dependency is upgraded.
