---
scope: Table reference for the atomicmarket contract - sales, auctions, buyoffers, template buyoffers, marketplaces, balances, config, counters, bonus fees, and royalty split tables
depends-on: [reference/atomicmarket/fees-and-royalties.md]
key-modules: ["atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp, include/atomicmarket.hpp"]
---

# AtomicMarket tables

Every entry cites its declaration in `include/atomicmarket.hpp` (paths relative to the atomicmarket-contract repo), baselined on the V2 source. "Changed in V2" notes compare against the V1 `atomicmarket-contract` source.

See `reference/atomicmarket/marketplaces.md` ("Registering a marketplace with regmarket") for marketplace attribution and `reference/atomicmarket/fees-and-royalties.md` ("The collection fee applies at execution time, not at listing time") for execution-time collection fees and ("The royalty log actions are trace-only and dust always reconciles") for trace-only royalty logs. This page stays brief on those topics and cross-links instead of repeating them.

See `reference/atomicassets/v2-upgrade.md` ("Deployment status") for the live-chain read confirming the royalty tables below are source-verified but not yet observable on any publicly reachable chain.

## sales

Scope: `get_self()` (the contract account). Primary key: `sale_id`. Secondary index: `assetidshash` (SHA-256 of the sorted `asset_ids`, via `hash_asset_ids`).

An instant-sale listing. Created empty of any escrow: the seller still owns the asset until `purchasesale` accepts the backing AtomicAssets offer.

| Column | Type | Meaning |
| --- | --- | --- |
| `sale_id` | uint64_t | Primary key, from the persistent `sale` counter. |
| `seller` | name | The listing's seller. |
| `asset_ids` | vector\<uint64_t\> | The listed asset ids. Always length 1 for a row created by the current `announcesale`; legacy V1 rows can have more (see "Changed in V2" below). |
| `offer_id` | int64_t | The backing AtomicAssets offer id, or `-1` if the seller has not yet created it (the sale is announced but not active). |
| `listing_price` | asset | The listing price in `listing_price.symbol` (which may differ from `settlement_symbol` for a Delphi-priced listing). |
| `settlement_symbol` | symbol | The symbol the sale actually settles in. |
| `maker_marketplace` | name | The marketplace attributed as maker (the lister's referring marketplace). See `reference/atomicmarket/marketplaces.md` ("Maker and taker attribution across the listing and settlement actions") for why the taker marketplace is never stored here. |
| `collection_name` | name | The listed asset's collection. |
| `collection_fee` | double | The collection fee read at announcement time, for indexing only; not necessarily the fee applied at settlement. |

Changed in V2: `announcesale` now rejects any `asset_ids` with more than one entry, retiring bundle sales; the row shape itself is unchanged from V1.

Source: `include/atomicmarket.hpp:529-547`

## auctions

Scope: `get_self()`. Primary key: `auction_id`. Secondary index: `assetidshash` (same construction as `sales`).

An auction listing. The assets move into contract custody once the seller sends the activating AtomicAssets transfer; bids move only through the internal balances table until the auction is claimed.

| Column | Type | Meaning |
| --- | --- | --- |
| `auction_id` | uint64_t | Primary key, from the persistent `auction` counter. |
| `seller` | name | The auction's seller. |
| `asset_ids` | vector\<uint64_t\> | The auctioned asset ids. Always length 1 for a row created by the current `announceauct`; legacy V1 rows can have more. |
| `end_time` | uint32_t | Seconds since epoch when the auction closes. Extended on a late bid by `auction_reset_duration` (from `config`). |
| `assets_transferred` | bool | Whether the seller has activated the auction by transferring the assets into contract custody. |
| `current_bid` | asset | The current highest bid (or the starting bid, before any bid). |
| `current_bidder` | name | The current highest bidder, or the empty name if there is no bid yet. |
| `claimed_by_seller` | bool | Whether `auctclaimsel` has run for this auction. |
| `claimed_by_buyer` | bool | Whether `auctclaimbuy` has run for this auction. |
| `maker_marketplace` | name | The marketplace attributed as maker. |
| `taker_marketplace` | name | The marketplace attributed as taker, set by the winning bid. Only meaningful when `current_bidder` is non-empty; otherwise it is just the unset default. |
| `collection_name` | name | The auctioned asset's collection. |
| `collection_fee` | double | The collection fee read at announcement time, for indexing only. |

A row is erased once both `claimed_by_seller` and `claimed_by_buyer` are true (or immediately, for a cancelled or dissolved auction).

Changed in V2: `announceauct` now rejects any `asset_ids` with more than one entry, retiring bundle auctions; the row shape itself is unchanged from V1.

Source: `include/atomicmarket.hpp:550-572`

## buyoffers

Scope: `get_self()`. Primary key: `buyoffer_id`.

A standing offer from `buyer` to buy specific assets from `recipient`, with the price already escrowed out of the buyer's internal balance.

| Column | Type | Meaning |
| --- | --- | --- |
| `buyoffer_id` | uint64_t | Primary key, from the persistent `buyoffer` counter. |
| `buyer` | name | The account offering to buy. |
| `recipient` | name | The account expected to own and sell the assets. |
| `price` | asset | The escrowed offer price. |
| `asset_ids` | vector\<uint64_t\> | The requested asset ids. Always length 1 for a row created by the current `createbuyo`; legacy V1 rows can have more. |
| `memo` | string | Buyer-supplied memo, up to 256 characters. |
| `maker_marketplace` | name | The marketplace attributed as maker. |
| `collection_name` | name | The requested assets' collection. |
| `collection_fee` | double | The collection fee read at creation time, for indexing only. |

Changed in V2: `createbuyo` now rejects any `asset_ids` with more than one entry, retiring bundle buyoffers; the row shape itself is unchanged from V1.

Source: `include/atomicmarket.hpp:575-589`

## tbuyoffers

Scope: `get_self()`. Primary key: `buyoffer_id`. Declared as `template_buyoffer_s` in source; the table name is `tbuyoffers`.

A standing offer to buy any asset minted from a specific template, fulfillable by any account owning a matching asset. `buyoffer_id` shares its counter (`tbuyoffer`) and therefore its id space is independent of the `buyoffers` table's `buyoffer_id`, even though both columns share a name.

| Column | Type | Meaning |
| --- | --- | --- |
| `buyoffer_id` | uint64_t | Primary key, from the persistent `tbuyoffer` counter. |
| `buyer` | name | The account offering to buy. |
| `price` | asset | The escrowed offer price. |
| `template_id` | uint64_t | The template any fulfilling asset must be minted from. |
| `maker_marketplace` | name | The marketplace attributed as maker. |
| `collection_name` | name | The template's collection. |
| `collection_fee` | double | The collection fee read at creation time, for indexing only. |

Source: `include/atomicmarket.hpp:591-603`

## marketplaces

Scope: `get_self()`. Primary key: `marketplace_name.value`.

Every registered marketplace name usable in a `maker_marketplace`/`taker_marketplace` parameter, and the account credited as its fee recipient.

| Column | Type | Meaning |
| --- | --- | --- |
| `marketplace_name` | name | The registered marketplace name; primary key. |
| `creator` | name | The account whose internal balance receives this marketplace's maker/taker cut. |

The empty-string name (`""`) is always present after `init` runs, seeded with `creator = DEFAULT_MARKETPLACE_CREATOR` (`fees.atomic`); `setdefmktcr` can redirect it. See `reference/atomicmarket/marketplaces.md` ("The default marketplace and redirecting its fee recipient") for how this default marketplace shows up in listing rows that omit a marketplace.

Source: `include/atomicmarket.hpp:605-612`

## balances

Scope: `get_self()`. Primary key: `owner.value`.

The internal token ledger every settlement, deposit, and escrow moves through. A withdrawal (`withdraw`) is the only action that turns a balance into a real on-chain token transfer out of the contract. See `reference/atomicmarket/ram.md` ("The contract pays RAM for every balances row") for who pays this row's RAM and why a fully-withdrawn balance leaves no row behind.

| Column | Type | Meaning |
| --- | --- | --- |
| `owner` | name | The account this balance row belongs to; primary key. |
| `quantities` | vector\<asset\> | One entry per token symbol the owner currently holds a nonzero balance of. A symbol's entry is removed once its amount reaches zero, and the whole row is erased once `quantities` is empty. |

Source: `include/atomicmarket.hpp:519-526`

## config

Singleton, scope: `get_self()`. Table name `config`, one row.

Contract-wide configuration, mutated only by the admin actions. See `reference/atomicmarket/actions.md` ("Admin").

| Column | Type | Meaning |
| --- | --- | --- |
| `version` | string | Contract version string. Defaults to `"2.0.0"` in the V2 source (V1 defaulted to `"1.3.3"`); set via `setversion`. |
| `sale_counter` | uint64_t | Deprecated. Superseded by the `sale` row in `counters`; retained at `0` after `convcounters` runs. |
| `auction_counter` | uint64_t | Deprecated, same as `sale_counter`. |
| `minimum_bid_increase` | double | Minimum relative increase a new auction bid must exceed the current bid by. Default `0.1`; set via `setminbidinc`. |
| `minimum_auction_duration` | uint32_t | Shortest allowed `announceauct` duration, in seconds. Default `120`. |
| `maximum_auction_duration` | uint32_t | Longest allowed `announceauct` duration, in seconds. Default `2592000` (30 days). |
| `auction_reset_duration` | uint32_t | How far a late bid extends `end_time`, in seconds. Default `120`. |
| `supported_tokens` | vector\<TOKEN\> | `{token_contract, token_symbol}` pairs usable for listings and balances; set via `addconftoken`. |
| `supported_symbol_pairs` | vector\<SYMBOLPAIR\> | `{listing_symbol, settlement_symbol, delphi_pair_name, invert_delphi_pair}` tuples for Delphi-priced listings; set via `adddelphi`. |
| `maker_market_fee` | double | Global maker cut of every settlement. Default `0.01`; set via `setmarketfee`. |
| `taker_market_fee` | double | Global taker cut of every settlement. Default `0.01`; set via `setmarketfee`. |
| `atomicassets_account` | name | The linked AtomicAssets contract account. Not settable through any action in this source; fixed at compile time to `atomicassets::ATOMICASSETS_ACCOUNT` (`atomicassets`). |
| `delphioracle_account` | name | The linked Delphi Oracle contract account. Not settable through any action in this source; fixed at compile time to `delphioracle::DELPHIORACLE_ACCOUNT` (`delphioracle`). |

See `reference/atomicassets/v2-upgrade.md` ("Deployment status") for the live read confirming `version` still reads `"1.3.3"` (the V1 default field set) on public WAX mainnet, jungle4 testnet, and wax-testnet RPC nodes; re-check before relying on it.

Source: `include/atomicmarket.hpp:638-653`

## counters

Scope: `get_self()`. Primary key: `counter_name.value`.

Backs `consume_counter`: one row per named, monotonically increasing id sequence. A counter name absent from the table is treated as starting at 1.

| Column | Type | Meaning |
| --- | --- | --- |
| `counter_name` | name | The sequence's name; primary key. |
| `counter_value` | uint64_t | The next value `consume_counter` will hand out for this name. |

Counter names observed in source, each consumed at exactly one call site:

| Counter name | Consumed by | Backs |
| --- | --- | --- |
| `sale` | `announcesale` | `sales.sale_id` |
| `auction` | `announceauct` | `auctions.auction_id` |
| `buyoffer` | `createbuyo` | `buyoffers.buyoffer_id` |
| `tbuyoffer` | `createtbuyo` | `tbuyoffers.buyoffer_id` |
| `bonusfee` | `addbonusfee` | `bonusfees.bonusfee_id` |
| `attrroyalty` | `setattrroy` (new rule only) | `royaltyattr.index` |

`applicable_counter_names` on a bonus fee (see `bonusfees` below) must reference one of these names to have any effect on a payout, since `internal_payout_sale` only checks the counter name it was called with against each bonus fee's configured ranges.

Source: `include/atomicmarket.hpp:615-622`

## bonusfees

Scope: `get_self()`. Primary key: `bonusfee_id`.

Extra fee cuts layered on top of the maker/taker/collection split, scoped to a range of ids on one or more of the counters above. See `reference/atomicmarket/fees-and-royalties.md` ("Bonus fees are additive marketplace incentives layered on top") for how bonus fees stack with the other fee layers and why the settlement-time seller-remainder check is the only backstop against several bonus fees combined.

| Column | Type | Meaning |
| --- | --- | --- |
| `bonusfee_id` | uint64_t | Primary key, from the persistent `bonusfee` counter. |
| `fee_recipient` | name | The account whose internal balance receives this bonus fee's cut. |
| `fee` | double | The fee fraction, applied to the full settlement quantity. |
| `counter_ranges` | vector\<COUNTER_RANGE\> | Per-counter-name `{counter_name, start_id, end_id}` ranges this fee applies to. `end_id` is `ULLONG_MAX` until `stopbonusfee` freezes it. |
| `fee_name` | string | Human-readable label. |

`COUNTER_RANGE` (a private struct, not its own table): `counter_name: name`, `start_id: uint64_t`, `end_id: uint64_t`. A listing's relevant counter id falls in range when `start_id <= id < end_id`.

Source: `include/atomicmarket.hpp:625-635` (bonusfees_s), `include/atomicmarket.hpp:448-452` (COUNTER_RANGE)

## royaltyconf

V2 only; no equivalent table exists in the V1 source. Scope: `get_self()`. Primary key: `collection.value`.

Per-collection royalty split configuration: how a collection's fee is divided between three payout categories before it reaches the collection author.

| Column | Type | Meaning |
| --- | --- | --- |
| `collection` | name | The collection this config applies to; primary key. |
| `founders` | vector\<ROYALTYPAIR\> | `{recipient, weight}` pairs paid on every settlement of the collection, regardless of asset. |
| `attribute_mode` | uint8_t | `0` = merged (one shared lookup namespace across all attribute sources), `1` = granular (separate namespaces per source: asset immutable, asset mutable, template immutable, template mutable). Locked while any `royaltyattr` row exists for the collection. |
| `split_founders` | uint32_t | Relative weight of the founders category. |
| `split_templates` | uint32_t | Relative weight of the template category. |
| `split_attributes` | uint32_t | Relative weight of the attributes category. |

The three split weights are relative, not fractions of 1: at settlement, only the categories that actually have a payee for the specific asset are kept, and their weights are renormalized against each other. See `reference/atomicmarket/fees-and-royalties.md` ("The royalty split engine divides the collection fee among founders, templates, and attributes") for the full settlement-time distribution mechanics, and ("The royalty log actions are trace-only and dust always reconciles") for why the royalty log actions, not this table, are the source of truth for what was actually paid.

Source: `include/atomicmarket.hpp:477-490`

## royaltytemp

V2 only. Scope: the collection name (not `get_self()`). Primary key: `template_id` (stored as `uint64_t(uint32_t(template_id))`).

Per-template royalty recipients within a collection's split config.

| Column | Type | Meaning |
| --- | --- | --- |
| `template_id` | int32_t | The template this row's recipients apply to; primary key (cast to `uint32_t` then `uint64_t` for the key, never negative in a valid row). |
| `recipients` | vector\<ROYALTYPAIR\> | `{recipient, weight}` pairs paid when the template category matches a settled asset of this template. |

Source: `include/atomicmarket.hpp:493-499`

## royaltyattr

V2 only. Scope: the collection name. Primary key: `index` (from the persistent `attrroyalty` counter). Secondary index: `byhash` (`lookup_hash`, a SHA-256 over the packed `(source, field, value)` tuple).

One row per attribute royalty rule. A rule matches a settled asset when the asset's resolved value at `(source, field)` equals `value` exactly, including the value's serialized type.

| Column | Type | Meaning |
| --- | --- | --- |
| `index` | uint64_t | Primary key; a persistent id, not derived from `available_primary_key()`, so a deleted rule's id is never reused. |
| `source` | uint8_t | `0` (merged mode) or, in granular mode, `1` asset immutable, `2` asset mutable, `3` template immutable, `4` template mutable, in that precedence order. |
| `field` | string | The attribute name this rule matches on, 1-64 characters. |
| `value` | ATOMIC_ATTRIBUTE | The attribute value this rule matches. Kept in the row for introspection; the actual match uses `lookup_hash`. |
| `weight` | uint32_t | This rule's weight within the attributes category, relative to every other rule that matches the same asset. |
| `recipients` | vector\<ROYALTYPAIR\> | `{recipient, weight}` pairs paid out of this rule's share. |
| `lookup_hash` | checksum256 | `hash_attribute_royalty(source, field, value)`; the `byhash` secondary index key. |

Source: `include/atomicmarket.hpp:502-517`

## Rentals

No rental table exists in either the V1 or the V2 source. See `reference/atomicmarket/actions.md` for the corresponding action-side confirmation and the descope note.
