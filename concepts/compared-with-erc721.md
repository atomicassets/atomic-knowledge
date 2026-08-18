---
scope: "How AtomicAssets and ERC-721 differ by mechanism: where attribute data lives, who deploys a contract, what a mint costs, and how a resale royalty is applied"
depends-on: [reference/atomicassets/structure.md, reference/atomicassets/tables.md, reference/atomicassets/actions.md, reference/media.md, reference/atomicmarket/fees-and-royalties.md]
key-modules: []
---

# AtomicAssets next to ERC-721

Both designs let an account own a unique item and prove it on chain. They diverge on four mechanisms, and the differences are consequences of those, not of anyone being careless.

Read this as two halves. Everything about AtomicAssets links to the page in this repository that validated it. Everything about ERC-721 is what that standard and its common extensions specify, which this repository has not validated and does not cite.

## Where the attributes live

ERC-721 keeps the owner of each id on chain and puts the description of the item behind a pointer. Its metadata extension defines `tokenURI`, a per-id string returning a URI, and the document at that URI holds the name, the image reference, and the traits. The contract does not read that document and cannot check it.

AtomicAssets stores attributes on chain, as fields on contract tables. A template carries `immutable_serialized_data`, an asset carries its own immutable and mutable data, and a schema declares the names and types those bytes decode against. See [AtomicAssets data model structure](../reference/atomicassets/structure.md) and [AtomicAssets tables](../reference/atomicassets/tables.md#assets).

The honest limit is that media is a pointer on both sides. The chain stores no image bytes and has no media column: a media attribute is an ordinary schema attribute whose value is a bare content reference, and a CID on chain is a claim about content rather than a guarantee any node still serves it. See [Media conventions](../reference/media.md). What differs is the rest of it. A trait an application reads is a chain read on one side and a fetch of somebody's document on the other.

## Who deploys a contract

Under ERC-721 a collection is a contract. Each project deploys its own, at its own address, with its own code, and every integrator adds that address before it can show anything from it.

Under AtomicAssets a collection is a row. The `collections` table is scoped to the contract's own account, template and asset ids come from counters that run across the whole contract, and the format that collection data serializes against is one process-wide value rather than one per collection. Creating a collection is an action, not a deployment, and it needs no code review because there is no new code. See [AtomicAssets data model structure](../reference/atomicassets/structure.md#collections).

The collection is still the unit of control. Its `author` and its `authorized_accounts` list decide who may create and edit schemas, templates, and assets under it, and its `market_fee` is the collection's own number. See [AtomicAssets data model structure](../reference/atomicassets/structure.md#authorization-and-the-24-account-cap).

The trade goes both ways. A shared contract means an indexer, a signer, or a storefront that reads one collection reads all of them, and an upgrade that lands reaches every collection at once. It also means a collection cannot change the rules for itself: custom behavior belongs in a contract of your own that reacts to notifications rather than in a fork of this one.

## What a mint costs

An ERC-721 mint costs gas, priced by demand for block space at the moment it runs, spent and not returned.

An AtomicAssets mint costs storage. `mintasset` creates the asset row and bills the RAM to `authorized_minter`, not to the recipient, so a minter without enough RAM blocks its own mint whatever the recipient holds. See [AtomicAssets actions](../reference/atomicassets/actions.md#mintasset).

Two properties follow from storage rather than gas. The bill is a stake rather than a burn: the row's RAM is released when the row is erased, and `burnasset` erases it. And the bill is transferable. The `ram_payer` field is independent of the owner: it moves to an authorized editor on `setassetdata`, the V2 reassignment actions move it deliberately, and `payofferram` lets a service take over an offer's RAM so its users do not have to hold any.

The template level exists for this reason. Data shared by many assets is stored and paid for once instead of once per asset, which is a saving with no counterpart when every mint writes its own record.

## How a resale royalty is applied

ERC-2981 gives a contract a `royaltyInfo` view that returns a recipient and an amount for a given sale price. It is a signal. The token contract does not run it during a transfer and cannot make a payment happen, so whether the recipient is paid depends on the marketplace that settles the trade choosing to read it and act on it.

AtomicMarket does the arithmetic itself. Every sale, auction claim, and buyoffer acceptance routes through one payout function that deducts the maker marketplace fee, the taker marketplace fee, the collection fee, and any active bonus fees, credits each recipient, and gives the seller the remainder. The collection's rate is read from the collection row at settlement, not taken from the listing. See [AtomicMarket fees and royalties](../reference/atomicmarket/fees-and-royalties.md#every-settlement-stacks-four-fee-layers-before-the-seller-is-paid).

The boundary matters as much as the mechanism. The arithmetic lives in AtomicMarket, and it is settling through AtomicMarket that applies it. AtomicAssets stores the collection's `market_fee` and never spends it: `transfer` moves the asset and deducts nothing, so two accounts trading directly pay no royalty. What the design buys is that a seller cannot choose a storefront that pays the collection less, because the number is not the storefront's to apply. See [Royalties are settlement math](royalties.md).

## Next

- [Why an asset has four levels](four-level-model.md) is the data model this page keeps referring to.
- [Royalties are settlement math](royalties.md) is the settlement side in full.
- [Mint your first asset on testnet](../tutorials/first-collection.md) is the shortest way to see the difference rather than read about it.
