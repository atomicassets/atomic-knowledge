---
scope: The atomicassets createoffer/acceptoffer trade primitive, and how AtomicMarket sales are built on it
depends-on: [reference/atomicassets/actions.md]
key-modules: ["atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp", "atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp"]
---

# Offers: the native two-sided trade flow

`atomicassets` offers are the contract's only built-in trade primitive: a sender proposes swapping some of their assets for some of a recipient's, the recipient accepts or declines, and either side can back out before that happens. AtomicMarket sales and buyoffers are built on top of this primitive rather than moving assets directly (sales use an offer with memo `"sale"`, buyoffers use memos `"buyoffer"` and `"tbuyoffer"`); see "How AtomicMarket sales use offers" below for how the two connect. AtomicMarket auctions are the exception: they do not use offers at all. A seller escrows the asset by a direct AtomicAssets `transfer` to the `atomicmarket` contract with the memo `"auction"`, which the contract's `receive_asset_transfer` handler picks up. Behavior here is unchanged between V1 and V2. AtomicAssets line citations below are against tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets).

Each action's data shape is plain JSON first, then the same call through `@wharfkit/session`'s `session.transact()`. Only asset ids need the string treatment: see `reference/atomicmarket/v2-changes.md` ("Large integers serialize as strings") for why. `template_id` is an `int32_t`, and offer ids are a small contract-wide `uint64` counter (a live `offers` row reads `offer_id: 7`); both stay well inside the safe-integer range and serialize as bare JSON numbers, as the numeric `offer_id` examples below do. See `reference/wharfkit.md`.

## Create an offer: createoffer

An offer is two-sided: `sender_asset_ids` lists what the sender is putting up, `recipient_asset_ids` lists what they're asking for. Either side (but not both) may be empty, which makes the offer a one-way gift request or a one-way ask.

```json
{
  "sender": "collector.wam",
  "recipient": "otheruser.wam",
  "sender_asset_ids": ["1099511627887"],
  "recipient_asset_ids": [1099511627999],
  "memo": "trade?"
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'createoffer',
    authorization: [session.permissionLevel],
    data: {
      sender: session.actor,
      recipient: 'otheruser.wam',
      sender_asset_ids: ['1099511627887'],
      recipient_asset_ids: ['1099511627999'],
      memo: 'trade?',
    },
  },
})
```

- Required authorization: `sender`.
- RAM payer: `sender`, until reassigned by `payofferram`.
- Fails when: `recipient` isn't a registered account; `sender` equals `recipient`; both asset id lists are empty (`"Can't create an empty offer"`); either list contains a duplicate id; the memo exceeds 256 characters; or the sender or recipient doesn't currently own one of the listed assets, or that asset's template has `transferable: false`.

Ownership and transferability are checked at creation time only; they are re-checked again at `acceptoffer`, not continuously. See "What invalidates an offer" below.

Source: `atomicassets-contract src/atomicassets.cpp:1185-1273`

## Accept an offer: acceptoffer

```json
{
  "offer_id": 4821
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'acceptoffer',
    authorization: [session.permissionLevel],
    data: {
      offer_id: 4821,
    },
  },
})
```

Accepting re-verifies ownership of every listed asset, then runs both transfers (recipient's assets to sender, sender's assets to recipient) and erases the offer row.

- Required authorization: the offer's `recipient`.
- RAM payer: split, not uniform. Assets moving from recipient to sender use the offer's current RAM payer as the scope payer for any new scope the sender needs; assets moving from sender to recipient have the recipient cover their own new scope. In practice this means accepting an offer that requires you to hold an asset type for the first time can implicitly charge your own RAM, not the offer creator's.
- Fails when: the sender or recipient no longer owns one of the listed assets (see below).

Source: `atomicassets-contract src/atomicassets.cpp:1299-1350`, `atomicassets-contract src/atomicassets.cpp:1665-1761` (`internal_transfer`, shared transfer logic)

## Decline an offer: declineoffer

```json
{ "offer_id": 4821 }
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'declineoffer',
    authorization: [session.permissionLevel],
    data: { offer_id: 4821 },
  },
})
```

- Required authorization: the offer's `recipient`.
- RAM payer: not applicable; the row is erased and its RAM released to whoever paid for it.
- Fails when: no offer with `offer_id` exists.

Source: `atomicassets-contract src/atomicassets.cpp:1358-1368`

## Cancel an offer: canceloffer

```json
{ "offer_id": 4821 }
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'canceloffer',
    authorization: [session.permissionLevel],
    data: { offer_id: 4821 },
  },
})
```

- Required authorization: the offer's `sender` (the account that created it, not necessarily its current RAM payer).
- RAM payer: not applicable; the row is erased.
- Fails when: no offer with `offer_id` exists.

Source: `atomicassets-contract src/atomicassets.cpp:1280-1290`

## Reassign the RAM payer: payofferram

Lets a third party (typically the app that prompted the offer) take over an offer's RAM cost, so the original sender isn't left staking RAM for someone else's convenience.

```json
{ "payer": "somedapp.wam", "offer_id": 4821 }
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'payofferram',
    authorization: [session.permissionLevel],
    data: { payer: 'somedapp.wam', offer_id: 4821 },
  },
})
```

The action erases the offer row and re-emplaces an identical copy paid for by `payer`; every other field is preserved.

- Required authorization: `payer`.
- RAM payer: `payer`, after the call.
- Fails when: no offer with `offer_id` exists.

Source: `atomicassets-contract src/atomicassets.cpp:1377-1395`

## What invalidates an offer

`createoffer` checks ownership and transferability once, at creation. Nothing re-checks a pending offer afterward; ownership is only re-verified when someone calls `acceptoffer`. Between those two points, an offer can go stale in two ways:

- **The asset moved.** The owner transferred it away (a plain `transfer`, or by accepting a different offer that touched the same asset id), so it's no longer in the expected owner's scope.
- **The asset was burned.** `burnasset` erases the row outright.

Either way, `acceptoffer` fails with `"Offer sender doesn't own at least one of the provided assets"` (or the recipient equivalent), and the offer row is left untouched, since the failed transaction makes no state changes. The contract appends the offending id to that string as a ` (ID: <asset_id>)` suffix (the same suffix `createoffer` and `transfer` add to their ownership and transferability errors), so a match on the message should allow for the trailing id. A stale offer is not pruned automatically: it stays in the `offers` table, discoverable by anyone reading it, until its sender calls `canceloffer`, its recipient calls `declineoffer`, or a failed `acceptoffer` prompts one of them to clean it up. Indexers and UIs that show pending offers should not assume a listed offer is still fulfillable.

Source: `atomicassets-contract src/atomicassets.cpp:1313-1325` (ownership re-check in `acceptoffer`), `atomicassets-contract src/atomicassets.cpp:1096-1177` (`burnasset` erase)

## How AtomicMarket sales use offers

AtomicMarket instant sales are a thin wrapper around this same offer mechanism, not a separate escrow. `announcesale` only records a listing row with `offer_id: -1`; it moves nothing. The seller separately calls `createoffer` with `recipient` set to the AtomicMarket contract account, `recipient_asset_ids` empty, and `memo: "sale"`. AtomicMarket's notification handler for the AtomicAssets `lognewoffer` log matches that offer to the pending sale by its asset id and seller, and fills in the sale's `offer_id`. `purchasesale` then sends an inline `acceptoffer` for that id, which is why a sale cannot settle if the seller has since cancelled the underlying offer or moved the asset. The two cases fail on different checks. If the seller cancelled the offer, its row is gone, so `purchasesale`'s own guard throws `"The seller cancelled the atomicassets offer related to this sale"` before it ever reaches `acceptoffer`. If the seller instead moved the asset away, the offer row still exists and that guard passes; the failure surfaces one step later, inside the inline `acceptoffer`, as AtomicAssets' own `"Offer sender doesn't own at least one of the provided assets"`. (`assertsale` plays no part in this: it asserts only a sale's asset ids, listing price, and settlement symbol, and never inspects the offer state.) A live example of this shape, read straight off chain:

```json
{
  "offer_id": 7,
  "sender": "b1",
  "recipient": "atomicmarket",
  "sender_asset_ids": ["1099511627887"],
  "recipient_asset_ids": [],
  "memo": "sale",
  "ram_payer": "res.pink"
}
```

`ram_payer` here is neither the sale's seller nor AtomicMarket itself: a third-party resource payer took over the offer's RAM with `payofferram`, which is common for services that sponsor sellers' RAM.

Fee application, royalty logging, and settlement-time behavior belong to the AtomicMarket contract, not this one; see `reference/atomicmarket/v2-changes.md`, particularly "Marketplace attribution" (a sale's taker side and offer linkage) and "Execution-time fees and trace-only royalty logs".

Source: `atomicmarket-contract src/atomicmarket.cpp:744-827` (`announcesale`), `atomicmarket-contract src/atomicmarket.cpp:896-981` (`purchasesale`, cancelled-offer guard at `:934-935`), `atomicmarket-contract src/atomicmarket.cpp:1950-2009` (`receive_asset_offer`, the `lognewoffer` handler)

## See also

- `guides/asset-lifecycle.md`: creating and transferring the assets that flow through offers.
- `reference/atomicmarket/fees-and-royalties.md`: fees, royalties, and settlement for the sales and buyoffers built on this primitive (auctions settle the same way but escrow via a direct transfer, not an offer).
- `reference/wharfkit.md`: id serialization and table-read pitfalls relevant to reading the `offers` table directly.
