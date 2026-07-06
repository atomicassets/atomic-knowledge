---
scope: Complete table reference for the atomicassets contract
depends-on: [reference/atomicassets/structure.md]
key-modules: ["atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp, include/atomicassets.hpp"]
---

# AtomicAssets tables

Complete table reference for the `atomicassets` contract, baselined on tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both `wax-testnet` and `jungle4-testnet`). Struct and typedef citations are to `include/atomicassets.hpp`; behavior citations are to `src/atomicassets.cpp`. "Changed in V2" notes compare against the V1 `atomicassets-contract` source.

Live-chain status: see `reference/atomicassets/v2-upgrade.md` ("Deployment status"); the V2-only tables below (`authorswaps`, `schematypes`, `templates2`) do not exist on WAX mainnet yet. An abandoned custodial-rentals design left a `holders` table on unreleased development branches; it ships in no tagged release and is not documented here. See `reference/atomicassets/actions.md` ("RAM-payer reassignment (replaces descoped custodial rentals)").

Every table below is defined in `include/atomicassets.hpp:337-468`, and every scoped (non-self) table is fetched through a `get_*` helper at `include/atomicassets.hpp:476-490`.

## authorswaps (V2)

Contract table name: `authorswaps`. C++ struct: `author_swaps_s`.

Scope: `get_self()` (one shared scope for the whole contract).

Primary key: `collection_name.value`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `collection_name` | `name` | The collection whose authorship is being reassigned. Also the primary key. |
| `current_author` | `name` | The collection's author at the moment the swap was created; re-checked against the live `collections.author` on accept/reject as a consistency guard. |
| `new_author` | `name` | The account the swap would make the new author. |
| `acceptance_date` | `uint32_t` | Unix seconds after which `acceptauswap` becomes callable: `now` if the swap was created under the author's `owner` permission, `now + 604800` (one week) otherwise. |

A row exists only while a swap is pending; `acceptauswap` and `rejectauswap` both erase it. Changed in V2: this table does not exist in V1 (collection authorship there is fixed at creation).

Source: `include/atomicassets.hpp:337-345`, `src/atomicassets.cpp:357-449` (`createauswap`, `acceptauswap`, `rejectauswap`)

## collections

Contract table name: `collections`. C++ struct: `collections_s`.

Scope: `get_self()`.

Primary key: `collection_name.value`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `collection_name` | `name` | The collection's identifier. Also the primary key. |
| `author` | `name` | The account with full control (author-only actions in `reference/atomicassets/actions.md`). Reassignable via the author-swap actions. |
| `allow_notify` | `bool` | Gate on whether `notify_accounts` may hold entries. Settable true only at `createcol`; one-way to false via `forbidnotify`. |
| `authorized_accounts` | `vector<name>` | Up to 24 accounts allowed to create/edit schemas, templates, and assets in this collection. |
| `notify_accounts` | `vector<name>` | Up to 24 accounts that receive `require_recipient` notifications on relevant actions for this collection; can hold entries only while `allow_notify` is true. |
| `market_fee` | `double` | `0 <= market_fee <= 0.15`. Read live by AtomicMarket at settlement time, not snapshotted at listing time. |
| `serialized_data` | `vector<uint8_t>` | The collection's own attribute data (name, description, images, and so on), encoded against the single, contract-wide format in `config.collection_format`, not a per-collection format. |

See `reference/atomicassets/structure.md` ("Authorization and the 24-account cap") for why both lists are capped at 24.

Source: `include/atomicassets.hpp:348-359`, `src/atomicassets.cpp:91-166` (`createcol`), `src/atomicassets.cpp:1804-1856` (`partial_read_collection`)

Live chain example (`wax.greymass.com get_table_rows`, `code=atomicassets`, `scope=atomicassets`, `table=collections`, one row, byte fields elided):

```json
{"collection_name": ".3.r2.wam", "author": ".3.r2.wam", "allow_notify": 1,
 "authorized_accounts": [".3.r2.wam"], "notify_accounts": [], "market_fee": "0.05000000000000000"}
```

## schemas

Contract table name: `schemas`. C++ struct: `schemas_s`.

Scope: `collection_name.value`.

Primary key: `schema_name.value`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `schema_name` | `name` | 1-12 characters. Also the primary key. |
| `format` | `vector<FORMAT>` | Ordered `{name, type}` pairs; a template or asset's serialized data under this schema is a subset of these attributes, encoded by position (see `reference/atomicassets/serialization.md`). |

Append-only: `extendschema` is the only action that changes an existing row, and it can only add lines to the end of `format`, never remove or reorder them.

Source: `include/atomicassets.hpp:363-369`, `src/atomicassets.cpp:450-513` (`createschema`, `extendschema`)

Live chain example (`scope=farmersworld`, `table=schemas`, `lower_bound=memberships`):

```json
{"schema_name": "memberships",
 "format": [{"name": "name", "type": "string"}, {"name": "img", "type": "image"},
            {"name": "description", "type": "string"}, {"name": "type", "type": "string"},
            {"name": "rarity", "type": "string"}, {"name": "level", "type": "uint8"}]}
```

## schematypes (V2)

Contract table name: `schematypes`. C++ struct: `schema_types_s`.

Scope: `collection_name.value`.

Primary key: `schema_name.value`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `schema_name` | `name` | Matches a row in `schemas` for the same collection. Also the primary key. |
| `format_type` | `vector<FORMAT_TYPE>` | Descriptive metadata per attribute: `{name, mediatype, info}`. `name` must match an existing `schemas.format` attribute name; `mediatype`/`info` are free-form, unvalidated strings. |

Written only by `setschematyp`, which fully replaces the row's `format_type` vector on every call (not additive). Never passes through `atomicdata::serialize`/`deserialize`; these are plain ABI-serialized rows, not custom-binary blobs. Changed in V2: this table does not exist in V1.

Source: `include/atomicassets.hpp:373-379`, `src/atomicassets.cpp:514-565` (`setschematyp`)

## templates

Contract table name: `templates`. C++ struct: `templates_s`.

Scope: `collection_name.value`.

Primary key: `(uint64_t) template_id`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `template_id` | `int32_t` | Assigned from the contract-wide `config.template_counter` (starts at 1): unique across the whole contract, not per collection. Cast to `uint64_t` for the primary key. |
| `schema_name` | `name` | The schema `immutable_serialized_data` is encoded against. |
| `transferable` | `bool` | Inherited by every asset minted from this template; blocks `transfer`, `createoffer`, and `acceptoffer` for the asset when false. |
| `burnable` | `bool` | Inherited by every asset minted from this template. `burnable || transferable` is enforced at creation; both false is rejected. |
| `max_supply` | `uint32_t` | 0 means unlimited. Set at creation, only ever lowered afterward (`locktemplate`, `redtemplmax`). |
| `issued_supply` | `uint32_t` | Incremented by every `mintasset` against this template; must stay `< max_supply` when `max_supply > 0`. Also the value `deltemplate` requires to be exactly 0. |
| `immutable_serialized_data` | `vector<uint8_t>` | Set once at `createtempl`/`createtempl2`; no action changes it afterward. |

Source: `include/atomicassets.hpp:383-394`, `src/atomicassets.cpp:566-696` (create/lock/reduce/delete actions), `src/atomicassets.cpp:1613-1689` (`internal_create_template`)

Live chain example (`scope=farmersworld`, `table=templates`, `lower_bound=260638`, byte field elided):

```json
{"template_id": 260638, "schema_name": "memberships", "transferable": 1, "burnable": 1,
 "max_supply": 0, "issued_supply": 627729}
```

## templates2 (V2)

Contract table name: `templates2`. C++ struct: `template_mutables_s`.

Scope: `collection_name.value`.

Primary key: `(uint64_t) template_id`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `template_id` | `int32_t` | Matches a row in `templates` for the same collection. Cast to `uint64_t` for the primary key. |
| `schema_name` | `name` | Matches the corresponding `templates` row's `schema_name`. |
| `mutable_serialized_data` | `vector<uint8_t>` | The template's mutable attribute data, encoded against `schema_name`'s format. |

A row exists only while the template's mutable data is non-empty: `settempldata` erases the row when called with an empty map, and `createtempl2` only creates one when given non-empty `mutable_data`. Its absence means "no mutable template data set for this template," not "empty bytes for it." Changed in V2: this table (and the whole idea of mutable template data) does not exist in V1; `createtempl` there is the only creation action, and every template's data is fixed forever.

Source: `include/atomicassets.hpp:398-405`, `src/atomicassets.cpp:583-599` (`createtempl2`), `src/atomicassets.cpp:846-913` (`settempldata`)

## assets

Contract table name: `assets`. C++ struct: `assets_s`.

Scope: `owner.value` (the asset's current owner).

Primary key: `asset_id`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `asset_id` | `uint64_t` | Assigned from the contract-wide `config.asset_counter`, starting at 2^40 (1099511627776). Also the primary key. |
| `collection_name` | `name` | Fixed at mint time. |
| `schema_name` | `name` | Fixed at mint time. |
| `template_id` | `int32_t` | `-1` for a schemaless/templateless asset, otherwise a `templates` row in `collection_name`. |
| `ram_payer` | `name` | Who currently pays for this row's RAM; independent of `owner` (the scope). Changed on `transfer`/`acceptoffer` (to the receiving side or the offer's designated payer), `setassetdata` (to the editor), and via the V2 `setrampayer`/`setlastpayer` actions. |
| `backed_tokens` | `vector<asset>` | Legacy V1 field. Always empty on any asset minted under V2, since both `mintasset`'s backing path and `backasset` unconditionally fail; non-empty only on assets minted before the V2 backing deprecation. `burnasset` still credits any leftover value to the owner's `balances` row. |
| `immutable_serialized_data` | `vector<uint8_t>` | Set once at `mintasset`; never changed by any later action; copied verbatim on every transfer. |
| `mutable_serialized_data` | `vector<uint8_t>` | Set at `mintasset`; the only one of the two data fields an authorized editor can change later, via `setassetdata`. |

Source: `include/atomicassets.hpp:409-421`, `src/atomicassets.cpp:697-788` (`mintasset`), `src/atomicassets.cpp:796-845` (`setassetdata`), `src/atomicassets.cpp:1096-1177` (`burnasset`), `src/atomicassets.cpp:1665-1761` (`internal_transfer`)

Live chain example (`scope=farmersworld`, `table=assets`, one row, byte fields elided):

```json
{"asset_id": "1099548972304", "collection_name": "farmersworld", "schema_name": "tools",
 "template_id": 203881, "ram_payer": "farmersworld", "backed_tokens": []}
```

## offers

Contract table name: `offers`. C++ struct: `offers_s`.

Scope: `get_self()`.

Primary key: `offer_id`.

Secondary indexes: `sender` (`sender.value`, index name `sender`), `recipient` (`recipient.value`, index name `recipient`).

| Column | Type | Meaning |
| --- | --- | --- |
| `offer_id` | `uint64_t` | Assigned from the contract-wide `config.offer_counter` (starts at 1). Also the primary key. |
| `sender` | `name` | The account that created the offer; the only account that can `canceloffer` it. |
| `recipient` | `name` | The account the offer was sent to; the only account that can `acceptoffer`/`declineoffer` it. |
| `sender_asset_ids` | `vector<uint64_t>` | Assets `sender` is offering, must currently belong to `sender`. |
| `recipient_asset_ids` | `vector<uint64_t>` | Assets requested from `recipient`, must currently belong to `recipient`. At least one of `sender_asset_ids`/`recipient_asset_ids` must be non-empty. |
| `memo` | `string` | Up to 256 characters. |
| `ram_payer` | `name` | Who currently pays for this row's RAM; reassignable to any account via `payofferram` regardless of that account's relationship to the offer. |

Source: `include/atomicassets.hpp:424-442`, `src/atomicassets.cpp:1185-1401` (`createoffer` through `payofferram`)

Live chain example (`scope=atomicassets`, `table=offers`, one row):

```json
{"offer_id": 7, "sender": "b1", "recipient": "atomicmarket",
 "sender_asset_ids": ["1099511627887"], "recipient_asset_ids": [], "memo": "sale", "ram_payer": "res.pink"}
```

## balances

Contract table name: `balances`. C++ struct: `balances_s`.

Scope: `get_self()`.

Primary key: `owner.value`.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `owner` | `name` | The account the balance belongs to. Also the primary key. |
| `quantities` | `vector<asset>` | One entry per announced token symbol. An entry is added by `announcedepo` (as a zero amount) or incremented by a deposit; an entry is removed entirely once its amount reaches exactly zero via `withdraw`, and the whole row is erased if that was the last entry. A given (owner, symbol) pair that hits zero this way needs `announcedepo` called again before it can receive further deposits, even if the row still exists for other symbols. |

Source: `include/atomicassets.hpp:445-451`, `src/atomicassets.cpp:990-1039` (`announcedepo`), `src/atomicassets.cpp:1040-1078` (`withdraw`), `src/atomicassets.cpp:1402-1444` (`receive_token_transfer`), `src/atomicassets.cpp:1768-1801` (`internal_decrease_balance`)

Live chain example (`scope=atomicassets`, `table=balances`, three rows):

```json
{"owner": ".xl4c.c.wam", "quantities": ["0.00000001 WAX"]},
{"owner": "1ln14.wam", "quantities": ["1.00000000 WAX"]},
{"owner": "1pixel1pixel", "quantities": ["496.10000000 WAX"]}
```

## config

Contract table name: `config`. C++ struct: `config_s`. EOSIO `singleton`.

Scope: `get_self()`. No user-visible primary key beyond the singleton's own fixed key.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `asset_counter` | `uint64_t` | Next `asset_id` to assign. Default 1099511627776 (2^40). |
| `template_counter` | `int32_t` | Next `template_id` to assign. Default 1. |
| `offer_counter` | `uint64_t` | Next `offer_id` to assign. Default 1. |
| `collection_format` | `vector<FORMAT>` | The single, contract-wide format every collection's `serialized_data` is encoded against. Extendable only via `admincoledit` (contract-authorization gated), append-only. |
| `supported_tokens` | `vector<extended_symbol>` | `(contract, symbol)` pairs eligible for `announcedepo`/deposit/withdraw. Extendable only via `addconftoken`; enforces symbol-level uniqueness, not pair-level, so one symbol can only ever be backed by one contract at a time. |

Source: `include/atomicassets.hpp:454-461`, `src/atomicassets.cpp:8-12` (`init`), `src/atomicassets.cpp:18-69` (`admincoledit`, `addconftoken`)

Live chain example (`scope=atomicassets`, `table=config`):

```json
{"asset_counter": "1099997777790", "template_counter": 907158, "offer_counter": 182295884,
 "collection_format": [{"name": "name", "type": "string"}, {"name": "img", "type": "ipfs"}, "..."],
 "supported_tokens": [{"sym": "8,WAX", "contract": "eosio.token"}, {"sym": "4,PGL", "contract": "prospectorsw"}]}
```

## tokenconfigs

Contract table name: `tokenconfigs`. C++ struct: `tokenconfigs_s`. EOSIO `singleton`.

Scope: `get_self()`. No user-visible primary key beyond the singleton's own fixed key.

Secondary indexes: none.

| Column | Type | Meaning |
| --- | --- | --- |
| `standard` | `name` | Constant `atomicassets`, set at `init` and never changed by any action. |
| `version` | `string` | Contract-reported semver: defaults to `2.0.0` at `init` for this source tree, overwritten manually via `setversion`. Not auto-updated by `setcode`; it reflects whatever the deploying operator last set. |

Live-chain status: see `reference/atomicassets/v2-upgrade.md` ("Deployment status").

Source: `include/atomicassets.hpp:464-468`, `src/atomicassets.cpp:8-12` (`init`), `src/atomicassets.cpp:41-49` (`setversion`)

## Table scoping summary

| Table | Contract name | Scope | Primary key | Secondary indexes |
| --- | --- | --- | --- | --- |
| Author swaps (V2) | `authorswaps` | `get_self()` | `collection_name` | none |
| Collections | `collections` | `get_self()` | `collection_name` | none |
| Schemas | `schemas` | `collection_name` | `schema_name` | none |
| Schema type descriptors (V2) | `schematypes` | `collection_name` | `schema_name` | none |
| Templates | `templates` | `collection_name` | `template_id` | none |
| Template mutable data (V2) | `templates2` | `collection_name` | `template_id` | none |
| Assets | `assets` | `owner` | `asset_id` | none |
| Offers | `offers` | `get_self()` | `offer_id` | `sender`, `recipient` |
| Fungible token balances | `balances` | `get_self()` | `owner` | none |
| Config | `config` | `get_self()` | singleton | none |
| Token/version info | `tokenconfigs` | `get_self()` | singleton | none |

Source: `include/atomicassets.hpp:337-495` (table and table-fetch definitions)
