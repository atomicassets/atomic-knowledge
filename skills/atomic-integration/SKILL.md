---
name: atomic-integration
description: "Use when building or debugging an integration with the AtomicAssets or AtomicMarket contracts, the atomicassets-api indexer, or WAX and Antelope chain reads: carries the mint flow, the market composers, and the network choice"
scope: "The procedures a routing table cannot carry: choosing the network, minting an asset end to end, and composing an AtomicMarket flow without tripping a guard"
depends-on: []
key-modules: []
---

# Atomic integration

## When to use

Use this skill whenever the task touches the Atomic ecosystem on WAX or another Antelope chain: minting or editing assets through AtomicAssets, listing or trading through AtomicMarket, calling atomicassets-api endpoints, running the indexer, or reading chain tables and accounts through WharfKit or raw RPC.

What follows is what an integration gets wrong from the reference pages alone: the order the actions go in, the guard that commits instead of reverting, and the flag that turns it off. The per-fact detail lives in `AGENTS.md` and the files it routes to; read the routed file in full before writing code against it.

## Choose the network before anything else

Work on WAX testnet first. Every flow below is the same on mainnet, and the mistakes below are recoverable on testnet and not on mainnet.

| Read | WAX mainnet | WAX testnet |
| --- | --- | --- |
| Chain tables and RPC | `https://wax.greymass.com` | `https://waxtestnet.greymass.com` |
| Hosted HTTP API | `https://wax.api.atomicassets.io` | `https://test.wax.api.atomicassets.io` |

Switching network swaps both hosts, never one. The `atomicassets` and `atomicmarket` contract accounts carry the same names on both chains, so nothing in an action's data changes and a half-switched integration reads an unrelated chain while every request keeps answering 200.

WAX testnet is where V2 runs. WAX mainnet still runs the V1 contracts, and jungle4 carries the V2 code with its tables unseeded, so any V2-only behavior (the royalty layer, the bundle retirement, the new tables) is exercisable on testnet and absent on mainnet. The contract's own `version` field does not settle which one a chain runs; table presence does.

Reads need no key, no account, and no registration. A key is needed only to sign. Build the session first, from `guides/signing.md`, which carries the install lines, the chain ids, and the actor and permission pair.

## Mint an asset

Five steps, in this order. Steps 2 through 5 are each a separate transaction carrying its own authorization.

1. Build the session. It carries the actor, the permission, and the chain id every action below signs against.
2. `createcol` creates the collection. The `author` signs and pays the RAM. A name that is already a registered account, or that carries a dot suffix, needs the matching account to co-sign; a plain name must be exactly 12 characters.
3. `createschema` defines the field names and their ABI types for the collection. The `authorized_creator` signs and pays.
4. `createtempl` is optional. A template stores data shared by many assets once instead of once per asset, and sets the `transferable`, `burnable`, and `max_supply` policy those assets inherit; `max_supply: 0` means unlimited. Skip the step and mint templateless assets instead, passing `template_id: -1`.
5. `mintasset` mints. The `authorized_minter` signs and pays the RAM, not `new_asset_owner`: the row lives in the owner's scope, but the minter is billed, so a minter with too little RAM staked blocks its own mint however well resourced the recipient is.

Native token backing is gone in V2. A non-empty `tokens_to_back` aborts the mint and `backasset` fails unconditionally, so pass an empty array.

Build the mint through `@atomichub/atomicassets` rather than by hand. `ActionBuilder.mintasset()` takes the eight parameters in ABI order and returns one plain `{ account, name, data }` object for the session to sign, and `createAttributeMap` turns a plain object plus a per-field type lookup into the attribute-map shape, so no schema fetch is needed to build one. The builder checks the numeric parameters and throws a `SerializationError` naming the offending field before any transaction exists: `template_id` is checked as an int32, which keeps `-1` usable and rejects the `NaN` a string-to-number conversion produces, and `createtempl`'s `max_supply` is checked as a uint32, so a fractional or negative supply fails at the call. Without that check a `NaN` reaches the signer as `null`, because JSON has no form for it, and the mistake is invisible by the time the chain sees it.

Full detail: `guides/asset-lifecycle.md` for the flow and every failure mode, `reference/sdk/atomicassets.md` for the builder surface.

## Compose an AtomicMarket flow

Never assemble a listing or a purchase action by action. `@atomichub/atomicmarket` ships five composers that emit the whole flow in the order the contract requires, with the memo literals and the owning contract account filled in.

| Composer | Emits, in order | Refuses |
| --- | --- | --- |
| `announceSaleActions` | `announcesale`, then the AtomicAssets `createoffer` with memo `sale` | nothing; the rest is chain state |
| `purchaseSaleActions` | `assertsale`, the settlement token's `transfer` with memo `deposit`, then `purchasesale` | a bundle `asset_ids`, and a wrong `settlement_quantity` |
| `announceAuctionActions` | `announceauct`, then the AtomicAssets `transfer` with memo `auction` | nothing; the fixed order is the point |
| `acceptBuyofferActions` | the AtomicAssets `createoffer` with memo `buyoffer`, then `acceptbuyo` | a bundle `asset_ids` |
| `fulfillTemplateBuyofferActions` | the AtomicAssets `createoffer` with memo `tbuyoffer`, then `fulfilltbuyo` | nothing; a template buyoffer names one asset |

`MarketActionBuilder` is synchronous and authorization-free. `MarketActionGenerator` wraps the same methods as `async` ones that take an authorization array first and return the action array a session accepts.

The two offer-consuming composers carry a placement rule the caller has to respect. `acceptbuyo` and `fulfilltbuyo` read the globally last created row of the AtomicAssets offers table, so the `createoffer` has to sit in the same transaction immediately before the market action, with no other `createoffer` between them. Actions appended after the market action are safe, because its inline `acceptoffer` has consumed the row by then. Neither composer accepts the offer itself, for the same reason: a pre-accepted offer is gone from the table before the market contract looks.

### The two bundle opt-outs

`purchaseSaleActions` throws on more than one asset id unless `allow_v1_bundle_sale` is set, and `acceptBuyofferActions` does the same behind `allow_v1_bundle_buyoffer`. Each guards the one caller error in its family that commits instead of reverting.

On a purchase, V2 `purchasesale` returns early for a multi-asset row: it declines the offer, erases the row, and returns before touching any balance, while `assertsale` has already passed and the deposit has already credited the buyer. The transaction commits with the buyer paid, nothing delivered, and the tokens recoverable only through a separate `withdraw`. On an accept, V2 `acceptbuyo` refunds the escrowed price and erases the buyoffer row before it reads the offers table, leaving the composer's offer dangling on the recipient's RAM until they cancel it.

Set either flag only against a chain still running AtomicMarket V1, where bundle rows list and accept correctly.

### What settlement_quantity has to be

`purchasesale` spends the buyer's AtomicMarket balance, so the buyer funds it with the deposit transfer in the same transaction, and that transfer is `settlement_quantity`. Nothing on chain checks it: `assertsale` pins the listing terms and says nothing about the deposit. The discriminator is whether `listing_price` and `settlement_symbol` name one symbol, precision and code both.

| Case | `settlement_quantity` | `intended_delphi_median` |
| --- | --- | --- |
| The two name different symbols | required, denominated in `settlement_symbol` | the median the purchase asserts |
| The two name one symbol | may be omitted; a supplied one equals `listing_price` exactly | `0` |

Both refusals rule out a transaction the chain would take. Depositing more than the sale costs leaves the surplus sitting as balance, and depositing nothing lets a standing balance pay; each is legitimate for a caller who means it and indistinguishable from a wrong amount for one who does not, and the composer cannot see a balance to tell them apart. To do either deliberately, assemble `assertsale`, your own transfer, and `purchasesale` by hand, which assert nothing.

Full detail: `reference/sdk/atomicmarket.md` for the composers and the settlement math, `guides/sales.md`, `guides/auctions.md`, and `guides/buyoffers.md` for the lifecycle each one drives.

## Version pins

Re-check a fact that names a version when that dependency moves. This skill is written against `@atomichub/atomicassets` 2.1.1 and `@atomichub/atomicmarket` 2.4.1, and the contract behavior against `atomicassets-contract` v2.0.0-rc4 and `atomicmarket-contract` v2.0.0-rc2. `validation-log.md` records how each page was validated and against what.
