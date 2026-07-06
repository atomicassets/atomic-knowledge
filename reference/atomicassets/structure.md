---
scope: The atomicassets data model - collections, schemas, templates, and assets - and the authorization model governing them
depends-on: []
key-modules: ["atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp, include/atomicassets.hpp"]
---

# AtomicAssets data model structure

The `atomicassets` contract organizes NFTs in four levels: collections group schemas and templates and hold the authorization rules, schemas declare the attribute formats a collection's data serializes to, templates carry immutable data shared by many assets, and assets are the individual token instances. Baseline behavior below is V2, tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets: `include/atomicassets.hpp`, `src/atomicassets.cpp`); "Changed in V2" notes call out where V1 differs enough to matter to an integrator.

## Collections

A collection is the top-level grouping: every schema, template, and asset belongs to exactly one collection, and the collection's `authorized_accounts` list is the authorization boundary for creating and editing them.

The `collections` table is scoped to the contract's own account (`get_self()`), keyed by `collection_name`, with one row per collection:

- `author` - the account with full control over the collection.
- `allow_notify` / `notify_accounts` - up to 24 accounts (`notify_accounts.size() <= 24`, checked in `createcol` and `addnotifyacc`) that get `require_recipient` notifications on relevant actions for this collection. Accounts can only be added while `allow_notify` is true.
- `authorized_accounts` - up to 24 accounts (`authorized_accounts.size() <= 24`, checked in `createcol` and `addcolauth`) allowed to create and edit schemas, templates, and assets in the collection.
- `market_fee` - a double between 0 and 0.15 (`MAX_MARKET_FEE`), read by AtomicMarket for sale fee calculation.
- `serialized_data` - the collection's own attribute data (name, description, images, and so on), serialized against a format that is process-wide, not per-collection: it lives in the single `config` singleton's `collection_format` field and is extended contract-wide via the `admincoledit` action, which requires the contract account's own authorization.

Collection names must be 12 characters, unless the name has an existing EOSIO account of that name (whose own authorization is then required) or a name with a dot-suffix (whose suffix authorization is required). This lets a collection ride on an existing account's or a name-suffix's naming authority instead of the flat 12-character rule.

Changed in V2: author swaps. `createauswap` / `acceptauswap` / `rejectauswap` and the `authorswaps` table let a collection's `author` field be reassigned to a different account. The `acceptance_date` stored at creation is `now` for a swap created under the author's `owner` permission, or `now + AUTHOR_SWAP_TIME_DELTA` (7 days) for one created under `active` permission; `acceptauswap` then requires `now > acceptance_date` and `now < acceptance_date + AUTHOR_SWAP_TIME_DELTA`. Measured from creation, the acceptance window is therefore immediately through +7 days for an `owner`-permission swap, or +7 days through +14 days for an `active`-permission swap. (The action's own source comment says swaps "remain valid for up to 3 weeks"; that does not match the computed one-or-two-week behavior, so this states the computed behavior.) V1 has no such mechanism - collection authorship there is fixed at creation.

Source: `include/atomicassets.hpp:348-359` (collections table), `include/atomicassets.hpp:14` (`AUTHOR_SWAP_TIME_DELTA`), `include/atomicassets.hpp:13` (`MAX_MARKET_FEE`), `src/atomicassets.cpp:91-158` (createcol naming and validation), `src/atomicassets.cpp:127-128` (24-account caps), `src/atomicassets.cpp:194-217` (addcolauth), `src/atomicassets.cpp:254-279` (addnotifyacc, allow_notify gate), `src/atomicassets.cpp:357-442` (author swap actions)

## Schemas

A schema is a named, ordered list of attribute definitions (`FORMAT { name, type }` pairs) that says how a collection's templates and assets serialize their data. Schemas are scoped to their collection (`schemas` table scope = `collection_name`, keyed by `schema_name`).

A schema must include a `{"name": "name", "type": "string"}` line - every schema has a mandatory `name` attribute - and every attribute name inside a schema must be unique. Schema names are 1-12 characters.

Schemas can only be extended, never edited retroactively: `extendschema` appends new `FORMAT` lines to the end of the existing vector, and `check_format` re-validates the whole extended vector, but no action can remove or reorder existing lines. This is a deliberate contract-level guarantee: the binary serialization format identifies each attribute by its position in the format vector (see data-precedence.md), so reordering or removing a line would silently corrupt every template and asset already serialized against that schema.

Changed in V2: schema type descriptors. The `schema_types` table (`setschematyp` action) attaches an optional `FORMAT_TYPE { name, mediatype, info }` per attribute - a human-readable description and, for binary-carrying types, a media type hint (for example marking an `ipfs` attribute as a `.glb` 3D model). It is metadata only: it does not affect serialization and every named attribute must already exist in the schema's `format`. V1 has no equivalent table.

Source: `include/atomicdata.hpp:35-44` (`FORMAT`, `FORMAT_TYPE`), `include/checkformat.hpp:32-97` (`check_format`), `include/checkformat.hpp:95-96` (mandatory name/string line), `include/checkformat.hpp:89-90` (uniqueness), `include/atomicassets.hpp:363-379` (schemas and schema_types tables), `src/atomicassets.cpp:450-475` (createschema), `src/atomicassets.cpp:482-506` (extendschema, append-only), `src/atomicassets.cpp:514-560` (setschematyp)

Live chain observation (wax.greymass.com `get_table_rows`, `code=atomicassets`, `scope=alien.worlds`, `table=schemas`): the `faces.worlds`-adjacent schema `arms.worlds` returns `format: [{"name":"cardid","type":"uint16"}, {"name":"name","type":"string"}, {"name":"img","type":"image"}, ...]` - an ordered vector matching this layout exactly.

## Templates

A template stores attribute data shared by every asset minted against it, so that data doesn't have to be duplicated (and re-paid for in RAM) per asset. Templates are scoped to their collection (`templates` table scope = `collection_name`), keyed by `template_id`, an `int32_t` assigned from a single contract-wide counter (`config.template_counter`, starting at 1); template IDs are unique across the whole contract, not scoped per collection.

A template's fields: `schema_name` it serializes against, `transferable` / `burnable` flags that every asset minted from it inherits, `max_supply` (0 means unlimited) and `issued_supply` (incremented on every `mintasset` against it, and checked against `max_supply`), and `immutable_serialized_data`. `locktemplate` sets `max_supply` to the current `issued_supply` (freezing it), and `redtemplmax` can lower `max_supply`: the new value must be positive, at or above `issued_supply` (the check is `issued_supply <= new_max_supply`, so equality is allowed), and strictly below the current `max_supply` - except when the current cap is 0 (unlimited), in which case any positive value is accepted as the first finite cap. A template can be deleted with `deltemplate` only while `issued_supply` is still zero.

Templates are optional: `mintasset` accepts `template_id = -1` to mint a schemaless asset that carries only its own asset-level data.

Changed in V2: mutable template data. The `template_mutables` table (contract table name `templates2`), scoped like `templates` by `collection_name` and keyed by the same `template_id`, holds a `mutable_serialized_data` field that can be set at creation (`createtempl2`) or changed later (`settempldata`). A template row here only exists once non-empty mutable data has been set; `settempldata` with an empty map erases the row instead of leaving an empty one. V1 templates have no mutable data at all - `createtempl` is the only creation action there, and every template's data is fixed forever at creation.

Source: `include/atomicassets.hpp:383-405` (templates and template_mutables tables), `include/atomicassets.hpp:456` (template_counter default), `src/atomicassets.cpp:566-594` (createtempl / createtempl2), `src/atomicassets.cpp:600-624` (deltemplate), `src/atomicassets.cpp:631-653` (locktemplate), `src/atomicassets.cpp:661-689` (redtemplmax), `src/atomicassets.cpp:846-907` (settempldata, emplace/modify/erase branching), `src/atomicassets.cpp:1579-1655` (internal_create_template)

Live chain observation (wax.greymass.com, `scope=alien.worlds`, `table=templates`): template `13728` returns `max_supply: 403, issued_supply: 403` (locked at its cap) alongside its `immutable_serialized_data` byte vector; template `17453` shows `max_supply: 0` (unlimited) with `issued_supply: 415`.

## Assets

An asset is one token instance. Assets are scoped to their current owner (`assets` table scope = `owner`), keyed by `asset_id`, a `uint64_t` assigned from a single contract-wide counter (`config.asset_counter`, starting at 2^40 - chosen to stay clear of the low ID range other contracts and token standards commonly use).

An asset's fields: `collection_name` and `schema_name` (fixed at mint time), `template_id` (-1 if none), `ram_payer` (who currently pays for the row's RAM - updated on transfer and on `setassetdata`), `backed_tokens` (a legacy field; native token backing is deprecated in V2 and `backasset` always fails), `immutable_serialized_data` (set once at mint, never changed again), and `mutable_serialized_data` (set at mint, replaceable via `setassetdata`).

Changed in V2: RAM-payer reassignment. Two actions let an asset's `ram_payer` be reassigned without a transfer, replacing an abandoned custodial-rentals design that never shipped. See `reference/atomicassets/actions.md` ("RAM-payer reassignment (replaces descoped custodial rentals)"). V1 has neither the reassignment actions nor the abandoned design.

Source: `include/atomicassets.hpp:409-421` (assets table), `include/atomicassets.hpp:455` (asset_counter default), `src/atomicassets.cpp:697-788` (mintasset), `src/atomicassets.cpp:796-836` (setassetdata), `src/atomicassets.cpp:1079-1087` (backasset deprecated)

Live chain observation (wax.api.atomicassets.io `/atomicassets/v1/assets?collection_name=alien.worlds&template_id=13728`): asset `1099511946686`, owned by `wombatmaster`, carries empty `immutable_data` and `mutable_data` objects of its own - all of its displayed attributes come from the template (see data-precedence.md).

## Authorization and the 24-account cap

Three levels of authority operate over a collection and everything scoped under it:

- **Collection author** (`collections.author`) - the only account that can call `setcoldata`, `addcolauth` / `remcolauth`, `addnotifyacc` / `remnotifyacc`, `setmarketfee`, `forbidnotify`, and initiate an author swap. `forbidnotify` is one-way: once `allow_notify` is false, no action sets it back to true, so `notify_accounts` can never be populated again for that collection (it must also already be empty when `forbidnotify` is called).
- **Authorized accounts** (`collections.authorized_accounts`, capped at 24) - can create and edit schemas, templates, and assets belonging to the collection. Every action gated this way calls `check_has_collection_auth(account, collection_name)`, which both requires the caller's own authorization and checks list membership; it does not require being the author.
- **Notify accounts** (`collections.notify_accounts`, capped at 24, gated by `allow_notify`) - not authorization at all, but a `require_recipient` notification list: every relevant action for the collection will attempt to notify these accounts' smart contracts, so a notify account with a throwing `on_notify` handler can block the action. The 24-account cap on both lists exists partly to bound the low-level partial-row read the contract uses to check membership without deserializing a collection's full (and potentially multi-kilobyte) `serialized_data`. This cap is new in V2 for `notify_accounts`: V1's `addnotifyacc` enforced no limit on the list's size.

Source: `src/atomicassets.cpp:167-442` (author-only and auth-gated actions), `src/atomicassets.cpp:1823-1888` (`partial_read_collection`, `check_has_collection_auth`, `notify_collection_accounts`), `src/atomicassets.cpp:127-128` (24-account cap, createcol), `src/atomicassets.cpp:212` (24-account cap, addcolauth), `src/atomicassets.cpp:274` (24-account cap, addnotifyacc)

## Table scoping summary

| Table | Contract name | Scope | Primary key |
| --- | --- | --- | --- |
| Collections | `collections` | `get_self()` | `collection_name` |
| Author swaps (V2) | `authorswaps` | `get_self()` | `collection_name` |
| Schemas | `schemas` | `collection_name` | `schema_name` |
| Schema type descriptors (V2) | `schematypes` | `collection_name` | `schema_name` |
| Templates | `templates` | `collection_name` | `template_id` |
| Template mutable data (V2) | `templates2` | `collection_name` | `template_id` |
| Assets | `assets` | `owner` | `asset_id` |
| Offers | `offers` | `get_self()` | `offer_id` (secondary indexes on `sender`, `recipient`) |
| Fungible token balances | `balances` | `get_self()` | `owner` |
| Config | `config` | `get_self()` | singleton |
| Token/version info | `tokenconfigs` | `get_self()` | singleton |

Source: `include/atomicassets.hpp:337-489` (table and table-fetch definitions)
