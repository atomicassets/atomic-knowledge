---
scope: Building a third-party contract that reacts to atomicassets notifications - which notifications reach a listener, how to wire on_notify handlers, and the same-transaction safety rules
depends-on: [reference/atomicassets/notifications.md, reference/atomicassets/actions.md]
key-modules: ["atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp, include/atomicassets.hpp"]
---

# Building a reactive contract on AtomicAssets notifications

A smart contract can react to AtomicAssets activity by receiving the `require_recipient` notifications the contract emits: a listener contract watches transfers, mints, or burns and runs its own logic the moment they happen, without polling the chain. This guide covers which notifications a third-party contract can receive, how to wire the C++ `on_notify` handlers so they actually fire, and the same-transaction safety rules that govern what a handler may safely do. It builds on `reference/atomicassets/notifications.md`, which is the reference for the collection-config side (`notify_accounts`, `allow_notify`) and the full per-action notification map; read that first, then this for the integration mechanics. Baseline is the V2 contract, tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets).

## Which notifications a listener can receive

There are two independent ways a third-party contract gets notified, and they carry different data.

### Directly, as a named party

Some actions call `require_recipient` on the specific accounts involved, so a listener that is one of those accounts is notified even without any collection opt-in. `transfer` notifies both `from` and `to`: a contract set as the recipient of a transfer receives the `atomicassets::transfer` notification with the transfer's own parameters. `mintasset` notifies the `new_asset_owner` through its inline `logmint` action, so a contract that assets are minted directly to is notified as the owner. Offer creation notifies the offer's `sender` and `recipient` through `lognewoffer`. None of these require the listener to be on any collection list; being the party named in the action is enough.

Source: `atomicassets-contract src/atomicassets.cpp:76-86` (`transfer`, `require_recipient(from)` and `require_recipient(to)` at `:83-84`), `atomicassets-contract src/atomicassets.cpp:1488-1505` (`logmint`, `require_recipient(new_asset_owner)` at `:1502`), `atomicassets-contract src/atomicassets.cpp:1457-1469` (`lognewoffer`)

### Indirectly, as a collection notify account

A collection author can add a contract to that collection's `notify_accounts` list (gated by `allow_notify`), and the contract is then notified on every collection-touching action through the inline `log*` action that fans out to `notify_collection_accounts`. This is how a listener observes activity for assets it does not own: mints, burns, transfers, data edits, and RAM-payer reassignments across the whole collection. The listener does not choose to subscribe; the collection author adds it, which is a deliberate trust grant, because a notify account's handler runs inside the triggering transaction and can make that action fail. The config side (adding and removing accounts, the one-way `forbidnotify` gate, the 24-account cap) is documented in `reference/atomicassets/notifications.md`; this guide assumes the account is already on the list and focuses on the receiving contract.

Source: `atomicassets-contract src/atomicassets.cpp:1880-1888` (`notify_collection_accounts`), `atomicassets-contract src/atomicassets.cpp:246-279` (`addnotifyacc`, and its comment: "NOTE: It will consequently allow the account to make any of these actions throw (fail). Only add trusted accounts to this list")

The full table of which action notifies whom, and by which mechanism, is in `reference/atomicassets/notifications.md` ("Which actions notify whom"). The listener sees no difference in wiring between the two paths: both arrive as an `on_notify` dispatch on some action name. What differs is the action name to bind and the data delivered.

## Wiring the C++ handler

A handler binds to a notification with the `on_notify` attribute and a parameter list that must match the notifying action's ABI exactly:

```cpp
[[eosio::on_notify("atomicassets::transfer")]]
void on_transfer(name from, name to, std::vector<uint64_t> asset_ids, std::string memo);
```

The string is `contract::action`. For the direct path, bind the primary action the party is named on: `atomicassets::transfer`, and `atomicassets::logmint` for mints (the notification is sent from the inline `logmint`, not from `mintasset` itself). For the collection path, bind the inline `log*` action that carries the fan-out: `atomicassets::logtransfer`, `atomicassets::logmint`, `atomicassets::logburnasset`, `atomicassets::logsetdata`, `atomicassets::logsetdatatl`, `atomicassets::logrampayer`.

The trap: the handler's parameter list must match the notifying action's ABI parameters exactly, in order and type. If it does not, the handler is silently never dispatched. There is no error and no failed transaction; the notification simply does not match the handler, so the reaction just never runs. The exact signatures, from the pinned contract, are:

| Bind to | Parameters, in order |
| --- | --- |
| `atomicassets::transfer` | `name from, name to, vector<uint64_t> asset_ids, string memo` |
| `atomicassets::logtransfer` | `name collection_name, name from, name to, vector<uint64_t> asset_ids, string memo` |
| `atomicassets::logmint` | `uint64_t asset_id, name authorized_minter, name collection_name, name schema_name, int32_t template_id, name new_asset_owner, ATTRIBUTE_MAP immutable_data, ATTRIBUTE_MAP mutable_data, vector<asset> backed_tokens, ATTRIBUTE_MAP immutable_template_data` |
| `atomicassets::logburnasset` | `name asset_owner, uint64_t asset_id, name collection_name, name schema_name, int32_t template_id, vector<asset> backed_tokens, ATTRIBUTE_MAP old_immutable_data, ATTRIBUTE_MAP old_mutable_data, name asset_ram_payer` |
| `atomicassets::logsetdata` | `name asset_owner, uint64_t asset_id, ATTRIBUTE_MAP old_data, ATTRIBUTE_MAP new_data` |
| `atomicassets::logrampayer` | `name asset_owner, uint64_t asset_id, name old_ram_payer, name new_ram_payer` |

`ATTRIBUTE_MAP` and the `asset`/`name` types are the AtomicAssets serialization types; a listener that only needs the ids and account names still has to declare the trailing map and vector parameters so the whole signature matches, even if it ignores them. `logtransfer` is per collection: a multi-collection transfer sends one `logtransfer` per collection, so a collection notify account is called once per collection it is subscribed to, not once for the whole transfer.

The data a handler receives is exactly the notifying action's parameters, nothing more. `logtransfer` carries the moved `asset_ids` but not their templates or backed tokens; `logburnasset` is the richest, carrying the burned asset's full deserialized immutable and mutable data plus its backed tokens, because after the burn the row is gone and this is the only place that data survives. A handler that needs anything beyond what its signature delivers must read the AtomicAssets tables itself within the same transaction.

Source: `atomicassets-contract include/atomicassets.hpp:30-35` (`transfer`), `atomicassets-contract include/atomicassets.hpp:247-253` (`logtransfer`), `atomicassets-contract include/atomicassets.hpp:275-286` (`logmint`), `atomicassets-contract include/atomicassets.hpp:316-326` (`logburnasset`), `atomicassets-contract include/atomicassets.hpp:288-293` (`logsetdata`), `atomicassets-contract include/atomicassets.hpp:303-308` (`logrampayer`), `atomicassets-contract src/atomicassets.cpp:1752-1760` (per-collection `logtransfer` fan-out)

## Semantics and safety

### Same-transaction atomicity

Your handler's abort is the user's abort. A notification is delivered inline, in the same transaction as the action that triggered it. The handler is not a callback on a queue; it runs as part of the triggering transaction, and if it throws, the whole transaction reverts, including the user's transfer or mint. This is stated directly in the contract's own warning on `addnotifyacc`: adding a notify account "will consequently allow the account to make any of these actions throw (fail)." The practical rule is to keep handlers cheap and non-throwing on paths you do not intend to veto. A `check()` that fails inside a transfer handler blocks a transfer the user expected to succeed, and from the user's side it looks like AtomicAssets itself rejected the transfer. Only assert when blocking the action is the deliberate intent of the integration, not as incidental input validation.

Source: `atomicassets-contract src/atomicassets.cpp:246-250` (`addnotifyacc` warning comment), `reference/atomicassets/notifications.md` ("What a notified contract can and cannot rely on")

### Authenticate the notifier, not the payload's account names

The robust way to know a notification is genuine is that the dispatch itself binds it: an `on_notify("atomicassets::transfer")` handler only runs because the AtomicAssets contract sent the notification, so the notifier's identity is established by the binding, not by anything in the parameters. AtomicAssets models this in its own token-deposit handler: when it receives a `*::transfer` notification it authenticates the sending token contract with `get_first_receiver()` rather than trusting the transfer's fields, and it guards `if (to != get_self()) return;` so it only acts when it is the actual recipient. A listener bound to a single `contract::action` already knows the notifier, but the role guard matters: `transfer` notifies both `from` and `to`, so a handler is invoked in both roles and must check which one it is (`to == get_self()` for incoming) before acting. Do not treat the account names in the payload as authenticated identities to make trust decisions about; they are data describing the action, not proof that any of those accounts authorized your handler.

Source: `atomicassets-contract src/atomicassets.cpp:1402-1416` (`receive_token_transfer`: `to != get_self()` guard at `:1403`, `get_first_receiver()` authentication at `:1412`)

### Authorization context

Assume none of the notified parties authorized your handler. The precise authorizations visible inside an Antelope notification handler are a property of the chain runtime (nodeos), not of the pinned AtomicAssets source, so this guide does not assert a line-cited rule about what `require_auth` returns in that context. The safe practice, and the one AtomicAssets follows in its own code, is to not attempt to authenticate a notified party by calling `require_auth` on a name from the payload: a handler establishes trust from the notifier binding (above), not by re-checking the user's authority. Where the contract needs its own authority, it uses `get_self()` (as every `log*` action does with `require_auth(get_self())`), never the notified user's. Design the handler to need only its own authorization plus the delivered data.

Source: `atomicassets-contract src/atomicassets.cpp:1452` (`logtransfer` uses `require_auth(get_self())`), `atomicassets-contract src/atomicassets.cpp:1500` (`logmint` likewise); Antelope runtime authorization semantics are not covered by the pinned contract source and are stated here as safe practice, not a source-cited fact.

### RAM

Your handler bills its own account for the rows it stores. A row a handler emplaces into its own tables is paid for by whoever the handler names as payer. The general Antelope rule about which payer a notification context may bill is a runtime property, not something the pinned source states, so treat it conservatively: pay RAM from `get_self()` for anything the listener stores, rather than trying to bill a user who merely appears in the notification. AtomicAssets' own deposit handler never opens a new user-billed row from the notification path; it modifies an already-existing balance row with `same_payer` and requires the row to have been created earlier by a separate user-authorized `announcedepo`. A listener that accumulates state should budget for that RAM on its own account, the same way the worked example below emplaces under `get_self()`.

Source: `atomicassets-contract src/atomicassets.cpp:1435-1437` (`receive_token_transfer` modifies with `same_payer`), `atomicassets-contract src/atomicassets.cpp:1418-1421` (deposit requires the pre-existing row); the general RAM-payer rule for notification contexts is Antelope runtime behavior, stated here as safe practice.

### Inline follow-up actions stay in the transaction

Deferring work to a self-inline action does not decouple it from the transaction. A handler can organize its follow-up work by sending an inline action to itself (`action(permission_level{get_self(), "active"}, ...).send()`), which is exactly how AtomicAssets dispatches its own `log*` actions. This gives the follow-up a clean authorization context (it runs as `get_self()`) and keeps the handler body small, but it does not make the work asynchronous: an inline action executes in the same transaction and still aborts the user's action if it throws. There is no built-in escape from the same-transaction rule in the notification path. Use a self-inline action for code structure and authorization clarity, not as a way to make a risky handler safe to fail.

Source: `atomicassets-contract src/atomicassets.cpp:1752-1760` (AtomicAssets sends its own `logtransfer` as an inline action under `get_self()`), `atomicassets-contract src/atomicassets.cpp:1655-1663` (`RAM_RESTRICTIONS` note on same-transaction inline behavior)

## A minimal listener: counting incoming transfers

This skeleton reacts to assets transferred into its own account and keeps a per-sender count in a `stats` table. It is illustrative, not deployed; it is written to be consistent with the pinned `atomicassets::transfer` ABI (`asset_ids` as `vector<uint64_t>`, `memo` as `string`). It shows the three load-bearing pieces: the exact-match signature, the role guard, and storing under `get_self()`.

```cpp
#include <eosio/eosio.hpp>
using namespace eosio;

CONTRACT collector : public contract {
public:
    using contract::contract;

    // Fires for both the `from` and `to` of every atomicassets transfer that
    // names this account. The parameter list matches atomicassets::transfer
    // exactly; if it did not, this handler would silently never run.
    [[eosio::on_notify("atomicassets::transfer")]]
    void ontransfer(name from, name to, std::vector<uint64_t> asset_ids, std::string memo) {
        if (to != get_self()) {
            return;  // we are the `from` side of someone else's transfer; ignore
        }

        stats_t stats(get_self(), get_self().value);
        auto itr = stats.find(from.value);
        if (itr == stats.end()) {
            stats.emplace(get_self(), [&](auto& row) {   // this contract pays the RAM
                row.sender = from;
                row.received = asset_ids.size();
            });
        } else {
            stats.modify(itr, same_payer, [&](auto& row) {
                row.received += asset_ids.size();
            });
        }
    }

private:
    TABLE stat_s {
        name     sender;
        uint64_t received;
        uint64_t primary_key() const { return sender.value; }
    };
    typedef multi_index<name("stats"), stat_s> stats_t;
};
```

The handler never throws, so it can never block an incoming transfer; it bills its own account for new rows; and it acts only when it is the recipient. A listener that instead watches a whole collection would bind `atomicassets::logtransfer` (adding the leading `name collection_name` parameter) and would need to be on that collection's `notify_accounts` list.

## Testing the handler

Handlers like this can be exercised in-process, without deploying to a chain, using the VeRT testing library: it runs the AtomicAssets contract and the listener together in a simulated environment, so a test can call `transfer` and assert on the listener's `stats` table, including the same-transaction abort behavior (a throwing handler failing the transfer). See `guides/testing-with-vert.md` for the setup.

## Correct and avoid

Correct:

- Match the notifying action's ABI signature exactly, in order and type; declare even the parameters you ignore. A mismatched signature means the handler silently never fires.
- Guard on your role before acting: `transfer` notifies both `from` and `to`, so check `to == get_self()` (or `from`, as needed) first.
- Establish trust from the `on_notify` binding, and pay RAM for stored rows from `get_self()`.
- Keep handlers cheap and non-throwing except where blocking the action is the deliberate purpose of the integration.
- Read the AtomicAssets tables within the handler if you need data beyond the notification's parameters.

Avoid:

- Assuming a `notify_accounts` entry is a passive, read-only feed. It is not: your handler runs in the triggering transaction and your abort reverts the user's action, which is why the contract calls adding a notify account a trust decision (`reference/atomicassets/notifications.md`; `reference/atomicassets/structure.md`, "a notify account with a throwing `on_notify` handler can block the action").
- Expecting notifications for actions that send none. `canceloffer` and `declineoffer` notify nobody, and in V2 `logbackasset` is a dead stub, so no backing notification arrives (`reference/atomicassets/notifications.md`).
- Relying on `asset_ids` grouping order across a multi-collection transfer: the per-collection `logtransfer` calls follow `std::map` key order, not the caller's asset-id order (`reference/atomicassets/notifications.md`).
- Doing settlement-shaped work inside a handler, such as an `on_notify` handler that creates a second AtomicAssets offer ahead of a market fulfillment. That is the buyoffer anti-pattern in `guides/buyoffers.md`; the same-transaction coupling makes it fragile.
- Treating a self-inline action as a way to make a failure-prone handler safe: the inline action still runs in the same transaction and still aborts the user's action on a throw.

Source: `atomicassets-contract src/atomicassets.cpp:246-250` (trust warning), `reference/atomicassets/notifications.md`, `reference/atomicassets/structure.md` ("Authorization and the 24-account cap"), `guides/buyoffers.md`
