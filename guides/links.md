---
scope: The atomictools claim-link workflow end to end - announce, fund, claim by signature, cancel, and reading links via chain and the hosted API
depends-on: [reference/atomictools/actions.md, reference/atomictools/tables.md, reference/atomicassets/actions.md]
key-modules: ["atomictools-contract (commit d89ce79e4): src/link.cpp, include/atomictoolsx.hpp", "atomicassets-api: src/filler/handlers/atomictools"]
---

# Links: the atomictools claim-link flow

A claim link (or "claimlink") lets someone hand a set of AtomicAssets NFTs to a recipient who does not yet have an account name in hand: the sender escrows the assets against an off-chain key pair, and whoever receives the private key can claim the assets to any account they control. It is how "here is a link, open it to receive these NFTs" flows are built on Antelope chains. The contract is deployed as account `atomictoolsx` on WAX and under the same name on other chains; the `config.atomicassets_account` it escrows through is `atomicassets`.

The contract has no release tags. Source citations pin commit `d89ce79e4` of `pinknetworkx/atomictools-contract`. This guide shows each write as plain JSON action data first, then the same call through `@wharfkit/session`'s `session.transact()`; it does not broadcast any transaction. The read examples are live `get_table_rows` and hosted-API calls that were run read-only against `wax.greymass.com` and `wax.api.atomicassets.io`. Asset ids and the `link_counter` exceed the JavaScript safe-integer range and must be passed as strings; see `reference/wharfkit.md` and `reference/atomicmarket/v2-changes.md` ("Large integers serialize as strings").

## The shape of the flow

1. The sender generates a key pair off chain. This is the "link key" and is unrelated to any account's keys.
2. `announcelink` records the link with the public key, the asset ids, and a memo. Nothing moves yet.
3. The sender funds the link with a plain AtomicAssets `transfer` of those exact assets to `atomictoolsx`, memo `"link"`. The contract's notification handler marks the link funded.
4. The private key is shared with the recipient out of band (typically embedded in a URL). If it rides in a URL, put it in the fragment (`#...`), never the query string or path: fragments stay in the browser, while query and path components leak through server access logs, referrer headers, and analytics, and any of those exposures hands the assets to whoever reads the log.
5. The recipient calls `claimlink` from their own account, signing their account name with the private key. The contract verifies the signature and sends the assets to them.
6. If no one claims, the sender calls `cancellink` to pull the assets back.

Steps 2 and 3 are separate transactions and separate authorizations; the link exists in a `WAITING` state between them.

## Step 1: generate the link key off chain

The link key is an ordinary Antelope key pair created by the sender's app, held nowhere on chain except its public half inside the link. The private half is the bearer secret: anyone who obtains it can claim. Generate it however the app already builds keys (for example `PrivateKey.generate('K1')` from `@wharfkit/antelope`), keep the private key to place in the shareable link, and pass the public key to `announcelink`.

There is no on-chain step here; it is stated so the rest of the flow is unambiguous about which key is which. The recipient never needs the private key to *hold* the assets, only to run the one `claimlink` that moves them.

## Step 2: announce the link

```json
{
  "creator": "collector.wam",
  "key": "PUB_K1_7fQQsgKNfRj3rKjf3RD2apBGN9HyEVsHCiHN3QgAzT64cWojRT",
  "asset_ids": ["1099998460553"],
  "memo": "birthday gift"
}
```

```ts
await session.transact({
  action: {
    account: 'atomictoolsx',
    name: 'announcelink',
    authorization: [session.permissionLevel],
    data: {
      creator: session.actor,
      key: linkPublicKey,
      asset_ids: ['1099998460553'],
      memo: 'birthday gift',
    },
  },
})
```

- Required authorization: `creator`.
- RAM payer: `creator` pays for the new `links` row.
- Fails when: `asset_ids` is empty; the memo exceeds 256 characters; `creator` does not currently own one of the assets; a listed asset's template has `transferable: false`; or `creator` already has a live link for this exact set of asset ids ("You have already announced a link for these assets").

The assets stay in the creator's wallet at this point. The link is recorded with `assets_transferred: false`.

Source: `src/link.cpp:21-98`

## Step 3: fund the link

Funding is a normal AtomicAssets `transfer` to the `atomictoolsx` account with the memo `"link"`; there is no atomictools action for it. The asset ids must be the same set announced in step 2 (order does not matter).

```json
{
  "from": "collector.wam",
  "to": "atomictoolsx",
  "asset_ids": ["1099998460553"],
  "memo": "link"
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'transfer',
    authorization: [session.permissionLevel],
    data: {
      from: session.actor,
      to: 'atomictoolsx',
      asset_ids: ['1099998460553'],
      memo: 'link',
    },
  },
})
```

The `atomictoolsx` contract catches the transfer via its `atomicassets::transfer` notification handler, matches it to the announced link by (sender, exact asset-id set) rather than by any link id, sets `assets_transferred: true`, and emits `loglinkstart`.

- The memo must be exactly `"link"`. Any other memo, empty included, reverts the whole transfer with "Invalid memo", so the assets never leave the sender.
- If no announced link by this sender for this exact asset set exists, the transfer reverts with "No announced link by this sender for these assets exists". Announce first, then fund.
- Because funding is matched by asset set, a creator can hold only one live link per exact set of ids at a time (the duplicate check in step 2 enforces this).

Source: `src/link.cpp:189-241`

## Step 4: claim the link

The recipient runs `claimlink` from whatever account they want to receive the assets. The proof is a signature, made with the link's private key, over the claimer's own account name.

```json
{
  "link_id": 6572116,
  "claimer": "newowner.wam",
  "claimer_signature": "SIG_K1_KfPL...<signature of sha256(\"newowner.wam\") under the link private key>"
}
```

```ts
// signatureData is sha256 of the raw claimer account-name string
const digest = Checksum256.hash(Bytes.from('newowner.wam', 'utf8'))
const claimerSignature = linkPrivateKey.signDigest(digest)

await session.transact({
  action: {
    account: 'atomictoolsx',
    name: 'claimlink',
    authorization: [session.permissionLevel],
    data: {
      link_id: 6572116,
      claimer: session.actor,
      claimer_signature: claimerSignature,
    },
  },
})
```

The contract computes `sha256(claimer)` over the raw account-name characters, recovers the public key from that digest and `claimer_signature`, and requires it to equal the link's stored `key`. On success it transfers the assets to `claimer` (memo `"Claimed link"`) and erases the link row.

- Required authorization: `claimer` (which also routes the assets to that account).
- RAM: the claimer pays their own CPU/NET. If `claimer` has never held an AtomicAssets asset before, the `atomictoolsx` contract account pays the RAM for the recipient's new asset scope, because it is the `from` of the outgoing transfer.
- Fails when: the link was never funded ("The assets for this link have not yet been transferred to the atomic tools account"); or the signature does not recover the stored key ("The signature provided is not valid").

Why the claimer's name is the signed message: it binds the signature to one account. A signature made for `newowner.wam` recovers the link key only against the digest of `newowner.wam`; substitute a different claimer and the digest changes, the recovered key no longer matches, and the claim fails. Someone watching the mempool cannot copy a pending `claimlink` signature and reclaim the assets to their own account, because they would need to re-sign their own name with the private key they do not have.

Source: `src/link.cpp:133-159`

## Cancel a link

The creator can reclaim the assets at any time before a successful claim.

```json
{ "link_id": 6572116 }
```

```ts
await session.transact({
  action: {
    account: 'atomictoolsx',
    name: 'cancellink',
    authorization: [session.permissionLevel],
    data: { link_id: 6572116 },
  },
})
```

- Required authorization: the link's `creator`.
- If the link was funded, the assets are returned to `creator` via an inline AtomicAssets `transfer` with memo `"Cancelled link"`; if it was only announced and never funded, the row is simply erased.
- Fails when: no link with `link_id` exists, or the caller is not its creator.

Source: `src/link.cpp:107-124`

## RAM and authorization notes

- The `links` row RAM is paid by the creator from `announcelink` onward and released when the link is claimed or cancelled. Funding the link (`assets_transferred` flip) keeps the same payer, so a claim does not shift RAM cost onto the recipient for the link row itself.
- The escrowed NFTs live in the `atomictoolsx` account's own AtomicAssets scope between funding and resolution. The contract moves them out under `permission_level{atomictoolsx, "active"}`, so the deployed account's `active` permission must be able to call `atomicassets::transfer` (it is the contract's own authority, so this holds by default).
- A first-time recipient's new asset scope RAM is paid by `atomictoolsx` on claim, since the contract is the transfer sender.
- The unrelated `auth` action always throws by design; it is a proof-of-key-control challenge for off-chain services, not part of the link flow. See `reference/atomictools/actions.md` ("Admin and off-chain auth").

## Reading links via chain tables

Every live link is a row in the `links` table, scope `atomictoolsx`. Read the primary index by `link_id`:

```bash
curl -s https://wax.greymass.com/v1/chain/get_table_rows -d '{
  "code": "atomictoolsx", "scope": "atomictoolsx", "table": "links",
  "json": true, "limit": 2, "lower_bound": 3265012
}'
```

```json
{"rows":[
  {"link_id":3265012,"creator":"yrgb4.wam","key":"EOS6YxGQNSuv5hk2YRjHRZN9rpvJAf323ZfRPzp22C8fy8pW8kfmB",
   "asset_ids":["1099925607623"],"assets_transferred":1,"memo":""},
  {"link_id":3265020,"creator":"yrgb4.wam","key":"EOS86kigUFK22YzJspnLsHukJzszA2tNid8J4nCerBQyfYT2c2Y8K",
   "asset_ids":["1099925607630"],"assets_transferred":1,"memo":""}],
 "more":true,"next_key":"3265045"}
```

To find a link by the assets escrowed in it rather than by id, query the `assetidshash` secondary index (index position 2, `key_type` `sha256`). The key is the `sha256` of the sorted asset-id array, the same value the contract computes internally:

```bash
curl -s https://wax.greymass.com/v1/chain/get_table_rows -d '{
  "code": "atomictoolsx", "scope": "atomictoolsx", "table": "links",
  "json": true, "limit": 2, "index_position": 2, "key_type": "sha256"
}'
```

The `config` singleton reports the running version and the next link id to be assigned:

```bash
curl -s https://wax.greymass.com/v1/chain/get_table_rows -d '{
  "code": "atomictoolsx", "scope": "atomictoolsx", "table": "config", "json": true, "limit": 1
}'
```

```json
{"rows":[{"version":"1.0.0","link_counter":6572117,"atomicassets_account":"atomicassets"}],"more":false,"next_key":""}
```

The table only holds unresolved links: a claimed or cancelled link's row is erased. A row's `key` prints in the legacy `EOS...` format from `get_table_rows` and in the `PUB_K1_...` format from the hosted API; both encode the same key. The chain table carries no notion of "claimed" versus "cancelled", only `assets_transferred`; the lifecycle distinction is added by the indexer below.

## Reading links via the hosted API

The atomicassets-api exposes an `atomictools` namespace alongside `atomicassets` and `atomicmarket`. It resolves each link's assets to full AtomicAssets objects and tracks a lifecycle state the chain table does not keep, because it retains rows after a link resolves.

```bash
curl -s "https://wax.api.atomicassets.io/atomictools/v1/links?limit=2"
```

Each element carries `tools_contract`, `link_id`, `assets_contract`, `creator`, `claimer` (null until claimed), `state`, `memo`, the resolved `assets` array, `public_key`, and the usual `created_at_*` / `updated_at_*` fields. A single link is available at `/atomictools/v1/links/{link_id}`, and `/atomictools/v1/config` returns `{atomictools_contract, atomicassets_contract, version}`.

The `state` field is the indexer's `LinkState`, driven by the contract's log actions and terminal actions:

| `state` | Name | Set when |
| --- | --- | --- |
| 0 | `WAITING` | `lognewlink` fired: announced, assets not yet transferred in |
| 1 | `CREATED` | `loglinkstart` fired: assets funded, link is claimable |
| 2 | `CANCELED` | `cancellink` ran |
| 3 | `CLAIMED` | `claimlink` ran; `claimer` is now set |

Filter by state to list only claimable links (`?state=1`) or only claimed ones (`?state=3`); a live page of results returned states 1, 2, and 3 as expected, with `claimer` populated only on the `CLAIMED` rows.

Source: `atomicassets-api src/filler/handlers/atomictools/index.ts:29-33` (the `LinkState` enum), `src/filler/handlers/atomictools/processors/links.ts:20-90` (the state transitions); live probes of `wax.api.atomicassets.io/atomictools/v1/links` and `/config`.

## See also

- `reference/atomictools/actions.md`: every action's parameters, auth, and notifications, including the signature-verification detail.
- `reference/atomictools/tables.md`: the `links` and `config` schemas and the `assetidshash` index.
- `guides/asset-lifecycle.md`: minting and transferring the assets that flow into a link.
- `reference/api.md`: hosted-API pagination limits and conventions shared across namespaces.
