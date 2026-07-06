---
scope: AtomicMarket auction lifecycle - announce, escrow transfer, bid, claim, and cancel
depends-on: [reference/atomicmarket/actions.md, guides/deposits.md]
key-modules: ["atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp", "atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp"]
---

# Working with auctions

The full lifecycle of an AtomicMarket auction (V2 baseline): announcing, transferring the asset into escrow, bidding, ending, claiming, and cancelling.

Unlike a sale, an auction takes actual custody of the asset: the seller transfers it to the `atomicmarket` contract account, and it sits there until claimed or the auction is cancelled before any bid lands. Bids are deposit-backed: a bidder's AtomicMarket balance is debited when they bid, and refunded if outbid. See `guides/deposits.md` for the transfer-with-memo deposit flow; this guide only shows where a step requires a sufficient balance.

## Announce an auction

`announceauct` creates the auction row with a starting bid and duration. It moves nothing yet.

```json
{
  "seller": "sellerwaxacc",
  "asset_ids": ["1099511627887"],
  "starting_bid": "10.00000000 WAX",
  "duration": 86400,
  "maker_marketplace": "mymarket"
}
```

```ts
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "announceauct",
      authorization: [session.permissionLevel],
      data: {
        seller: session.actor,
        asset_ids: ["1099511627887"],
        starting_bid: "10.00000000 WAX",
        duration: 86400,
        maker_marketplace: "mymarket",
      },
    },
  ],
});
```

Authorization: the seller.

Failure modes asserted in source:

- `asset_ids` must contain exactly one id: bundle (multi-asset) auctions were removed in V2; create one auction per asset (multiple `announceauct` calls can share a transaction).
- The same seller cannot announce a second auction for the exact same asset id (hash of the sorted id list).
- `starting_bid.symbol` must be a supported token, and `starting_bid.amount` must be greater than zero.
- `maker_marketplace` must be a registered marketplace.
- `duration` must be within the contract's configured `minimum_auction_duration` / `maximum_auction_duration` bounds. On the reference mainnet deployment these are 120 seconds and 2,592,000 seconds (30 days) respectively: read live via the `config` table before validating client-side, since these are operator-configurable:

```sh
curl -X POST https://wax.greymass.com/v1/chain/get_table_rows \
  -d '{"code":"atomicmarket","scope":"atomicmarket","table":"config","json":true,"limit":1}'
```

- The seller must own the asset, ids must be unique, and if the asset belongs to a template, the template must be transferable.

Source: `atomicmarket-contract src/atomicmarket.cpp:1027-1113` (`announceauct`), `atomicmarket-contract include/atomicmarket.hpp:638-652` (`config_s` defaults)

## Transfer the asset into escrow

The auction only becomes active once the seller transfers the asset to `atomicmarket` with the memo `"auction"`. This is a standard AtomicAssets transfer, not an AtomicMarket action.

```json
{
  "from": "sellerwaxacc",
  "to": "atomicmarket",
  "asset_ids": ["1099511627887"],
  "memo": "auction"
}
```

```ts
await session.transact({
  actions: [
    {
      account: "atomicassets",
      name: "transfer",
      authorization: [session.permissionLevel],
      data: {
        from: session.actor,
        to: "atomicmarket",
        asset_ids: ["1099511627887"],
        memo: "auction",
      },
    },
  ],
});
```

Authorization: the seller (the same account that ran `announceauct`).

AtomicMarket's `atomicassets::transfer` notification handler matches the transfer to an auction by hashing `asset_ids` and scanning auction rows with that hash for one whose seller equals the sender and whose `end_time` has not yet passed, then flips `assets_transferred` to true and emits `logauctstart`. Until this transfer happens, the auction cannot receive bids.

Failure modes asserted in source:

- `asset_ids` must contain exactly one id: a transfer of more than one asset can no longer activate an auction (only a legacy pre-V2 bundle auction row could ever match one, and those can only be cancelled; see below).
- No non-finished auction announced by this sender exists for this exact asset id set.

Source: `atomicmarket-contract src/atomicmarket.cpp:1889-1943` (`receive_asset_transfer`)

## Bid on an auction

```json
{
  "bidder": "bidderwaxacc",
  "auction_id": 42,
  "bid": "15.00000000 WAX",
  "taker_marketplace": "othermarket"
}
```

```ts
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "auctionbid",
      authorization: [session.permissionLevel],
      data: {
        bidder: session.actor,
        auction_id: 42,
        bid: "15.00000000 WAX",
        taker_marketplace: "othermarket",
      },
    },
  ],
});
```

Authorization: the bidder. The bidder's AtomicMarket balance must already cover the bid amount (`guides/deposits.md`): `auctionbid` debits the balance directly, it does not accept a token transfer inline.

The first bid only needs to meet or exceed `starting_bid`. Every subsequent bid must clear the current bid by at least the contract's configured `minimum_bid_increase` (a relative fraction, default `0.1`: a 10% increase over the current bid), read live from `config`. When a new bid is accepted, the previous highest bidder's amount is credited straight back to their AtomicMarket balance: no separate refund action is needed. Bidding within `auction_reset_duration` (default 120 seconds) of the current end time extends `end_time` to `auction_reset_duration` from the moment of the bid, as an anti-snipe extension; it never shortens the auction.

Failure modes asserted in source:

- The bidder cannot be the auction's seller.
- The asset must already be transferred into escrow (`assets_transferred`).
- The auction must not have already ended (`current_time_point() < end_time`).
- The bid's symbol must match the auction's current bid symbol.
- The bid must meet the starting-bid or minimum-increase threshold described above.
- `taker_marketplace` must be a registered marketplace.
- The bidder's balance must cover the bid amount (see `guides/deposits.md`).
- Bidding on a legacy pre-V2 bundle auction (`asset_ids.size() > 1`) that has not been partially claimed dissolves it instead of placing a bid: any existing bid is refunded, custodied assets return to the seller, and the row is erased. See `reference/atomicmarket/v2-changes.md` for the full legacy-row bundle-dissolution behavior.

Optionally guard against the auction's asset ids changing between when a bidder reads it and when the bid lands, with `assertauct` in the same transaction:

```json
{
  "auction_id": 42,
  "asset_ids_to_assert": ["1099511627887"]
}
```

`assertauct` requires no authorization and throws if the auction's current asset ids differ from what is asserted.

Source: `atomicmarket-contract src/atomicmarket.cpp:1183-1265` (`auctionbid`), `atomicmarket-contract src/atomicmarket.cpp:1404-1415` (`assertauct`), `atomicmarket-contract include/atomicmarket.hpp:638-652` (`config_s` defaults)

## Auction end and claiming

An auction has no explicit "end" action: `end_time` simply passing is what makes it claimable. From that point, either side may claim in either order.

### Buyer claim: `auctclaimbuy`

```json
{ "auction_id": 42 }
```

```ts
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "auctclaimbuy",
      authorization: [session.permissionLevel],
      data: { auction_id: 42 },
    },
  ],
});
```

Authorization: the current highest bidder. `auctclaimbuy` transfers the escrowed asset to the winning bidder. If the seller has already claimed their side, the auction row is erased; otherwise it is left in place with `claimed_by_buyer = true` until the seller also claims.

Failure modes asserted in source:

- The auction must have assets in escrow and at least one bid.
- Only the current highest bidder may call it.
- The auction must have ended (`end_time` in the past).
- It cannot already be claimed by the buyer.

### Seller claim: `auctclaimsel`

```json
{ "auction_id": 42 }
```

```ts
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "auctclaimsel",
      authorization: [session.permissionLevel],
      data: { auction_id: 42 },
    },
  ],
});
```

Authorization: the seller. `auctclaimsel` runs the same internal payout path as a sale (`internal_payout_sale`): the winning bid is split between the seller, the maker/taker marketplaces, and the collection, with the collection fee applied at execution time (see `reference/atomicmarket/v2-changes.md`, "Execution-time fees and trace-only royalty logs"). If the buyer has already claimed the asset, the auction row is erased; otherwise it is left in place with `claimed_by_seller = true` until the buyer also claims.

Failure modes asserted in source:

- Only the auction's seller may call it.
- The auction must have assets in escrow, must have ended, and must have at least one bid (an auction with no bids uses `cancelauct`, not this action).
- It cannot already be claimed by the seller.
- On a legacy pre-V2 bundle auction that ended with no claims yet, either claim action dissolves it instead (bid refunded, assets returned to seller) rather than completing a trade; a bundle auction that was already partially claimed before V2 removed bundles completes normally through these actions. See `reference/atomicmarket/v2-changes.md` for the full behavior table.

Source: `atomicmarket-contract src/atomicmarket.cpp:1273-1392` (`auctclaimbuy`, `auctclaimsel`)

## Cancel an auction

```json
{ "auction_id": 42 }
```

```ts
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "cancelauct",
      authorization: [session.permissionLevel],
      data: { auction_id: 42 },
    },
  ],
});
```

Authorization: normally the seller, and only before any bid has landed: once an auction has a bid, it cannot be cancelled by the seller and must run to its natural end and be claimed. This is stricter than sale cancellation, which the seller can do at any time regardless of buyer interest.

`cancelauct` also accepts no authorization at all when the auction is invalid, meaning either:

- it has not yet had assets transferred into escrow and the seller no longer owns at least one of the listed assets, or
- it is a legacy pre-V2 bundle row (more than one asset id): every such row is unconditionally invalid under V2. Cancelling an invalid bundle auction that already has a bid (and has not been partially claimed) refunds the bidder and returns any escrowed assets to the seller. See `reference/atomicmarket/v2-changes.md` for the full legacy-row cancellation rules.

If assets were already transferred into escrow, cancelling returns them to the seller.

Source: `atomicmarket-contract src/atomicmarket.cpp:1125-1173` (`cancelauct`)
