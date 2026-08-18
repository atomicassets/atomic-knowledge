---
scope: What the chain records when an account owns an AtomicAssets asset, why a transfer moves a row between scopes, and the one part of an asset that is a reference
depends-on: [reference/atomicassets/structure.md, reference/atomicassets/tables.md, reference/media.md, reference/atomicassets/actions.md]
key-modules: []
---

# Ownership is a table scope

An account owns an asset because the asset's row lives in a table scoped to that account. There is no separate ledger of who holds what, and no field on the row saying who the owner is. The scope is the record.

## What a transfer moves

`transfer` moves the row out of the sender's scope and into the recipient's, carrying the asset's data with it. The immutable data is copied verbatim; no action rewrites it, on transfer or afterward.

Two things follow that surprise people.

The first is that a recipient who has never held an AtomicAssets asset has no scope yet, so one has to be created, and the sender pays for it. The transfer fails outright if the sender cannot cover that.

The second is that paying for an asset's storage and owning it are separate facts. The row carries a `ram_payer` field that is independent of the scope: the minter pays first, an authorized editor takes the bill over on `setassetdata`, and the V2 reassignment actions move it again without moving the asset. See [AtomicAssets actions](../reference/atomicassets/actions.md#ram-payer-reassignment-replaces-descoped-custodial-rentals) ("RAM-payer reassignment (replaces descoped custodial rentals)").

## Why that is stronger than a row in a database

The interesting property is not that the data is stored somewhere durable. It is that changing it takes a signature the contract checks, and the rules about which signature are themselves on chain.

Only the owner can move the asset, and only when the template allows it. Only an account on the collection's `authorized_accounts` list can change the asset's mutable data, and that list is a field on the collection row that only the author can edit. Nobody operating the service that displays the asset is in that path at all. See [AtomicAssets data model structure](../reference/atomicassets/structure.md#authorization-and-the-24-account-cap) ("Authorization and the 24-account cap").

## The caveat: media is a reference, not the thing

The chain stores no image bytes and has no media column. Media is an ordinary schema attribute whose value is an IPFS reference, under a field name that is collection convention rather than contract rule. The stored value is a bare content reference with no scheme and no host, and a minter can put a plain `https://` URL there instead, because nothing in the contract constrains the string.

So the attribute is chain state and the picture is not. A client resolves the reference at render time by choosing a gateway, and whether the referenced content is still served is a separate question the chain does not answer. As [Media conventions](../reference/media.md#resolving-a-reference-to-a-fetchable-url) ("Resolving a reference to a fetchable URL") puts it, a CID on chain is a claim about content, not a guarantee any node still serves it.

That is the honest shape of the guarantee. What the asset is, who owns it, what its attributes say, and who may change any of that are chain state. The bytes a renderer draws are pinned by whoever chose to pin them.

## Next

- [Media conventions](../reference/media.md) covers the field names, the value shapes, and how to resolve one.
- [AtomicAssets tables](../reference/atomicassets/tables.md#assets) is the column reference for the asset row.
- [Offers: the native two-sided trade flow](../guides/offers.md) is how two accounts swap assets without a market.
