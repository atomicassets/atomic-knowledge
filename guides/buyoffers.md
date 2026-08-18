---
scope: How to create, accept, decline, and cancel AtomicMarket asset and template buyoffers, whose price leaves the buyer's deposited balance at creation
depends-on: [reference/atomicmarket/actions.md, guides/deposits.md, reference/api.md]
key-modules:
    - "atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp"
    - "atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp"
    - "@atomichub/atomicmarket 2.3.0 (atomicmarket-sdk v2.3.0, 36aee58): src/Actions/Generator.ts"
---

# Buyoffers

How to create, accept, decline, and cancel AtomicMarket buyoffers, for both single assets and templates. Baseline is AtomicMarket V2 (`atomicmarket-contract`); "Changed in V2" notes call out where V1 behaved differently. Lifecycle-state facts for the indexer and hosted API (LISTED/CANCELED/SOLD, no row cleanup, `state` filtering) are validated in [atomicassets-api HTTP API](../reference/api.md) and [Query the API and chain tables](querying-the-api.md); this guide cross-links them rather than repeating them. Deposit and balance mechanics are covered in [Balances and deposits](deposits.md).

A buyoffer is a buyer-initiated, escrowed offer: the price is deducted from the buyer's deposited balance immediately at creation (see [Balances and deposits](deposits.md)), before the counterparty has agreed to anything. WAX mainnet currently runs AtomicMarket V1; see [AtomicMarket tables](../reference/atomicmarket/tables.md#config) ("config") for the live-version check. The V1 behavior noted below is the live behavior only for as long as mainnet stays on V1.

## Asset buyoffers

### Creating a buyoffer

`createbuyo` targets a specific asset held by a specific `recipient`: it's a directed offer, not a general "buy from anyone" listing. The buyer's `price` is deducted from their deposited balance for the settlement symbol at creation time, so the balance must already cover it. In V2, `asset_ids` must contain exactly one id; bundle buyoffers (multiple asset ids in one offer) were removed. `recipient` must currently own every asset in `asset_ids`, and all assets must belong to the same collection.

```json
{
  "buyer": "buyeraccount",
  "recipient": "walletowner11",
  "price": "10.00000000 WAX",
  "asset_ids": ["1099511627776"],
  "memo": "offer for your asset",
  "maker_marketplace": "atomichub"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "createbuyo",
      authorization: [session.permissionLevel],
      data: {
        buyer: "buyeraccount",
        recipient: "walletowner11",
        price: "10.00000000 WAX",
        asset_ids: ["1099511627776"],
        memo: "offer for your asset",
        maker_marketplace: "atomichub",
      },
    },
  ],
});
```

Changed in V2: V1's `createbuyo` accepted any number of `asset_ids` (bundle buyoffers). V2 rejects anything but exactly one.

Source: `atomicmarket-contract src/atomicmarket.cpp:1425-1491` (`createbuyo`), `atomicmarket-contract include/atomicmarket.hpp:247-254`

### Accepting a buyoffer

The recipient accepts by first creating an AtomicAssets `createoffer` to the `atomicmarket` account (offering exactly the buyoffer's asset(s), asking for nothing back, with the memo `"buyoffer"`), then calling `acceptbuyo` in the same transaction. `acceptbuyo` does not take an `offer_id`; it reads the highest-id row currently in AtomicAssets' `offers` table (table-wide, not scoped to this recipient) and validates that it matches: sender is the buyoffer's recipient, recipient is `atomicmarket`, asset ids match, nothing is asked in return, and the memo is exactly `"buyoffer"`. `expected_asset_ids` and `expected_price` are a caller-side assertion against the stored buyoffer, guarding against acting on a buyoffer that changed underneath the caller. The same "last offer in the table" mechanic applies to `fulfilltbuyo` for template buyoffers; see the security note under "Fulfilling a template buyoffer" below, which applies here too whenever the recipient is a smart contract account.

```json
{
  "buyoffer_id": "42",
  "expected_asset_ids": ["1099511627776"],
  "expected_price": "10.00000000 WAX",
  "taker_marketplace": "atomichub"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicassets",
      name: "createoffer",
      authorization: [session.permissionLevel],
      data: {
        sender: "walletowner11",
        recipient: "atomicmarket",
        sender_asset_ids: ["1099511627776"],
        recipient_asset_ids: [],
        memo: "buyoffer",
      },
    },
    {
      account: "atomicmarket",
      name: "acceptbuyo",
      authorization: [session.permissionLevel],
      data: {
        buyoffer_id: "42",
        expected_asset_ids: ["1099511627776"],
        expected_price: "10.00000000 WAX",
        taker_marketplace: "atomichub",
      },
    },
  ],
});
```

Changed in V2: see [AtomicMarket V2 changes](../reference/atomicmarket/v2-changes.md#defensive-guards-in-the-v2-contract) ("Defensive guards in the V2 contract") for the `is_permutation` and empty-table guard fixes in `acceptbuyo`.

Source: `atomicmarket-contract src/atomicmarket.cpp:1533-1626` (`acceptbuyo`), `atomicmarket-contract include/atomicmarket.hpp:260-265`

#### Building the accept flow with the SDK

Because `acceptbuyo` identifies its offer as the globally last created row rather than by an id, an `acceptbuyo` action built on its own is not safe to send. `@atomichub/atomicmarket` gives it no standalone builder method for that reason; the only way to reach it is `acceptBuyofferActions`, which emits the `createoffer` and the `acceptbuyo` together, in that order, with the `buyoffer` memo filled in:

```ts
import { MarketActionBuilder } from '@atomichub/atomicmarket'

const builder = new MarketActionBuilder('atomicmarket')

const actions = builder.acceptBuyofferActions({
  recipient: session.actor.toString(),
  buyoffer_id: '42',
  asset_ids: ['1099511627776'],
  expected_price: '10.00000000 WAX',
  taker_marketplace: 'atomichub',
  assets_contract: 'atomicassets',
})
// -> [createoffer on atomicassets with memo 'buyoffer', acceptbuyo on atomicmarket]

await session.transact({
  actions: actions.map((a) => ({ ...a, authorization: [session.permissionLevel] })),
})
```

The composer fills `expected_asset_ids` from `asset_ids`, because the contract compares that list twice: once against the buyoffer row and once against the contents of the offer it reads. It does not accept the offer itself, since the market contract sends that `acceptoffer` inline and a pre-accepted offer is gone from the table before the contract can find it. Nothing else in the transaction may create an AtomicAssets offer between these two actions; actions appended after `acceptbuyo` are safe.

The composer throws when `asset_ids` carries more than one id, unless `allow_v1_bundle_buyoffer: true` is set. Under V2 `acceptbuyo` refunds the escrowed price and erases a multi-asset row before it ever reads the offers table, so the transaction commits with the buyoffer gone, nothing sold, and the offer this flow created left dangling on the recipient's RAM until they cancel it. Set the flag only against a chain still running AtomicMarket V1, where bundle buyoffers accept correctly. See [@atomichub/atomicmarket SDK](../reference/sdk/atomicmarket.md#the-two-bundle-opt-out-flags) ("The two bundle opt-out flags").

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Actions/Generator.ts:641-688 (`acceptBuyofferActions`, the last-offer placement rule, the bundle throw), src/Actions/Generator.ts:158-175 (`AcceptBuyofferInput` and `allow_v1_bundle_buyoffer`), src/Actions/Generator.ts:208-476 (the builder's action set, which carries no standalone `acceptbuyo`)

### Declining a buyoffer

`declinebuyo` requires the recipient's authorization (not the buyer's) and refunds the escrowed price to the buyer's deposited balance. The buyer must then `withdraw` it, since nothing is transferred out automatically.

```json
{
  "buyoffer_id": "42",
  "decline_memo": "not interested"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "declinebuyo",
      authorization: [session.permissionLevel],
      data: { buyoffer_id: "42", decline_memo: "not interested" },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:1634-1649` (`declinebuyo`), `atomicmarket-contract include/atomicmarket.hpp:267-270`

### Cancelling a buyoffer

`cancelbuyo` requires the buyer's authorization and refunds the escrowed price to the buyer's deposited balance. Unlike `cancelsale`, there is no permissionless path: nobody but the buyer can cancel their own buyoffer, regardless of whether it has become unfulfillable (see below).

```json
{ "buyoffer_id": "42" }
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "cancelbuyo",
      authorization: [session.permissionLevel],
      data: { buyoffer_id: "42" },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:1501-1513` (`cancelbuyo`), `atomicmarket-contract include/atomicmarket.hpp:256-258`

### What makes a buyoffer invalid

`createbuyo` checks that the recipient owns every asset id at creation time (`get_collection_and_check_assets` looks each one up in the recipient's own asset scope and throws if any is missing). That check does not run again later. If the recipient transfers the asset away after the buyoffer exists, the row stays on chain but becomes unfulfillable in practice: `acceptbuyo` requires the recipient to create a matching AtomicAssets offer for an asset they no longer own, which AtomicAssets itself rejects. AtomicMarket has no permissionless invalidation action for buyoffers analogous to `cancelsale`'s "anyone can cancel an invalid sale" path; the buyoffer simply sits there until the buyer cancels it.

A separate, unrelated "invalid" case is legacy V1 bundle buyoffers (more than one asset id, created before V2 removed the capability): calling `acceptbuyo` on one does not trade anything. It cancels the buyoffer and refunds the buyer, exactly like `declinebuyo`. See [AtomicMarket V2 changes](../reference/atomicmarket/v2-changes.md#bundle-listing-retirement) ("Bundle listing retirement").

Source: `atomicmarket-contract src/atomicmarket.cpp:2120-2163` (`get_collection_and_check_assets`), `atomicmarket-contract src/atomicmarket.cpp:1547-1554` (legacy bundle handling inside `acceptbuyo`)

## Template buyoffers

A template buyoffer targets any asset of a given template within a collection, rather than a specific asset held by a specific recipient: any account that owns a matching asset can fulfill it.

### Creating a template buyoffer

`createtbuyo` deducts `price` from the buyer's deposited balance immediately, same as `createbuyo`. `template_id` must exist within `collection_name`; no asset needs to exist yet, and no recipient is named.

```json
{
  "buyer": "buyeraccount",
  "price": "5.00000000 WAX",
  "collection_name": "mycollection",
  "template_id": "123456",
  "maker_marketplace": "atomichub"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "createtbuyo",
      authorization: [session.permissionLevel],
      data: {
        buyer: "buyeraccount",
        price: "5.00000000 WAX",
        collection_name: "mycollection",
        template_id: "123456",
        maker_marketplace: "atomichub",
      },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:1651-1701` (`createtbuyo`), `atomicmarket-contract include/atomicmarket.hpp:281-287`

### Fulfilling a template buyoffer

The seller creates an AtomicAssets `createoffer` to `atomicmarket` offering exactly one asset of the buyoffer's template, asking nothing back, memo exactly `"tbuyoffer"`, then calls `fulfilltbuyo` in the same transaction. `fulfilltbuyo` verifies the offered asset's `template_id` matches, and like `acceptbuyo`, reads the highest-id row in AtomicAssets' `offers` table rather than taking an `offer_id` parameter, then checks that row's sender, recipient, asset ids, and memo.

**Security consideration for marketplaces**: this is a liveness and griefing risk, not theft, and it is safe for a normal wallet-signed transaction. `fulfilltbuyo` accepts whichever offer is last in AtomicAssets' `offers` table when it runs, not a specific id, so an offer injected between the seller's `createoffer` and `fulfilltbuyo` can land last instead. Both actions re-check the last offer's sender, recipient, asset ids, and memo, so a foreign offer cannot silently settle the buyoffer: it would need the same `asset_id` from the same seller with memo `"tbuyoffer"`, impossible while that asset is committed to the intended offer; any mismatch reverts the transaction. An externally-owned wallet runs the two actions back to back, so there is no exposure. A marketplace whose seller side is a smart contract must ensure nothing else in the transaction creates an AtomicAssets offer after the intended one, or its settlements will spuriously revert.

```
// correct: the seller's transaction contains exactly one AtomicAssets createoffer (the one fulfilltbuyo expects) and nothing else can insert another offer before it
// avoid: an inline action or on_notify handler on the seller's contract account creating a second AtomicAssets offer ahead of fulfilltbuyo
```

```json
{
  "seller": "walletowner11",
  "buyoffer_id": "7",
  "asset_id": "1099511627777",
  "expected_price": "5.00000000 WAX",
  "taker_marketplace": "atomichub"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicassets",
      name: "createoffer",
      authorization: [session.permissionLevel],
      data: {
        sender: "walletowner11",
        recipient: "atomicmarket",
        sender_asset_ids: ["1099511627777"],
        recipient_asset_ids: [],
        memo: "tbuyoffer",
      },
    },
    {
      account: "atomicmarket",
      name: "fulfilltbuyo",
      authorization: [session.permissionLevel],
      data: {
        seller: "walletowner11",
        buyoffer_id: "7",
        asset_id: "1099511627777",
        expected_price: "5.00000000 WAX",
        taker_marketplace: "atomichub",
      },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:1717-1794` (`fulfilltbuyo`), `atomicmarket-contract include/atomicmarket.hpp:308-314`

#### Building the fulfill flow with the SDK

`fulfilltbuyo` reads the last offer the same way `acceptbuyo` does, so it has no standalone builder method either. `fulfillTemplateBuyofferActions` emits the pair with the `tbuyoffer` memo filled in:

```ts
const actions = builder.fulfillTemplateBuyofferActions({
  seller: session.actor.toString(),
  buyoffer_id: '7',
  asset_id: '1099511627777',
  expected_price: '5.00000000 WAX',
  taker_marketplace: 'atomichub',
  assets_contract: 'atomicassets',
})
// -> [createoffer on atomicassets with memo 'tbuyoffer', fulfilltbuyo on atomicmarket]
```

It carries no bundle guard, because a template buyoffer names one asset by construction: `fulfilltbuyo` takes a single `asset_id` and the contract checks that the offer holds exactly that one asset. The placement rule from the accept flow above applies unchanged, and it is the SDK-side statement of the marketplace security consideration in this section: keep the offer immediately before the market action and let nothing else create an offer in between.

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Actions/Generator.ts:690-707 (`fulfillTemplateBuyofferActions` and why it carries no bundle guard), src/Actions/Generator.ts:177-188 (`FulfillTemplateBuyofferInput`), src/Actions/Generator.ts:641-657 (the last-offer placement rule shared with the accept flow)

### Cancelling a template buyoffer

`canceltbuyo` requires the buyer's authorization and refunds the escrowed price to the buyer's deposited balance, the same as `cancelbuyo`.

```json
{ "buyoffer_id": "7" }
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "canceltbuyo",
      authorization: [session.permissionLevel],
      data: { buyoffer_id: "7" },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:1703-1715` (`canceltbuyo`), `atomicmarket-contract include/atomicmarket.hpp:294-296`

### Lifecycle states in the indexer and API

Template buyoffer rows in atomicassets-api are never deleted; `state` (LISTED=0, CANCELED=1, SOLD=2) is the only signal that an offer is no longer active, and the `/v1/template_buyoffers` endpoint returns all three states unless you filter. See [atomicassets-api HTTP API](../reference/api.md#template-buyoffers-keep-all-lifecycle-states) ("Template buyoffers keep all lifecycle states") and [Query the API and chain tables](querying-the-api.md#filter-template-buyoffers-by-state) ("Filter template buyoffers by state") for the validated details; not repeated here.
