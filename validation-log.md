---
scope: Provenance ledger - how each polished-tier page's facts were validated, and against what
depends-on: []
key-modules: []
---

# Validation log

This log traces how every fact in `reference/` and `guides/` was checked before it was written down. It records the basis of validation, which source was read or which endpoint was probed, not a dated test run. See `learning/INSTRUCTIONS.md` for the promotion process that feeds this tier, and the tier definitions it sets: `source-read`, `live-chain`, `both`.

## Pinned baselines

- `atomicassets-contract` at `v2.0.0-rc4`
- `atomicmarket-contract` at `v2.0.0-rc2`
- `atomicassets-api` at its current `main` branch state (no release tag; indexer behavior and API surface are read from the running source tree)

A page's `key-modules` frontmatter names the specific baseline(s) it draws from; entries below carry the same pin unless noted otherwise.

## Caveat: V2 is live on WAX testnet, not on WAX mainnet

WAX mainnet still runs the V1 `atomicassets` and `atomicmarket` contracts (confirmed by live `get_abi` and `get_table_rows` reads; see `reference/atomicassets/v2-upgrade.md`). WAX testnet runs the full V2 contracts: the V2 tables are present and populated, and jungle4 carries the V2 code with unseeded tables. Many V2 contract-behavior facts in this repository are therefore still tiered `source-read` because they were written from the rc4/rc2 source, but the create, trade, and read integrator flows have now been executed end-to-end against live V2 on wax-testnet (the cold-validation harness, `packages/testnet-e2e/cold-validation.md`): a full asset lifecycle, a sale settling founders/template/attribute royalties that sum exactly to the collection fee, and a full read reconstruction over both the API and chain tables. Facts confirmed by those runs are tiered `live-chain`/`both` and noted per page below. A `source-read` tier means only that chain execution has not confirmed that specific fact, not lesser confidence in the reading. Hosted-API facts (pagination, lifecycle states) and chain-RPC facts (error codes, serialization) are checked against the live deployment and nodeos; V1 and V2 share the indexer and RPC layer for everything those facts describe.

## Pages

| Page | Primary source (repo + key files) | Verification tier | Notes |
| --- | --- | --- | --- |
| `reference/api.md` | `atomicassets-api`: `src/api/server.ts`, `src/api/namespaces/*/openapi.ts`; live probes of `wax.api.atomicassets.io` | both | The Swagger-UI section cites both the server routing source and live probes of `/docs`, `/openapi.json`, `/docs/swagger-ui-init.js` in one `Source:` line. The pagination-cap section is a live-observed fact against the hosted deployment. The buyoffer-lifecycle-states section describes indexer state-machine behavior with no dedicated `Source:` line in this page (see `reference/atomicassets-api.md` for the indexer side). |
| `reference/atomicassets-api.md` | `atomicassets-api`: `package.json`, `src/api/server.ts` | source-read | Cites repo metadata and the documentation-server source; no live probe cited. |
| `reference/atomicassets/actions.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp`, `include/atomicassets.hpp` | source-read | Every action cites specific header and implementation line ranges. |
| `reference/atomicassets/backing-tokens.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp`, `include/atomicassets.hpp` | source-read | Cites `announcedepo`, `withdraw`, `addconftoken`, `burnasset`, and the V2 `backasset` abort by line range. |
| `reference/atomicassets/custom-types.md` | `atomicassets-contract` (v2.0.0-rc4): `include/atomicdata.hpp`, `include/checkformat.hpp`, `src/atomicassets.cpp` | source-read | Includes one negative check (`setschematyp` confirmed absent from the V1 source tree) alongside the V2 citations. |
| `reference/atomicassets/data-precedence.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp`, `include/atomicdata.hpp` | source-read | One fact is cross-checked against `atomicassets-api src/api/namespaces/atomicassets/format.ts` in addition to contract source. |
| `reference/atomicassets/notifications.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp`, `include/atomicassets.hpp` | source-read | One entry also cites the V1 contract tree (`contracts/atomicassets-contract`) for a V1-vs-V2 comparison. |
| `reference/atomicassets/serialization.md` | `atomicassets-contract` (v2.0.0-rc4): `include/atomicdata.hpp`, `include/checkformat.hpp` | source-read | One entry confirms identical serialize/deserialize logic between the V1 and V2 source trees. |
| `reference/atomicassets/structure.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp`, `include/atomicassets.hpp` | source-read | Foundational data-model page; every section cites header and implementation ranges. |
| `reference/atomicassets/tables.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp`, `include/atomicassets.hpp` | source-read | One table per section, each with its own `Source:` line. |
| `reference/atomicassets/v2-upgrade.md` | `atomicassets-contract` (v2.0.0-rc4) source; live `get_abi`/`get_table_rows` reads against WAX mainnet, jungle4, and wax-testnet | both | The additive-upgrade mechanics are source-read; the deployment-status section is live-chain, cross-checked across all three chains (mainnet V1, jungle4 and wax-testnet V2). Records that `config.version` reads `1.3.3` even on the V2 deployments, so table presence, not the version string, is the authoritative V2 check. |
| `reference/atomicmarket/actions.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp`, `include/atomicmarket.hpp` | source-read | Every action cites header and implementation line ranges. |
| `reference/atomicmarket/fees-and-royalties.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp`, `include/atomicmarket.hpp`; live wax-testnet sale settlement | both | Cites `internal_payout_sale`, fee-bound actions, and the royalty split/log actions by line range. The four-layer fee stack, the founders/template/attribute split summing exactly to the collection fee, the standing 2% WAX bonus fee, and the `/sales/{id}/logs` payout read are live-chain-confirmed by a cold-validation trade run on wax-testnet. |
| `reference/atomicmarket/marketplaces.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp`, `include/atomicmarket.hpp` | source-read | Cites `regmarket`, `is_valid_marketplace`, and the maker/taker crediting logic inside `internal_payout_sale`. |
| `reference/atomicmarket/ram.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp`, `include/atomicmarket.hpp` | source-read | Cites the internal balance helpers and each `pay*ram` action by line range. |
| `reference/atomicmarket/tables.md` | `atomicmarket-contract` (v2.0.0-rc2): `include/atomicmarket.hpp` | source-read | One table per section, each with its own header line-range citation. |
| `reference/atomicmarket/v2-changes.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp` | source-read | The defensive-guards section has an explicit `Source:` line. The "large integers serialize as strings" section describes live nodeos JSON-serialization behavior and carries no dedicated citation in this page; it is consistent with, and narrower than, the live-chain uint64 facts in `guides/querying-the-api.md`. |
| `reference/chain.md` | Live `nodeos`/WAX RPC behavior (`/v1/chain/get_account`); nodeos `chain_plugin.cpp` referenced for the error-message format | live-chain | No dedicated `Source:` line in this page. The error code and HTTP behavior are a live-RPC fact; the page also names the nodeos source file that emits the message text, which is not independently re-verified here. |
| `reference/contract-releases.md` | `atomicassets-contract` / `atomicmarket-contract`: `Makefile`, `scripts/patch-abi.py`, CI release workflow | source-read | No dedicated `Source:` line and no version pin in this page's frontmatter (build tooling applies across releases, not to one tag). Resource-usage figures (NET/CPU for `setcode`) read as measured observations rather than a cited source or a live probe; treat those magnitudes as approximate. |
| `reference/wharfkit.md` | `@wharfkit/antelope` client library source, pinned to `1.1.1` | source-read | No dedicated `Source:` line; each fact names the library behavior and, for one, an `@attention` note in the library's own source. Re-check on any `@wharfkit/antelope` upgrade, as the page itself states. |
| `guides/asset-lifecycle.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp`, `include/atomicassets.hpp` | source-read | Creator-flow walkthrough; every step cites the underlying action's source range. |
| `guides/auctions.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp`; live `get_table_rows` curl example against `wax.greymass.com` | both | Lifecycle steps cite contract source; one section shows a live `get_table_rows` curl call to illustrate reading auction state. |
| `guides/buyoffers.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp` | source-read | Every action (create, accept, decline, cancel, template variants) cites its source range. |
| `guides/deposits.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp`, `include/atomicmarket.hpp` | source-read | Balance ledger mechanics cite `internal_add_balance`, `internal_decrease_balance`, and `withdraw` by range. |
| `guides/offers.md` | `atomicassets-contract` (v2.0.0-rc4): `src/atomicassets.cpp` | source-read | The underlying `createoffer`/`acceptoffer` primitive and how AtomicMarket sales build on it, all cited to contract source. |
| `guides/querying-the-api.md` | Synthesizes `reference/api.md`, `reference/wharfkit.md`, `reference/chain.md`, `reference/atomicmarket/v2-changes.md`; live curl examples against `wax.api.atomicassets.io` | both | This page has no `Source:` line of its own; it links back to the reference page carrying each cited fact and shows live curl output for the pagination and lifecycle-state examples. |
| `guides/sales.md` | `atomicmarket-contract` (v2.0.0-rc2): `src/atomicmarket.cpp`; live `get_table_rows` curl examples against `wax.greymass.com` | both | Lifecycle steps (`announcesale`, `purchasesale`, `cancelsale`, Delphi pricing) cite contract source; three sections show live `get_table_rows` curl calls. |

## Tier distribution

20 source-read, 1 live-chain, 6 both. 27 pages total.

## Pages with an ambiguous tier signal

Three reference pages carry no dedicated `Source:` line at all and were tiered from their content rather than a citation: `reference/chain.md` (tiered live-chain: it describes a live-RPC error code, though it also names a nodeos source file for the message format), `reference/contract-releases.md` (tiered source-read: it describes build-script and CI behavior with no version pin in its frontmatter and no measured-figure citation), and `reference/wharfkit.md` (tiered source-read: it describes a pinned library version's behavior without a formal citation line). `reference/api.md` has a single `Source:` line that names both contract-adjacent source files and live probes together for one section, while its other two sections carry no line-level citation at all; it is tiered `both` on the strength of that mixed citation and the pagination section's live-observed nature, but a reader relying on citation format alone could reasonably read it as `live-chain` only.
