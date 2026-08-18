---
scope: Why every AtomicMarket listing lands in one contract's tables rather than a per-storefront book, and how a storefront still earns a fee on a trade it brought
depends-on: [reference/atomicmarket/marketplaces.md, reference/atomicmarket/tables.md, reference/atomicmarket/fees-and-royalties.md, guides/sales.md]
key-modules: []
---

# One book, many storefronts

AtomicMarket is one contract account, and its sales, auctions, and buyoffers all live in tables scoped to that account. A listing is not filed under the site that created it, because there is nowhere on the row to file it.

## Where a listing actually sits

The `sales`, `auctions`, `buyoffers`, and `tbuyoffers` tables are each scoped to the contract's own account, and none of them partitions rows by the site that wrote them. Listing ids come from one counter table, so a sale id is unique across every caller rather than per storefront. See [AtomicMarket tables](../reference/atomicmarket/tables.md) for the row shapes and their scopes.

The consequence is structural rather than a policy anyone enforces: a site reading the sales table reads every open sale, including the ones it did not create, and a site writing one writes into the same table everyone else reads.

## How a storefront gets paid anyway

Attribution is a parameter on the action, not a partition of the data.

A site calls `regmarket` once to register a marketplace name against a creator account. After that, a listing action takes a `maker_marketplace` and its counterparty action takes a `taker_marketplace`, and the contract rejects a name that is not registered in either slot. The maker comes from whoever created the listing and is stored on the row. The taker comes from the counterparty: on a sale or a buyoffer that is the call that settles, and on an auction it is the bid, so an auction's taker is fixed well before the claim actions run the payout.

A marketplace only ever supplies one side of a trade per action. There is no call that carries both, so the site that listed an asset and the site that sold it are two rows in one settlement, each paid its own layer.

Registration is what makes a site creditable, not what makes it able to trade. The contract seeds a default marketplace under the empty name, which is what a caller passes when it has no marketplace of its own.

Fees are not pushed. Both cuts are credited to the marketplace creator's internal balance, and the creator calls `withdraw` to take them. See [AtomicMarket marketplaces](../reference/atomicmarket/marketplaces.md#marketplace-fees-collect-into-the-balances-table-not-a-direct-transfer) ("Marketplace fees collect into the balances table, not a direct transfer").

## What that costs and what it buys

The cost is that the chain does not remember which site closed a sale. A completed sale's taker marketplace lives only in the settlement trace, never in table state, so an indexer that wants that fact has to read traces. Auctions are the exception and keep theirs on the row until it is claimed or cancelled.

What it buys is that a listing does not have to be re-published anywhere to be reachable, and that a seller's asset is not held hostage by the site that listed it. A sale is a lazy escrow: `announcesale` records a row and moves nothing, and the asset stays with the seller until a buyer settles. See [Working with sales](../guides/sales.md).

## Next

- [AtomicMarket marketplaces](../reference/atomicmarket/marketplaces.md) covers registration, attribution, and fee crediting in full.
- [Royalties are settlement math](royalties.md) is what the collection's own layer of that settlement does.
- [AtomicMarket tables](../reference/atomicmarket/tables.md) is the row reference for every listing type.
