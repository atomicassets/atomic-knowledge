# AtomicAssets actions

Complete action reference for the `atomicassets` contract, baselined on tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both `wax-testnet` and `jungle4-testnet` in the atomichub monorepo's `contracts/chain-config.json`). Every entry cites its declaration in `include/atomicassets.hpp` and its body in `src/atomicassets.cpp`. "Changed in V2" notes compare against the V1 source (`contracts/atomicassets-contract` in the atomichub monorepo).

WAX mainnet was still running V1 at the time of writing: a live `get_abi` read against `atomicassets` on `wax.greymass.com` returns a 35-action ABI matching the V1 list below exactly, and its `tokenconfigs` row reports `version: "1.2.3"`. None of the V2-only actions on this page are callable there yet.

A repository clone at an uncommitted working-tree commit (branch `dev-production-3`) contains an earlier, abandoned custodial-rentals design: a `move` action, a `logmove` notification action, and a `holders` table. That design was descoped before `v2.0.0-rc1` and does not exist in any tagged V2 release; `setrampayer`, `setlastpayer`, and `logrampayer` (documented below) are what shipped in its place. Do not treat `move`/`logmove`/`holders` as part of V2.

## Admin

Every action in this group requires the authorization of the contract account itself (`require_auth(get_self())`), so only the deploying operator (or whoever holds that permission) can call them.

### init

No parameters.

Creates the `config` and `tokenconfigs` singletons with their defaults if they do not already exist (`get_or_create`), so a repeat call is a safe no-op. Run once per deployment.

Source: include/atomicassets.hpp:22, src/atomicassets.cpp:8-12.

### admincoledit

- `collection_format_extension: vector<FORMAT>`: at least one line.

Appends one or more lines to `config.collection_format`, the single, contract-wide format every collection's own `serialized_data` is encoded against. The full, extended format is re-validated with `check_format`, so a new line still needs a unique name and a valid type string, and the format still needs to contain a `{"name": "name", "type": "string"}` line (already true from genesis). Existing lines are never removed or reordered: identifiers in already-serialized collection data are positions in this vector, so removing or reordering a line would repoint every collection's stored bytes at the wrong attribute.

Source: include/atomicassets.hpp:24, src/atomicassets.cpp:18-34.

### setversion

- `new_version: string`

Overwrites `tokenconfigs.version` with an arbitrary string. Not auto-updated by `setcode`; the deploying operator calls this manually to record the running contract's semver.

Source: include/atomicassets.hpp:26, src/atomicassets.cpp:41-49.

### addconftoken

- `token_contract: name`
- `token_symbol: symbol`

Appends a `(token_contract, token_symbol)` pair to `config.supported_tokens`, the whitelist `announcedepo`/deposits/`withdraw` check against. Uniqueness is enforced by symbol alone, not by the `(contract, symbol)` pair: a second registration of a symbol already on the list is rejected even if it names a different token contract, so only one contract can ever back a given symbol precision/code combination at a time.

Source: include/atomicassets.hpp:28, src/atomicassets.cpp:56-69.

## Collections

Three distinct authority levels operate over a collection, and it matters which one a given action requires:

- **Author** (`collections.author`): the only account that can call `setcoldata`, `addcolauth`/`remcolauth`, `addnotifyacc`/`remnotifyacc`, `setmarketfee`, `forbidnotify`, and start an author swap.
- **Authorized accounts** (`collections.authorized_accounts`, up to 24): can create and edit schemas, templates, and assets. Every action gated this way calls `check_has_collection_auth(account, collection_name)`, documented once here rather than repeated per action: it requires the caller's own signature and checks list membership, and it does not require being the author.
- **Notify accounts** (`collections.notify_accounts`, up to 24, only while `allow_notify` is true): not an authorization level, a `require_recipient` fan-out list. See `reference/atomicassets/notifications.md`.

### createcol

- `author: name`
- `collection_name: name`
- `allow_notify: bool`
- `authorized_accounts: vector<name>`: up to 24, each an existing account, no duplicates.
- `notify_accounts: vector<name>`: up to 24, each an existing account, no duplicates; must be empty unless `allow_notify` is true.
- `market_fee: double`: `0 <= market_fee <= 0.15`.
- `data: ATTRIBUTE_MAP`

Required authorization: `author`.

Creates a `collections` row. `collection_name` must be one of three things: an existing account name (that account's own authorization is then additionally required), a dot-suffixed name (the suffix account's authorization is required), or a plain 12-character name with no dot (no extra authorization beyond `author`'s own). Sends no notification of any kind; `notify_accounts` only starts receiving fan-out once a later action touches the collection.

Source: include/atomicassets.hpp:45-53, src/atomicassets.cpp:91-166.

### setcoldata

- `collection_name: name`
- `data: ATTRIBUTE_MAP`

Required authorization: the collection's `author`.

Re-serializes `collections.serialized_data` against the current `config.collection_format`. No notification is sent.

Source: include/atomicassets.hpp:47-50, src/atomicassets.cpp:167-193.

### addcolauth / remcolauth

- `collection_name: name`
- `account_to_add` / `account_to_remove: name`

Required authorization: the collection's `author`.

`addcolauth` appends to `authorized_accounts` (must not already be present, target account must exist, capped at 24 total). `remcolauth` removes an entry that must currently be present. Neither sends a notification.

Source: include/atomicassets.hpp:52-60, src/atomicassets.cpp:194-253.

### addnotifyacc / remnotifyacc

- `collection_name: name`
- `account_to_add` / `account_to_remove: name`

Required authorization: the collection's `author`.

`addnotifyacc` requires `allow_notify` to be true, appends to `notify_accounts` (target must exist, must not already be present, capped at 24 total). `remnotifyacc` removes an entry that must currently be present. Neither sends a notification of its own.

Source: include/atomicassets.hpp:62-70, src/atomicassets.cpp:254-311.

### setmarketfee

- `collection_name: name`
- `market_fee: double`: `0 <= market_fee <= 0.15`.

Required authorization: the collection's `author`.

Overwrites `collections.market_fee`, the fee AtomicMarket reads live at settlement time (see `reference/atomicmarket/fees-and-royalties.md`). No notification is sent.

Source: include/atomicassets.hpp:72-75, src/atomicassets.cpp:312-334.

### forbidnotify

- `collection_name: name`

Required authorization: the collection's `author`.

Sets `allow_notify` to false. Requires `notify_accounts` to already be empty, and requires `allow_notify` to currently be true (a second call fails, since there is no action anywhere in the contract that sets `allow_notify` back to true). One-way and irreversible.

Source: include/atomicassets.hpp:77-79, src/atomicassets.cpp:335-356.

## Collection author succession (V2)

Changed in V2: this entire group, the `authorswaps` table, and the `AUTHOR_SWAP_TIME_DELTA` constant (604800 seconds, one week) do not exist in V1. Collection authorship there is fixed at `createcol` time with no reassignment path.

### createauswap

- `collection_name: name`
- `new_author: name`
- `owner: bool`

Required authorization: the collection's current `author`, at the `owner` permission level if `owner` is true, otherwise at any permission level satisfying `require_auth(author)` (in practice `active` or higher).

Creates an `authorswaps` row. Fails if a swap for this collection is already underway. `acceptance_date` is set to `now` if `owner` is true (immediately acceptable), or `now + 604800` (one week out) otherwise. This is the only place the two paths diverge; `acceptauswap`'s own window is identical either way.

Source: include/atomicassets.hpp:81-85, src/atomicassets.cpp:357-388.

### acceptauswap

- `collection_name: name`

Required authorization: the swap's `new_author`.

Reassigns `collections.author` to `new_author` and erases the `authorswaps` row. Only acceptable once `now > acceptance_date`, and only until `now < acceptance_date + 604800`. Combined with `createauswap`'s two paths, the full window measured from creation is: immediately through +7 days for an `owner`-permission swap, or +7 days through +14 days for an `active`-permission swap. (The action's own source comment claims swaps "remain valid for up to 3 weeks"; that does not match what the code computes, one or two weeks depending on path, so this page states the computed behavior rather than the comment.)

Source: include/atomicassets.hpp:87-89, src/atomicassets.cpp:389-423.

### rejectauswap

- `collection_name: name`

Required authorization: either the swap's `current_author` or its `new_author` (`has_auth` of either, checked with no time constraint).

Erases the `authorswaps` row without changing `collections.author`.

Source: include/atomicassets.hpp:91-93, src/atomicassets.cpp:424-449.

## Schemas

### createschema

- `authorized_creator: name`
- `collection_name: name`
- `schema_name: name`: 1-12 characters.
- `schema_format: vector<FORMAT>`

Required authorization: `authorized_creator`, checked via `check_has_collection_auth`.

Creates a `schemas` row scoped to `collection_name`. `schema_name` must not already exist in that scope; `schema_format` is validated by `check_format` (unique names, valid type strings, must include a `{"name": "name", "type": "string"}` line).

Source: include/atomicassets.hpp:103-108, src/atomicassets.cpp:450-481.

### extendschema

- `authorized_editor: name`
- `collection_name: name`
- `schema_name: name`
- `schema_format_extension: vector<FORMAT>`: at least one line.

Required authorization: `authorized_editor`, checked via `check_has_collection_auth`.

Appends lines to an existing schema's `format` and re-validates the whole extended vector with `check_format`. Existing lines are never removed or reordered, for the same on-chain-identifier reason as `admincoledit` above; see `reference/atomicassets/serialization.md` for why position matters.

Source: include/atomicassets.hpp:110-115, src/atomicassets.cpp:482-513.

### setschematyp (V2)

- `authorized_editor: name`
- `collection_name: name`
- `schema_name: name`
- `schema_format_type: vector<FORMAT_TYPE>`

Required authorization: `authorized_editor`, checked via `check_has_collection_auth`.

Emplaces or fully replaces the `schematypes` row for this schema (not additive: the whole `format_type` vector passed in replaces whatever was there). Every entry's `name` must be unique in the vector and must match an existing attribute name in the schema's `format`; `mediatype` and `info` are free-form, unvalidated strings. Metadata only, never touches serialization. Changed in V2: this action and its table do not exist in V1.

Source: include/atomicassets.hpp:117-122, src/atomicassets.cpp:514-565.

## Templates

### createtempl

- `authorized_creator: name`
- `collection_name: name`
- `schema_name: name`
- `transferable: bool`
- `burnable: bool`: `burnable || transferable` must hold; a template cannot be both non-transferable and non-burnable.
- `max_supply: uint32_t`: 0 means unlimited.
- `immutable_data: ATTRIBUTE_MAP`

Required authorization: `authorized_creator`, checked via `check_has_collection_auth`.

Creates a `templates` row keyed by a contract-wide `template_id` counter (`config.template_counter`, starting at 1: template ids are unique across the whole contract, not per collection). Delegates to `internal_create_template` with `mutable_data = {}`. Sends `lognewtempl`.

Source: include/atomicassets.hpp:124-132, src/atomicassets.cpp:566-582, 1613-1689 (`internal_create_template`).

### createtempl2 (V2)

Same parameters as `createtempl`, plus:

- `mutable_data: ATTRIBUTE_MAP`

Required authorization: `authorized_creator`, checked via `check_has_collection_auth`.

Identical to `createtempl`, except `internal_create_template` also receives `mutable_data`. If `mutable_data` is non-empty, it is written to a `templates2` row and a second inline action, `logsetdatatl` (with `old_data = {}`), is sent immediately after `lognewtempl`: one `createtempl2` call with non-empty mutable data produces two separate notification fan-outs in the same transaction, not one. Changed in V2: does not exist in V1, where every template's data is immutable forever after `createtempl`.

Source: include/atomicassets.hpp:126-135, src/atomicassets.cpp:583-599, 1613-1689.

### settempldata (V2)

- `authorized_editor: name`
- `collection_name: name`
- `template_id: int32_t`
- `new_mutable_data: ATTRIBUTE_MAP`

Required authorization: `authorized_editor`, checked via `check_has_collection_auth`.

Upserts the template's `templates2` row: emplaces it if absent and `new_mutable_data` is non-empty, modifies it if present and `new_mutable_data` is non-empty, and erases it if present and `new_mutable_data` is empty. A `templates2` row therefore only exists at all while the template currently has non-empty mutable data. Always sends `logsetdatatl` (with `old_data = {}` if no row existed before the call). Changed in V2: does not exist in V1.

Source: include/atomicassets.hpp:137-142, src/atomicassets.cpp:846-913.

### deltemplate (V2)

- `authorized_editor: name`
- `collection_name: name`
- `template_id: int32_t`

Required authorization: `authorized_editor`, checked via `check_has_collection_auth`.

Erases the `templates` row (and its `templates2` row, if any) only while `issued_supply == 0`. Sends no notification at all, unlike every other collection-editing action in this group: an indexer that only watches `notify_collection_accounts` fan-out will not observe a deletion, though it remains visible as the top-level action in the transaction trace. Changed in V2: does not exist in V1 (a V1 template, once created, can never be removed even with zero issued supply).

Source: include/atomicassets.hpp:144-148, src/atomicassets.cpp:600-630.

### locktemplate

- `authorized_editor: name`
- `collection_name: name`
- `template_id: int32_t`: must be `>= 0`.

Required authorization: `authorized_editor`, checked via `check_has_collection_auth`.

Sets `max_supply` to the current `issued_supply`, freezing further minting. Requires `issued_supply != 0` (at least one asset must already have been minted). Sends no notification.

Source: include/atomicassets.hpp:150-154, src/atomicassets.cpp:631-660.

### redtemplmax (V2)

- `authorized_editor: name`
- `collection_name: name`
- `template_id: int32_t`
- `new_max_supply: uint32_t`: must be `> 0`, must be `>= issued_supply`, and must be strictly less than the current `max_supply` unless the current `max_supply` is 0 (unlimited), in which case any positive value is accepted as the first finite cap.

Required authorization: `authorized_editor`, checked via `check_has_collection_auth`.

Lowers a template's `max_supply`. Once a finite cap has been set this way, every subsequent call must lower it further; there is no action that raises `max_supply` again. Sends no notification. Changed in V2: does not exist in V1.

Source: include/atomicassets.hpp:156-161, src/atomicassets.cpp:661-696.

## Assets

### mintasset

- `authorized_minter: name`
- `collection_name: name`
- `schema_name: name`
- `template_id: int32_t`: an existing template id, or `-1` for a schemaless/templateless asset.
- `new_asset_owner: name`: must be an existing account.
- `immutable_data: ATTRIBUTE_MAP`
- `mutable_data: ATTRIBUTE_MAP`
- `tokens_to_back: vector<asset>`: must be empty (see below).

Required authorization: `authorized_minter`, checked via `check_has_collection_auth`.

Creates an `assets` row scoped to `new_asset_owner`, keyed by a contract-wide `asset_counter` starting at 2^40 (1099511627776). If `template_id >= 0`, the template must exist, must belong to `schema_name`, and its `issued_supply` (incremented by this call) must stay within `max_supply` when `max_supply > 0`. RAM for the new row is paid by `authorized_minter`. Sends `logmint`. Changed in V2: `tokens_to_back` is checked *after* `logmint` is sent, and any non-empty value always fails with "Native backing has been deprecated on the AtomicAssets Contract": the parameter stays in the ABI for interface stability, but minting with backing no longer functions at all (in V1 it invoked `internal_back_asset` per token and actually moved deposited balance onto the new asset).

Source: include/atomicassets.hpp:171-180, src/atomicassets.cpp:697-788.

### setassetdata

- `authorized_editor: name`
- `asset_owner: name`
- `asset_id: uint64_t`
- `new_mutable_data: ATTRIBUTE_MAP`

Required authorization: `authorized_editor`, checked via `check_has_collection_auth` against the asset's own collection (not the caller's).

Re-serializes `assets.mutable_serialized_data` and reassigns `ram_payer` to `authorized_editor`: RAM for the row moves to whoever last edited it, not the original minter or current owner. Sends `logsetdata` with the deserialized old and new data, before the row is modified.

Source: include/atomicassets.hpp:174-179, src/atomicassets.cpp:796-845.

### setrampayer (V2)

- `new_payer: name`
- `asset_id: uint64_t`

Required authorization: `new_payer`.

Reassigns `ram_payer` on an asset the caller already owns (looked up in `new_payer`'s own scope) to `new_payer` itself. Fails if `new_payer` is already the `ram_payer`. Sends `logrampayer`. Changed in V2: does not exist in V1; part of the RAM-reassignment mechanism that replaced an earlier, unshipped custodial-rentals design (see the note at the top of this page).

Source: include/atomicassets.hpp:181-184, src/atomicassets.cpp:914-940.

### setlastpayer (V2)

- `owner: name`
- `collection_name: name`

Required authorization: `owner`.

Reassigns `ram_payer` to `owner` for the single highest-`asset_id` row currently in `owner`'s scope (the multi-index's last entry by primary-key order, `--owner_assets.end()`), not necessarily the most recently acquired asset if `owner` has since reacquired an older, lower-id asset. Asserts that this asset's `collection_name` matches the passed-in `collection_name` (so the caller must know which collection they expect to be claiming for) and fails if `owner` holds no assets at all, or already pays for that asset's RAM. Sends `logrampayer`. Changed in V2: does not exist in V1.

Source: include/atomicassets.hpp:186-189, src/atomicassets.cpp:943-976.

### announcedepo

- `owner: name`
- `symbol_to_announce: symbol`: must be in `config.supported_tokens`.

Required authorization: `owner`.

Opens a zero-balance entry for `symbol_to_announce` in `owner`'s `balances` row (creating the row if it doesn't exist). Must be called before the first deposit of a given token symbol, so that `owner` (not the contract) pays the row's RAM. Idempotent: calling it again for an already-announced symbol returns silently rather than erroring.

Source: include/atomicassets.hpp:192-195, src/atomicassets.cpp:990-1039.

### withdraw

- `owner: name`
- `token_to_withdraw: asset`: `amount > 0`.

Required authorization: `owner`.

Decreases `owner`'s `balances` entry for that symbol and sends a real token transfer back to `owner` from the corresponding registered contract. If the withdrawal brings that symbol's amount to exactly zero, its entry is removed from the `quantities` vector (and the whole `balances` row is erased if that was the only symbol present). A later deposit of that same symbol requires calling `announcedepo` again, even if the account's `balances` row still exists for other symbols, because the per-symbol entry itself is gone.

Source: include/atomicassets.hpp:197-200, src/atomicassets.cpp:1040-1078, 1768-1801 (`internal_decrease_balance`).

### backasset

- `payer: name`
- `asset_owner: name`
- `asset_id: uint64_t`
- `token_to_back: asset`

Required authorization: none checked; the action body is `check(false, "Native backing has been deprecated on the AtomicAssets Contract")` unconditionally.

Changed in V2: in V1 this action moved deposited balance from `payer` onto an asset's `backed_tokens` (via `internal_back_asset`). In V2 it always reverts regardless of the arguments supplied; it remains in the ABI only for interface compatibility.

Source: include/atomicassets.hpp:202-207, src/atomicassets.cpp:1079-1087.

### burnasset

- `asset_owner: name`
- `asset_id: uint64_t`

Required authorization: `asset_owner`.

Erases the `assets` row. If the asset is templated, the template's `burnable` flag must be true. Any `backed_tokens` still on the row (only possible on assets that predate the V2 backing deprecation) are credited into `asset_owner`'s `balances` row. Sends `logburnasset` with the full pre-burn state (collection, schema, template id, backed tokens, both data layers, prior ram_payer) before erasing the row.

Source: include/atomicassets.hpp:209-212, src/atomicassets.cpp:1096-1177.

## Transfers and offers

### transfer

- `from: name`
- `to: name`
- `asset_ids: vector<uint64_t>`: non-empty, no duplicates.
- `memo: string`: up to 256 characters.

Required authorization: `from`.

Notifies `from` and `to` directly via `require_recipient`, then calls `internal_transfer`, which: requires `to` to exist and differ from `from`; requires every asset to currently belong to `from` and, if templated, to have `transferable = true`; and, if this is the first asset `to` has ever held (an empty scope), makes `from` pay for the new scope's RAM by emplacing and immediately erasing a placeholder row (so the action fails outright if `from` cannot cover that RAM). Sends one `logtransfer` per distinct collection touched by the batch (grouped by `std::map<name, ...>` key order, not caller-supplied order), each of which fans out to that collection's `notify_accounts`.

Source: include/atomicassets.hpp:30-35, src/atomicassets.cpp:76-86, 1665-1761 (`internal_transfer`).

### createoffer

- `sender: name`
- `recipient: name`: must exist, must differ from `sender`.
- `sender_asset_ids: vector<uint64_t>`: internally duplicate-free.
- `recipient_asset_ids: vector<uint64_t>`: internally duplicate-free; at least one of the two id lists must be non-empty.
- `memo: string`: up to 256 characters.

Required authorization: `sender`.

Creates an `offers` row keyed by a global `offer_counter`. Every listed asset must currently belong to the side it's listed under and, if templated, be `transferable`. Sends `lognewoffer`, which notifies `sender` and `recipient` directly.

Source: include/atomicassets.hpp:215-221, src/atomicassets.cpp:1185-1279.

### canceloffer

- `offer_id: uint64_t`

Required authorization: the offer's `sender` only (not the `recipient`).

Erases the offer row. Sends no notification of any kind, to either party.

Source: include/atomicassets.hpp:223-225, src/atomicassets.cpp:1280-1298.

### acceptoffer

- `offer_id: uint64_t`

Required authorization: the offer's `recipient` only.

Notifies `sender` and `recipient` directly via `require_recipient` (not through a log action), then executes both legs through `internal_transfer`: `recipient`'s listed assets move to `sender` with `sender` (specifically the offer's own `ram_payer`, which may have been reassigned by `payofferram`) covering any new-scope RAM, and `sender`'s listed assets move to `recipient` with `recipient` covering any new-scope RAM. Erases the offer row. Each leg's `internal_transfer` call still sends its own per-collection `logtransfer` actions.

Source: include/atomicassets.hpp:227-229, src/atomicassets.cpp:1299-1357.

### declineoffer

- `offer_id: uint64_t`

Required authorization: the offer's `recipient` only.

Erases the offer row. Sends no notification of any kind.

Source: include/atomicassets.hpp:231-233, src/atomicassets.cpp:1358-1376.

### payofferram

- `payer: name`
- `offer_id: uint64_t`

Required authorization: `payer` only (no relationship to the offer's `sender` or `recipient` is checked).

Erases the offer row and re-emplaces an identical copy with `ram_payer` set to `payer`, moving the row's RAM bill to `payer` without touching any of its other fields. Intended for a dapp to sponsor the RAM of offers its users create. Sends no notification.

Source: include/atomicassets.hpp:235-238, src/atomicassets.cpp:1377-1401.

## Token deposit notification handler

### receive_token_transfer

- `from: name`
- `to: name`
- `quantity: asset`
- `memo: string`

Not a regular action: declared `[[eosio::on_notify("*::transfer")]]`, so it runs as a notification handler on every incoming `transfer` action from any contract, matched by wildcard code.

Returns immediately if `to != get_self()`. Otherwise requires the `(get_first_receiver(), quantity.symbol)` pair to match an entry in `config.supported_tokens` (both the sending contract and the symbol must match a registered pair, not just the symbol), requires `memo` to be exactly the literal string `"deposit"` (anything else, including an empty memo, fails the whole incoming transfer), and requires `from` to already have an `announcedepo`'d `balances` entry for that exact symbol. On success, credits the deposited amount into that entry.

Source: include/atomicassets.hpp:238-243, src/atomicassets.cpp:1402-1444.

## Notification actions (contract-internal)

Every action in this group requires `require_auth(get_self())`: they can only run as inline actions dispatched by another action in the same contract, never as a directly submitted top-level action. Each one exists to carry a stable, self-contained event payload for indexers and, in most cases, to run `notify_collection_accounts` and/or `require_recipient` for the parties involved. See `reference/atomicassets/notifications.md` for the full "which action notifies whom" picture.

### logtransfer

- `collection_name: name`
- `from: name`
- `to: name`
- `asset_ids: vector<uint64_t>`
- `memo: string`

Sent by `internal_transfer` (used by both `transfer` and `acceptoffer`), once per distinct collection in the batch. Calls `notify_collection_accounts(collection_name)`.

Source: include/atomicassets.hpp:247-253, src/atomicassets.cpp:1445-1456.

### lognewoffer

- `offer_id: uint64_t`
- `sender: name`
- `recipient: name`
- `sender_asset_ids: vector<uint64_t>`
- `recipient_asset_ids: vector<uint64_t>`
- `memo: string`

Sent by `createoffer`. Calls `require_recipient(sender)` and `require_recipient(recipient)`.

Source: include/atomicassets.hpp:255-262, src/atomicassets.cpp:1457-1471.

### lognewtempl

- `template_id: int32_t`
- `authorized_creator: name`
- `collection_name: name`
- `schema_name: name`
- `transferable: bool`
- `burnable: bool`
- `max_supply: uint32_t`
- `immutable_data: ATTRIBUTE_MAP`

Sent by `internal_create_template` (used by both `createtempl` and `createtempl2`). Calls `notify_collection_accounts(collection_name)`.

Source: include/atomicassets.hpp:264-273, src/atomicassets.cpp:1472-1487.

### logmint

- `asset_id: uint64_t`
- `authorized_minter: name`
- `collection_name: name`
- `schema_name: name`
- `template_id: int32_t`
- `new_asset_owner: name`
- `immutable_data: ATTRIBUTE_MAP`
- `mutable_data: ATTRIBUTE_MAP`
- `backed_tokens: vector<asset>`
- `immutable_template_data: ATTRIBUTE_MAP`

Sent by `mintasset`. Calls `require_recipient(new_asset_owner)` and `notify_collection_accounts(collection_name)`.

Source: include/atomicassets.hpp:275-286, src/atomicassets.cpp:1488-1507.

### logsetdata

- `asset_owner: name`
- `asset_id: uint64_t`
- `old_data: ATTRIBUTE_MAP`
- `new_data: ATTRIBUTE_MAP`

Sent by `setassetdata`. Looks up the asset's `collection_name` (by `asset_owner`/`asset_id`) and calls `notify_collection_accounts`; no direct `require_recipient(asset_owner)`.

Source: include/atomicassets.hpp:288-293, src/atomicassets.cpp:1508-1521.

### logsetdatatl (V2)

- `collection_name: name`
- `schema_name: name`
- `template_id: int32_t`
- `old_data: ATTRIBUTE_MAP`
- `new_data: ATTRIBUTE_MAP`

Sent by `createtempl2` (when given non-empty mutable data) and `settempldata`. Calls `notify_collection_accounts(collection_name)`. Changed in V2: does not exist in V1.

Source: include/atomicassets.hpp:295-301, src/atomicassets.cpp:1522-1534.

### logrampayer (V2)

- `asset_owner: name`
- `asset_id: uint64_t`
- `old_ram_payer: name`
- `new_ram_payer: name`

Sent by `setrampayer` and `setlastpayer`. Looks up the asset's `collection_name` and calls `notify_collection_accounts`. Changed in V2: does not exist in V1; this is the notification counterpart of the V2 RAM-reassignment mechanism.

Source: include/atomicassets.hpp:303-308, src/atomicassets.cpp:1535-1547.

### logbackasset

- `asset_owner: name`
- `asset_id: uint64_t`
- `backed_token: asset`

Body is `require_auth(get_self())` only; no notification of any kind is sent. Changed in V2: in V1 this action called `require_recipient(asset_owner)` and `notify_collection_accounts`. In V2 it is dead code kept only for ABI compatibility: `backasset` always reverts and `mintasset`'s backing path always reverts, so nothing in the shipped contract ever dispatches this action.

Source: include/atomicassets.hpp:310-314, src/atomicassets.cpp:1550-1557.

### logburnasset

- `asset_owner: name`
- `asset_id: uint64_t`
- `collection_name: name`
- `schema_name: name`
- `template_id: int32_t`
- `backed_tokens: vector<asset>`
- `old_immutable_data: ATTRIBUTE_MAP`
- `old_mutable_data: ATTRIBUTE_MAP`
- `asset_ram_payer: name`

Sent by `burnasset`. Calls `notify_collection_accounts(collection_name)`.

Source: include/atomicassets.hpp:316-326, src/atomicassets.cpp:1559-1578.
