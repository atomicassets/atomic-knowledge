# AGENTS.md

This repository holds validated knowledge for building integrations with the Atomic NFT ecosystem on WAX/Antelope chains: the AtomicAssets and AtomicMarket contracts, the atomicassets-api (eosio-contract-api) indexer, the hosted API, and chain/client-library behavior. Every statement was validated against contract or indexer source code or live chain reads before inclusion.

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
| Running or extending the eosio-contract-api indexer: handler configuration, drain gating, data freshness, migrations, CI | `reference/eosio-contract-api.md` |
| Building or deploying contract releases: ABI artifacts, setcode resource needs, deploy permissions | `reference/contract-releases.md` |
| @wharfkit/antelope client behavior: table reads, authority checks, show_payer, eosjs migration | `reference/wharfkit.md` |
| Chain RPC error semantics: account-not-found and error classification | `reference/chain.md` |
| Querying the API and reading chain tables end to end | `guides/querying-the-api.md` |

## How to use this repo as an agent

- Look up the domain file above before coding against a contract, the indexer, or the API: the facts there encode behavior you cannot guess from method signatures.
- Each fact stands alone; take a section at face value and do not extrapolate beyond what it states.
- When a fact names a specific library version (for example @wharfkit/antelope 1.1.1), re-check that fact when the dependency is upgraded.
