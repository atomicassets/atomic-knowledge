---
scope: Why a resale royalty on AtomicMarket is arithmetic the contract runs inside the settlement action, what it deducts and in what order, and who each share reaches
depends-on: [reference/atomicmarket/fees-and-royalties.md, reference/atomicmarket/actions.md, reference/atomicmarket/tables.md, reference/atomicassets/v2-upgrade.md]
key-modules: []
---

# Royalties are settlement math

A resale royalty here is not a request a storefront chooses to honor. It is a subtraction the market contract performs inside the settlement action, before the seller is credited with anything.

## What a settlement deducts

Every sale, auction claim, and buyoffer acceptance routes through one payout function, which deducts in order: the maker marketplace fee, the taker marketplace fee, the collection fee, and any active bonus fees. Each recipient is credited, and the remainder becomes the seller's balance.

The last step is a hard floor. If the stacked fees would leave the seller nothing or less, the whole settlement reverts rather than paying out a zero. See [AtomicMarket fees and royalties](../reference/atomicmarket/fees-and-royalties.md#every-settlement-stacks-four-fee-layers-before-the-seller-is-paid) ("Every settlement stacks four fee layers before the seller is paid").

Note that bonus fees are one of those layers and there can be several at once. WAX carries at least one on both mainnet and testnet, so an estimate built from the maker, taker, and collection layers alone comes out over what the seller actually receives. Which fees are active, at what rate, and to which recipient is table state: read `bonusfees` on the `atomicmarket` account rather than assuming a number. See [AtomicMarket fees and royalties](../reference/atomicmarket/fees-and-royalties.md#bonus-fees-are-additive-marketplace-incentives-layered-on-top) ("Bonus fees are additive marketplace incentives layered on top").

## The rate is read when the sale settles, not when it was listed

The listing actions read the collection's `market_fee` at creation and store it on the row, but only so an indexer can display it. At settlement the contract reads the collection row again and uses whatever the fee is at that moment.

A collection author who changes the fee changes it for every already-open listing at once. The buyer still pays the listed price, so what moves is the split between the seller and the collection. See [AtomicMarket fees and royalties](../reference/atomicmarket/fees-and-royalties.md#the-collection-fee-applies-at-execution-time-not-at-listing-time) ("The collection fee applies at execution time, not at listing time").

## Where the collection's share goes

Without a royalty configuration the whole collection fee goes to the collection author, which is the pre-V2 behavior.

With one, the contract splits that share across up to three categories: founders, the asset's own template, and any attribute rules the asset matches. The three weights are relative to each other rather than fractions of one. A category with no payee for this particular asset is dropped and the rest are renormalized against each other, so no share is left stranded.

Rounding is accounted for rather than discarded. Any integer remainder from dividing a share falls through to the collection author and is reported on its own. The payouts logged for one settlement sum to exactly the collection fee that settlement charged, to the unit.

## Reading what a sale actually paid

The four royalty log actions are inline actions the contract sends to itself with no notification to any recipient, which is deliberate: a payee's contract cannot assert inside a handler and block somebody else's settlement. It also means a notification-driven indexer never sees them, and only a trace-reading pipeline does.

For a client, the payout record is the indexer's per-listing logs route rather than a recomputation. `GET /atomicmarket/v1/sales/{sale_id}/logs` returns the logged entries with their `{recipient, amount}` payouts, and the same `/logs` suffix serves auctions, buyoffers, and template buyoffers. Recomputing the split from the royalty tables can disagree with what was paid, because the configuration and the fee can both move between listing and settlement. See [AtomicMarket fees and royalties](../reference/atomicmarket/fees-and-royalties.md#the-royalty-log-actions-are-trace-only-and-dust-always-reconciles) ("The royalty log actions are trace-only and dust always reconciles").

## Where this runs

The split engine is a V2 feature. WAX testnet runs V2 and a settlement there has been observed paying founders, template, and attribute shares that sum exactly to the collection fee. WAX mainnet still runs V1, where the collection fee goes to the author undivided. See [AtomicAssets V2 upgrade](../reference/atomicassets/v2-upgrade.md#deployment-status) ("Deployment status"). One consequence reaches every client: the hosted royalty routes answer 416 for every mainnet collection, which is the normal empty answer there rather than a per-collection fact. See [atomicassets-api HTTP API](../reference/api.md#the-royalty-routes-answer-416-when-a-collection-has-no-config) ("The royalty routes answer 416 when a collection has no config").

## Next

- [AtomicMarket fees and royalties](../reference/atomicmarket/fees-and-royalties.md) is the reference behind every number here.
- [AtomicMarket actions](../reference/atomicmarket/actions.md#royalty-split-configuration-v2-only) is how a collection configures a split.
- [One book, many storefronts](one-order-book.md) is the marketplace layer of the same settlement.
