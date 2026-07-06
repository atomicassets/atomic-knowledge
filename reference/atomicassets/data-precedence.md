# Attribute data precedence

An asset's displayed attributes can come from up to three separate storage locations that all serialize against the same schema: the template's immutable data, the asset's own immutable data, and the asset's mutable data. The contract never merges these on-chain - every table stores its own layer as raw serialized bytes, and it is up to whatever reads the chain (an indexer, an API, a client library) to deserialize each layer and combine them into one effective attribute set. When more than one layer defines the same attribute name, the layers do not average or concatenate: one layer's value wins outright. (V2 adds a fourth layer, template mutable data; see "Changed in V2" below.) Contract citations below are against tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets).

## Where each layer lives

- **Template immutable data** - `templates.immutable_serialized_data`, scoped by `collection_name`, keyed by `template_id`. Set once in `createtempl` / `createtempl2` and never modified by any other action; it is copied nowhere else and does not change even if the schema is later extended.
- **Asset immutable data** - `assets.immutable_serialized_data`, scoped by `owner`, keyed by `asset_id`. Set once in `mintasset` and never modified afterward (transfers copy it verbatim into the new owner's scope; no action rewrites it).
- **Asset mutable data** - `assets.mutable_serialized_data`, scoped by `owner`, keyed by `asset_id`. Set at mint and the only one of the three an authorized editor can change later, via `setassetdata`.

Changed in V2: a fourth layer. `template_mutables` (contract table `templates2`), scoped by `collection_name` and keyed by `template_id`, holds a `mutable_serialized_data` for the template itself, set via `createtempl2` or changed via `settempldata`. A V1 integrator's mental model of "templates are always fully immutable" no longer holds in V2: two different assets referencing the same template can see that template's mutable attributes change together, independent of anything at the asset level. This layer only exists as a table row once non-empty data has been set for that template.

Source: atomicassets-contract src/atomicassets.cpp:697-788 (mintasset writes both asset layers), :796-836 (setassetdata rewrites only the mutable layer), :1579-1655 (internal_create_template writes the template immutable layer and, if given non-empty data, the template mutable layer), :846-907 (settempldata is the only action that changes template mutable data later).

## Serialization: identifiers are positions, not names

All four layers serialize the same way: `atomicdata::serialize` walks the schema's `format` vector in order, and for every attribute name present in the caller-supplied map, writes a varint identifier equal to `(position in format vector) + RESERVED` (`RESERVED = 4`) followed by the type-specific encoding, then moves to the next format line. An attribute whose name is not in the supplied map is skipped entirely - it does not get written as a null or a default value, it is simply absent from the byte stream. `deserialize` does the reverse: it reads an identifier, looks up `format.at(identifier - RESERVED)` to know the attribute's name and type, decodes the value, and repeats until the byte vector is exhausted.

Two consequences follow directly from this:

1. **A reader cannot assume a layer's deserialized map contains every schema-defined attribute.** If mint-time data omitted a key, that key is absent from the map after deserializing, not present with a zero or empty value. Effective-attribute computation has to treat a missing key as "this layer has no opinion," not as an explicit value.
2. **This is why schemas can only be extended, never edited.** The identifier for an attribute is its index in the format vector at serialization time. Reordering or removing a line would change what index every later attribute maps to, making every already-serialized byte string on chain decode to the wrong attribute names.

Source: atomicassets-contract include/atomicdata.hpp:46 (`RESERVED`), :488-510 (`serialize`, skip-if-absent at :492-493), :513-524 (`deserialize`, identifier-to-format lookup at :519); include/checkformat.hpp (format validity, re-checked on every `extendschema` call).

## Effective attribute precedence

For a given attribute name, the effective value a reader should present is chosen by this priority, highest first:

1. Template immutable data (if the asset has a `template_id >= 0` and the template defines that attribute)
2. Asset immutable data
3. Asset mutable data
4. Template mutable data (V2), which the reference reader folds in below all three above (see the note below); the contract prescribes no slot for it, so this ranking is the reader's choice, not a chain-level rule.

This means the template's immutable value for a given key always wins over anything set at the asset level for that same key, even a value an editor later pushes through `setassetdata`. In practice, collections avoid this collision by design: shared attributes (name, artwork, rarity) live on the template, and only attributes the template doesn't define (a serial number, a leveling stat, a one-off trait) are set at the asset level - but the contract does not enforce that separation, so nothing stops an attribute name from existing in more than one layer, and readers must resolve the collision the same way every time.

Source (reader implementation, not contract): the V2-aware `atomicassets-api` fork at `src/api/namespaces/atomicassets/format.ts:1-36` (`formatAsset`) builds the merged `data` object with a single object spread, folding all four layers in this order: `template.mutable_data`, then asset `mutable_data`, then asset `immutable_data`, then `template.immutable_data` last. Because a later spread key overwrites an earlier one, the resulting precedence, highest first, is template immutable > asset immutable > asset mutable > template mutable - template immutable still wins every collision, and template mutable sits at the bottom. This fork also runs a `templates2` filler processor (`src/filler/handlers/atomicassets/processors/templates.ts`), so it reads and folds the V2 template mutable layer rather than ignoring it. That bottom slot is this reader's own choice: the contract prescribes no precedence at all, since it stores each layer as raw bytes and never merges them on chain.

Live chain observation (wax.api.atomicassets.io `/atomicassets/v1/assets?collection_name=alien.worlds&template_id=13728`): asset `1099511946686` has empty `immutable_data` and `mutable_data` of its own, and its merged `data` (`name: "Male Cyborg T15"`, `rarity: "Rare"`, `img`, `backimg`, `race`, `cardid`) is identical, key for key, to `template.immutable_data` - confirming that with no asset-level values in play, the template layer passes straight through.

## What a reader must do

To compute an asset's effective attributes from scratch:

1. Fetch the asset row and deserialize `immutable_serialized_data` and `mutable_serialized_data` against the asset's `schema_name` format (the schema as it currently exists - schema extensions are backward compatible with old serialized data since new lines only add higher identifiers).
2. If `template_id >= 0`, fetch the template row and deserialize its `immutable_serialized_data` against the same schema format.
3. If the reader supports V2 template mutable data, fetch the `templates2` row for that `template_id` (it may not exist) and deserialize its `mutable_serialized_data`.
4. Merge in this order, letting each later step override matching keys: template mutable data, then asset mutable data, then asset immutable data, then template immutable data. That is the order the `atomicassets-api` reference reader uses (template mutable at the bottom, template immutable at the top). The contract prescribes no order of its own, so a reader with a different use case is free to place the template mutable layer elsewhere; this order simply matches the reference implementation.
5. Treat a key absent from all fetched layers as unset, not as an empty string or zero - the serialization format never encodes "no value" as anything other than the key's absence.

Source: derived from atomicassets-contract src/atomicassets.cpp:697-788, 796-836, 846-907, 1579-1655 and include/atomicdata.hpp:488-524, cross-checked against atomicassets-api src/api/namespaces/atomicassets/format.ts:1-36.
