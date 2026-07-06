# AtomicAssets notifications

Validated behavior of the `atomicassets` contract's notification mechanism: how a collection opts a smart contract into `require_recipient` notifications, which actions notify which parties, and what a notified contract can and cannot assume. Baseline is the V2 contract, tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets); differences from V1 are called out under "Changed in V2."

## Collection notify accounts

Each `collections` table row carries `authorized_accounts` (who can edit the collection), `notify_accounts` (who gets pinged via `require_recipient` on actions that touch the collection), and `allow_notify`, a boolean gate on whether `notify_accounts` can hold any entries. `addnotifyacc` and `remnotifyacc` each require the collection author's authorization and add or remove one account at a time; V2 caps the list at 24 entries, a limit V1 did not enforce. The cap exists because the contract reads `notify_accounts` through a low-level partial row read that only pages in a bounded prefix of the collection's serialized row, and an unbounded list would defeat that optimization. Adding a notify account is a trust decision, not a passive subscription: the contract's own comment on `addnotifyacc` warns that a notified account can make the notifying action fail, because its `on_notify` handler runs inside the same transaction and can throw.

Source: include/atomicassets.hpp lines 348-359 (collections_s); src/atomicassets.cpp lines 254-279 (addnotifyacc), 286-305 (remnotifyacc)

## The allow_notify toggle lives on the collection, not the contract

`allow_notify` is set at collection creation (`createcol`) and can only move from true to false, through `forbidnotify`, which also requires `notify_accounts` to already be empty (an author must clear every notify account first). There is no contract-wide switch: the global `config` singleton carries only ID counters, the collection data format, and the supported-token whitelist, with no notification-related field at all. So "turning off notifications" is always a per-collection, one-way decision made by that collection's author, never a network-wide setting.

Source: include/atomicassets.hpp lines 454-461 (config_s); src/atomicassets.cpp lines 91-158 (createcol), 335-350 (forbidnotify)

## Which actions notify whom

Two distinct mechanisms exist. Some actions call `require_recipient` directly on the specific accounts involved (the asset owner, an offer's two parties). Others notify only a collection's `notify_accounts` list, through a `notify_collection_accounts` helper invoked from an inline `log*` action the primary action sends to itself.

| Action | Notifies | Mechanism |
| --- | --- | --- |
| `transfer` | `from`, `to`, plus each moved collection's `notify_accounts` | direct `require_recipient` in the action; `logtransfer` per collection calls `notify_collection_accounts` |
| `createoffer` (via `lognewoffer`) | `sender`, `recipient` | direct `require_recipient` in `lognewoffer` |
| `acceptoffer` | `sender`, `recipient`, plus each moved collection's `notify_accounts` | direct `require_recipient` in the action; `logtransfer` per collection calls `notify_collection_accounts` |
| `canceloffer` | nobody | no notification of any kind |
| `declineoffer` | nobody | no notification of any kind |
| `mintasset` (via `logmint`) | `new_asset_owner`, plus the collection's `notify_accounts` | `require_recipient` and `notify_collection_accounts` together |
| `setassetdata` (via `logsetdata`) | the collection's `notify_accounts` | `notify_collection_accounts` only, no owner `require_recipient` |
| `settempldata` (via `logsetdatatl`) | the collection's `notify_accounts` | `notify_collection_accounts` only |
| `setrampayer` / `setlastpayer` (via `logrampayer`) | the collection's `notify_accounts` | `notify_collection_accounts` only, no owner `require_recipient` |
| `createtempl` / `createtempl2` (via `lognewtempl`) | the collection's `notify_accounts` | `notify_collection_accounts` only |
| `burnasset` (via `logburnasset`) | the collection's `notify_accounts` | `notify_collection_accounts` only |
| `backasset` (V1, via `logbackasset`) | `asset_owner`, plus the collection's `notify_accounts` | `require_recipient` and `notify_collection_accounts` together; unreachable in V2, where `logbackasset` is an empty stub (see `reference/atomicassets/backing-tokens.md`) |

Source: src/atomicassets.cpp lines 76-86 (transfer), 1185-1273/1457-1469 (createoffer/lognewoffer), 1299-1350 (acceptoffer), 1280-1290 (canceloffer), 1358-1368 (declineoffer), 697-788 (mintasset), 796-836 (setassetdata), 846-907 (settempldata), 914-976 (setrampayer/setlastpayer), 1096-1177 (burnasset), 1445-1573 (log action bodies), 1665-1761 (internal_transfer)

## What a notified contract can and cannot rely on

A notification is delivered inline, in the same transaction as the triggering action: a notified contract's own handler runs as part of that transaction and can abort it by throwing, so being on a `notify_accounts` list is a way to gate or observe an action, not a read-only subscription. What arrives is only the notifying action's own parameters (for example `logsetdata` carries the deserialized old and new mutable data); a notified contract that needs anything beyond that has to query the tables itself. The set of accounts notified for a collection is read fresh at the moment the `log*` action runs, not cached from an earlier point in the transaction. Two things a notified contract cannot assume: it will not hear anything about `canceloffer` or `declineoffer`, since neither sends any notification, and grouping of a multi-asset `transfer` into per-collection `logtransfer` calls follows `std::map<name, ...>` key order, not the order the caller supplied asset ids in.

Source: src/atomicassets.cpp lines 1823-1856 (partial_read_collection), 1880-1888 (notify_collection_accounts), 1665-1761 (internal_transfer collection grouping)

## Changed in V2

Two notification points are new. `setrampayer` and `setlastpayer` each send the inline `logrampayer` action, which notifies the affected asset's collection `notify_accounts` through `notify_collection_accounts` (there is no direct `require_recipient` on the owner); this is the notification counterpart of the V2 RAM-payer reassignment mechanism that replaced an earlier, unshipped custodial-rentals design. `settempldata`/`logsetdatatl` is new alongside V2's mutable-template-data feature and notifies only the collection's `notify_accounts`, with no per-account recipient. Separately, `addnotifyacc`'s 24-account cap is new in V2; V1's `addnotifyacc` had no such limit. Finally, `logbackasset`'s V1 notification behavior (`require_recipient(asset_owner)` plus `notify_collection_accounts`) is now dead code: the V2 `logbackasset` action body is an empty stub kept only for ABI compatibility, and nothing in V2 ever sends it, because `backasset` and `mintasset`'s backing path both abort before reaching a log call.

Source: src/atomicassets.cpp lines 914-940 (setrampayer), 943-976 (setlastpayer), 1535-1547 (logrampayer), 846-907 (settempldata), 1522-1532 (logsetdatatl), 274 (24-account cap in addnotifyacc), 1550-1556 (V2 logbackasset stub); V1 backing/notification behavior lives in this repo's V1 tree (`contracts/atomicassets-contract`)

## Live-chain caveat

A live `get_abi` read against WAX mainnet's `atomicassets` account, taken 2026-07-06, returns a 35-action ABI matching the V1 action set: none of the V2-only actions (`createauswap`, `setrampayer`, `setlastpayer`, `logrampayer`, `settempldata`, `logsetdatatl`, `setschematyp`) are present. Every V2-only notification point above is source-verified against the `v2.0.0-rc4` contract but had not shipped to WAX mainnet at the time of this check. Re-verify against the target chain's live ABI before relying on a V2-only notification point.

Source: live chain read, `POST https://wax.greymass.com/v1/chain/get_abi {"account_name":"atomicassets"}`, checked 2026-07-06
