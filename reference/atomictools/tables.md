---
scope: Complete table reference for the atomictools contract (links / config)
depends-on: [reference/atomictools/actions.md]
key-modules: ["atomictools-contract (commit d89ce79e4): include/atomictoolsx.hpp, src/link.cpp"]
---

# AtomicTools tables

Complete table reference for the `atomictools` contract, deployed as account `atomictoolsx`. The contract has no release tags; citations pin commit `d89ce79e4` of `pinknetworkx/atomictools-contract`. The contract defines exactly two tables, `links` and `config`, both scoped to the contract account itself. Struct and typedef citations are to `include/atomictoolsx.hpp`; behavior citations are to `src/link.cpp`.

Live-chain status: the deployed `atomictoolsx` ABI on WAX mainnet lists exactly these two tables, and their field layouts match the pinned source. The row shapes below are copied from live `get_table_rows` reads against `wax.greymass.com`.

## links

Contract table name: `links`. C++ struct: `links_s`.

Scope: `get_self()` (the `atomictoolsx` account; one shared scope for every link).

Primary key: `link_id`.

Secondary indexes: `assetidshash` (`checksum256`, index position 2, `key_type` `sha256`) computed by `hash_asset_ids(asset_ids)`. The hash sorts the asset ids before hashing, so it is identical for any two links holding the same id set in any order. The contract uses it to find a link by its asset set when funding a transfer and when checking for a duplicate announcement.

| Column | Type | Meaning |
| --- | --- | --- |
| `link_id` | `uint64` | Assigned from the contract-wide `config.link_counter` (starts at 1). Also the primary key. |
| `creator` | `name` | The account that announced the link; the only account that can `cancellink` it, and the account escrowed assets are returned to on cancel. Pays the row's RAM. |
| `key` | `public_key` | The link's public key. A `claimlink` succeeds only when its signature over `sha256(claimer)` recovers to this key. The matching private key is shared out of band to whoever may claim. |
| `asset_ids` | `uint64[]` | The escrowed asset ids. Feeds the `assetidshash` index. |
| `assets_transferred` | `bool` | `false` after `announcelink`; set `true` (with `same_payer`) by the transfer notification handler once the assets land. `claimlink` requires it to be `true`; `cancellink` returns the assets only when it is `true`. |
| `memo` | `string` | Free-form, up to 256 characters. |

A row exists from `announcelink` until the link is claimed or cancelled; both terminal actions erase it, so the `links` table holds only live (announced or funded, not yet resolved) links. Changed state is not recorded on chain beyond `assets_transferred`; the announced-versus-claimed-versus-cancelled distinction lives in the indexer (see "Reading links" in `guides/links.md`).

Source: `include/atomictoolsx.hpp:88-102`, `src/link.cpp:21-98` (`announcelink`), `src/link.cpp:189-241` (funding), `src/link.cpp:107-159` (cancel/claim)

Live chain example (`wax.greymass.com get_table_rows`, `code=atomictoolsx`, `scope=atomictoolsx`, `table=links`, two rows):

```json
{"link_id":3265012,"creator":"yrgb4.wam","key":"EOS6YxGQNSuv5hk2YRjHRZN9rpvJAf323ZfRPzp22C8fy8pW8kfmB",
 "asset_ids":["1099925607623"],"assets_transferred":1,"memo":""},
{"link_id":1445742,"creator":"lqpd.wam","key":"EOS6XgMxUpjuSPtvvfDnMWyC5DHbskPoeTJpUMdXdY4Giy91nTJTh",
 "asset_ids":["1099602125511","1099595841824"],"assets_transferred":1,"memo":""}
```

`get_table_rows` renders `key` in the legacy `EOS...` format; the hosted API renders the same key as `PUB_K1_...`. They are two encodings of one key.

## config

Contract table name: `config`. C++ struct: `config_s`. EOSIO `singleton`.

Scope: `get_self()`. No user-visible primary key beyond the singleton's own fixed key.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `version` | `string` | Contract-reported version. Hard-coded default `1.0.0`; the contract has no action that changes it, so it reads `1.0.0` on the live deployment. |
| `link_counter` | `uint64` | Next `link_id` to assign. Default 1; incremented by every `announcelink`. |
| `atomicassets_account` | `name` | The AtomicAssets contract this deployment escrows assets through. Default `atomicassets` (`atomicassets::ATOMICASSETS_ACCOUNT`); fixed at `init` and never changed by any action. |

The struct is exposed both as a `singleton` and, for ABI-visibility, as a one-row `multi_index` (a known eosio.cdt workaround so the singleton appears in the ABI). Created by `init`.

Source: `include/atomictoolsx.hpp:105-116`, `src/link.cpp:9-12` (`init`), `src/link.cpp:72-74` (`link_counter` increment)

Live chain example (`code=atomictoolsx`, `scope=atomictoolsx`, `table=config`):

```json
{"version":"1.0.0","link_counter":6572117,"atomicassets_account":"atomicassets"}
```

## Table scoping summary

| Table | Contract name | Scope | Primary key | Secondary indexes |
| --- | --- | --- | --- | --- |
| Links | `links` | `get_self()` | `link_id` | `assetidshash` (`sha256` of sorted `asset_ids`) |
| Config | `config` | `get_self()` | singleton | none |

Source: `include/atomictoolsx.hpp:88-116`
