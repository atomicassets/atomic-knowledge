---
scope: Complete action reference for the atomictools contract (links / claimlinks)
depends-on: [reference/atomictools/tables.md, reference/atomicassets/actions.md]
key-modules: ["atomictools-contract (commit d89ce79e4): src/link.cpp, src/auth.cpp, include/atomictoolsx.hpp"]
---

# AtomicTools actions

Complete action reference for the `atomictools` contract, deployed as account `atomictoolsx` on WAX (and under the same account name on other Antelope chains). The contract has no release tags; every citation below pins commit `d89ce79e4` of `pinknetworkx/atomictools-contract`. Action declarations are in `include/atomictoolsx.hpp`; bodies are in `src/link.cpp` and `src/auth.cpp`.

The contract's single purpose is transferable claim links: a creator escrows a set of AtomicAssets NFTs against an off-chain key pair, and anyone who holds the matching private key can later claim those assets to their own account. It moves no fungible tokens and holds no balances of its own; the only assets it ever custodies are the escrowed NFTs, held in the `atomictoolsx` account's own AtomicAssets scope between announcement and claim/cancel.

Live-chain status: the full action and table list on this page was diffed against the deployed `atomictoolsx` ABI on WAX mainnet (`get_abi`) and matches the pinned source exactly. `config.version` reads `1.0.0` live.

## Link lifecycle actions

A link moves through announce (`announcelink`), fund (an AtomicAssets `transfer` with memo `"link"`, caught by the notification handler), then exactly one terminal step: `claimlink` (assets go to the claimer) or `cancellink` (assets go back to the creator). The row is erased on either terminal step. See `guides/links.md` for the end-to-end integrator flow.

### announcelink

- `creator: name`
- `key: public_key`: the link's public key. The matching private key is what gets shared out of band to whoever may claim.
- `asset_ids: vector<uint64_t>`: must contain at least one id; every id must currently belong to `creator`.
- `memo: string`: up to 256 characters.

Required authorization: `creator`.

Creates a `links` row with `assets_transferred = false`, keyed by a contract-wide `config.link_counter` (starts at 1). Each listed asset must currently belong to `creator`, and any templated asset's template must have `transferable = true` (a non-transferable asset cannot be linked). RAM for the new row is paid by `creator` (`links.emplace(creator, ...)`). A creator may not have two live links for the exact same set of asset ids: the check compares the new id set against existing links sharing the same `asset_ids` hash and rejects a duplicate by the same creator with "You have already announced a link for these assets." Different creators may each hold a link over the same id set. Sends `lognewlink`, which notifies `creator`.

This action only records the intent; it does not move the assets. Funding is a separate AtomicAssets `transfer` step (below).

Source: `include/atomictoolsx.hpp:39-44`, `src/link.cpp:21-98`

### cancellink

- `link_id: uint64_t`

Required authorization: the link's `creator`.

Erases the `links` row. If the assets were already transferred in (`assets_transferred == true`), they are first returned to `creator` via an inline AtomicAssets `transfer` with memo `"Cancelled link"`; if they were never funded, the row is simply removed. Callable at any point before the link is claimed. Sends no `atomictools` log action of its own (the asset return surfaces only as the inline AtomicAssets `transfer` and its `logtransfer`).

Source: `include/atomictoolsx.hpp:46-48`, `src/link.cpp:107-124`

### claimlink

- `link_id: uint64_t`
- `claimer: name`: the account the assets are claimed to.
- `claimer_signature: signature`: a signature over `sha256(claimer)` produced with the link's private key (see "How the claim proves knowledge of the link key" below).

Required authorization: `claimer`.

Transfers the link's assets to `claimer` via an inline AtomicAssets `transfer` with memo `"Claimed link"`, then erases the `links` row. Fails with "The assets for this link have not yet been transferred to the atomic tools account" if `assets_transferred` is false, and with "The signature provided is not valid" if the recovered key does not match the link's stored `key`. There is no separate log action; the claim is observable as the inline `transfer` (and the indexer keys off the top-level `claimlink` trace).

Source: `include/atomictoolsx.hpp:50-54`, `src/link.cpp:133-159`

## How the claim proves knowledge of the link key

The claim is a challenge-response over the claimer's own account name, not over the assets or the link id. `claimlink` computes `claimer_digest = sha256(claimer.to_string())` (the raw account-name characters, not a serialized struct) and calls `recover_key(claimer_digest, claimer_signature)`, then requires the recovered public key to equal the link's stored `key`. Only a holder of the link's private key can produce a signature that recovers to that public key, so a valid `claimlink` proves the caller holds the private key that was shared for this link.

Because the signed message is the claimer's own account name, a signature built for one claimer cannot be replayed by a different account: a different `claimer` hashes to a different digest, so the same signature recovers a different (wrong) key. This binds a claim to its account and defeats mempool front-running of a submitted `claimlink` (an observer who copies the signature but substitutes their own account name gets a digest the signature no longer matches, and they cannot re-sign without the private key). The claimer also signs the transaction itself under `require_auth(claimer)`, which is what routes the assets to their account.

Source: `src/link.cpp:146-156`

## Asset funding: the transfer notification handler

### receive_asset_transfer

- `from: name`
- `to: name`
- `asset_ids: vector<uint64_t>`
- `memo: string`

Not a directly callable action and not present in the contract ABI's action list: declared `[[eosio::on_notify("atomicassets::transfer")]]`, so it runs only as a notification handler when the `atomicassets` contract fans out a `transfer` receipt to `atomictoolsx`.

Returns immediately if `to != get_self()`. Otherwise the memo must be exactly `"link"` (any other memo, including empty, hits `check(false, "Invalid memo")` and reverts the whole incoming transfer). On a `"link"` memo it locates the matching announced link by hashing the transferred `asset_ids` and walking the `assetidshash` secondary index for a row whose asset set is a permutation of the transfer's and whose `creator == from`; if none exists it reverts with "No announced link by this sender for these assets exists." The link is not referenced by `link_id` here: funding is matched by (sender, exact asset-id set), which is why a creator may hold only one live link per id set. On a match it sets `assets_transferred = true` (with `same_payer`, so the creator keeps paying the row RAM) and sends `loglinkstart`.

Source: `include/atomictoolsx.hpp:57-62`, `src/link.cpp:189-241`

## Notification / log actions (contract-internal)

Both actions below require `require_auth(get_self())`, so they run only as inline actions dispatched by the contract itself, never as directly submitted top-level actions. They carry stable event payloads for indexers.

### lognewlink

- `link_id: uint64_t`
- `creator: name`
- `key: public_key`
- `asset_ids: vector<uint64_t>`
- `memo: string`

Sent by `announcelink`. Calls `require_recipient(creator)`. This is the only link action that directly notifies a party; the atomicassets-api indexer keys the link's initial `WAITING` row off this action's trace.

Source: `include/atomictoolsx.hpp:65-71`, `src/link.cpp:165-174`

### loglinkstart

- `link_id: uint64_t`

Sent by `receive_asset_transfer` once the assets land. Body is `require_auth(get_self())` only; it sends no `require_recipient`. It exists purely as a trace marker for indexers to move the link from `WAITING` to `CREATED` (claimable).

Source: `include/atomictoolsx.hpp:73-75`, `src/link.cpp:176-180`

## Admin and off-chain auth

### init

No parameters.

Required authorization: the contract account itself (`require_auth(get_self())`).

Creates the `config` singleton with its defaults (`get_or_create`) if it does not already exist, so a repeat call is a safe no-op. Run once per deployment.

Source: `include/atomictoolsx.hpp:33`, `src/link.cpp:9-12`

### auth

- `nonce: string`

Required authorization: none checked before it aborts.

Always fails: the body is `check(false, "This action is designed to always throw")`. It exists so an off-chain service can ask a user to sign (and attempt to broadcast) an `auth` transaction with an arbitrary `nonce` as a proof-of-key-control challenge; the transaction can never commit, so it changes no state and costs no RAM, while its signature still proves the account controls its keys. Not part of the link flow.

Source: `include/atomictoolsx.hpp:80-82`, `src/auth.cpp:7-11`

## Internal helper

`internal_transfer_assets(to, asset_ids, memo)` is the single path both `cancellink` and `claimlink` use to move escrowed assets out. It dispatches an inline `atomicassets::transfer` under `permission_level{get_self(), "active"}` from `atomictoolsx` to `to`. Because the sender is the contract account, if `to` has never held an AtomicAssets asset before, the `atomictoolsx` account pays the RAM for the recipient's new asset scope (AtomicAssets charges the transfer's `from` for a first-time recipient scope). It is not a standalone action.

Source: `include/atomictoolsx.hpp:119`, `src/link.cpp:247-264`

## Action summary

| Action | Auth | Notifies / sends | Effect |
| --- | --- | --- | --- |
| `announcelink` | `creator` | `lognewlink` (notifies creator) | Creates a `links` row (`assets_transferred=false`), creator pays RAM |
| `receive_asset_transfer` (notify handler) | n/a (on_notify) | `loglinkstart` | Marks the matching link funded; requires memo `"link"` |
| `claimlink` | `claimer` | inline `atomicassets::transfer` (memo `"Claimed link"`) | Verifies signature, sends assets to claimer, erases row |
| `cancellink` | link `creator` | inline `atomicassets::transfer` if funded (memo `"Cancelled link"`) | Returns any escrowed assets, erases row |
| `lognewlink` | `get_self()` | `require_recipient(creator)` | Event log for indexers |
| `loglinkstart` | `get_self()` | none | Event log for indexers |
| `init` | `get_self()` | none | Creates the `config` singleton |
| `auth` | none (always aborts) | none | Off-chain key-control challenge; never commits |

Source: `include/atomictoolsx.hpp:33-82`, `src/link.cpp`, `src/auth.cpp`
