# AtomicAssets attribute serialization

Validated behavior of the custom binary format the `atomicassets` contract uses to store attribute data (collection data, and template/asset immutable and mutable data) as `vector<uint8_t>` table fields instead of raw ABI structs. The format is schema-driven: encoding and decoding both require the same ordered `FORMAT` list (see `reference/atomicassets/custom-types.md`) that produced the bytes. Baseline is the V2 contract, tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets); the encoding logic is unchanged from V1 (see "Changed in V2" below).

## The format trades a schema lookup for RAM

Storing attribute data as ABI-serialized structs would repeat each attribute's name and type tag in every row. The custom format stores only a varint-encoded position number per attribute plus its raw value, and keeps the name/type pairing once, in the schema's `FORMAT` list. Decoding a row means walking that external `FORMAT` list in parallel with the byte stream; nothing in the byte stream is self-describing. This is why the same schema must never renumber existing attributes (see "Identifiers are position numbers, not names" below) and why an off-chain reader cannot decode `immutable_serialized_data` or `mutable_serialized_data` without also fetching the schema that produced it.

The same codec also serializes collection data, using a single contract-wide `FORMAT` list stored in the `config` table (`collection_format`, extended only by `admincoledit`) instead of a per-schema one.

Source: `include/atomicdata.hpp` lines 488-524; `src/atomicassets.cpp` lines 18-31 (`admincoledit`), 156, 182 (collection data via `config.collection_format`); `src/atomicassets.cpp` lines 763-764, 834, 1617, 1644 (template/asset data via `schema.format`).

## Varints compress small numbers into few bytes

`toVarintBytes` encodes an unsigned integer as a little-endian base-128 sequence: each output byte holds 7 value bits, and the high bit is set on every byte except the last to signal "more bytes follow." `unsignedFromVarintBytes` reverses this by reading bytes while the high bit is set, accumulating `(byte - 128) * 128^i`, then adding the final byte with the high bit clear. This is the same LEB128-style scheme Protobuf uses for varints. When a value's original bit width is known and less than 64 bits, `toVarintBytes` first masks the input to that width (`number &= (1 << (original_bytes * 8)) - 1`) before encoding, so an `int8` never emits more than the bytes its declared width could produce.

Source: `include/atomicdata.hpp` lines 49-79.

## Zigzag encoding lets signed integers use the same varint codec

Varints are efficient for small non-negative numbers; a naive two's-complement negative number would set nearly every bit and always encode at full width. Zigzag mapping avoids that by interleaving signed values across the non-negative range: `zigzagEncode` maps a negative `value` to `(-(value + 1)) * 2 + 1` (an odd number) and a non-negative value to `value * 2` (an even number), so small-magnitude negatives and small-magnitude positives both produce small varints. `zigzagDecode` reverses this: even inputs divide by two, odd inputs divide by two and negate minus one. Every signed FORMAT type (`int8`/`int16`/`int32`/`int64`) is zigzag-encoded before being varint-encoded; unsigned types (`uint8`/`uint16`/`uint32`/`uint64`) skip zigzag and are varint-encoded directly.

Source: `include/atomicdata.hpp` lines 105-119.

## Each FORMAT type has one specific wire encoding

`serialize_attribute` and `deserialize_attribute` switch on the FORMAT type string. The scalar (non-array) encodings are:

| FORMAT type | Wire encoding |
| --- | --- |
| `int8` / `int16` / `int32` / `int64` | zigzag-encode, then varint-encode, masked to 1/2/4/8 bytes |
| `uint8` / `uint16` / `uint32` / `uint64` | varint-encode directly, masked to 1/2/4/8 bytes |
| `fixed8` / `byte` | 1 raw byte, no varint, no zigzag |
| `fixed16` / `fixed32` / `fixed64` | 2/4/8 raw little-endian bytes, no varint, no zigzag |
| `float` | 4 raw bytes, a direct `reinterpret_cast` of the IEEE 754 `float` (native byte order) |
| `double` | 8 raw bytes, a direct `reinterpret_cast` of the IEEE 754 `double` (native byte order) |
| `string` / `image` | varint-encoded UTF-8 byte length, then the raw UTF-8 bytes; `image` is only a display convention, its wire encoding is identical to `string` |
| `ipfs` | the string is first Base58-decoded (standard Bitcoin alphabet, no checksum, via `include/base58.hpp`) to raw bytes, then varint-encoded byte length followed by those raw bytes |
| `bool` | 1 raw byte that must be `0` or `1`; the contract rejects any other value on encode |

`fixed*` types differ from `uint*` only in skipping varint compression: both are zigzag-free, but `fixed*` always spends its full declared width while `uint*` shrinks to as few bytes as the value needs. `int*` is not zigzag-free: `serialize_attribute` applies `zigzagEncode` to every `int*` value before varint-encoding it (per the table above), so it is neither zigzag-free like `uint*`/`fixed*` nor fixed-width like `fixed*`.

Source: `include/atomicdata.hpp` lines 240-331 (serialize), lines 415-485 (deserialize).

## Arrays are a varint length prefix followed by repeated element encoding, one level deep

A FORMAT type ending in `[]` serializes as a varint-encoded element count, followed by each element encoded with its base type's own rules (so `uint32[]` is a varint count followed by that many varint-encoded `uint32` values). `checkformat.hpp` rejects a second `[]` suffix at schema-creation time, so nested arrays (for example `uint64[][]`) can never exist. On the C++ side, the array element's runtime container is a fixed set of typedefs (`INT8_VEC` through `STRING_VEC`); `bool[]`, `fixed8[]`, and `uint8[]` all share the same `UINT8_VEC` (`vector<uint8_t>`) container, since there is no dedicated boolean array alternative in `ATOMIC_ATTRIBUTE` (see `reference/atomicassets/custom-types.md`); only the base type string passed into the per-element recursive call (`bool` vs `fixed8` vs `uint8`) decides each element's actual wire encoding and validation.

Source: `include/atomicdata.hpp` lines 122-238 (serialize array branch), lines 336-413 (deserialize array branch); `include/checkformat.hpp` lines 83-87 (single-level `[]` enforcement).

## Identifiers are position numbers, not names

`serialize` walks the schema's `FORMAT` list in order, and for each attribute present in the supplied `ATTRIBUTE_MAP` writes a varint-encoded identifier equal to `(position in the FORMAT list) + RESERVED`, where `RESERVED` is the constant `4`, followed by that attribute's encoded value. Attributes absent from the map are simply skipped (no placeholder byte). `deserialize` reads a stream of `(identifier, value)` pairs until it runs out of bytes, and looks up `format_lines.at(identifier - RESERVED)` to know which type to decode next and which name to attach the result to. Because the identifier is a position in the `FORMAT` list rather than a hash or name, extending a schema (`extendschema`) or the collection format (`admincoledit`) only ever appends new lines: inserting or reordering existing lines would silently repoint every previously stored identifier at a different attribute. Both extension actions insert only at the end of the existing list before re-running `check_format` on the result.

Source: `include/atomicdata.hpp` lines 46, 488-524; `src/atomicassets.cpp` lines 482-506 (`extendschema` appends), lines 18-34 (`admincoledit` appends).

## Serializing and deserializing off-chain

An off-chain implementation needs three things, in this order:

1. **The schema's current `FORMAT` list.** Read the `schemas` table (scoped by `collection_name`, keyed by `schema_name`) to get the ordered `vector<FORMAT>` that was current when the data was written. For collection data, read the contract's singleton `config` table instead and use `collection_format`.
2. **The varint/zigzag codec.** Implement `toVarintBytes`/`unsignedFromVarintBytes` and `zigzagEncode`/`zigzagDecode` exactly as described above. These are not standard varints with a sign bit baked in; zigzag is a separate transform applied only to signed types before varint-encoding.
3. **The per-type encode/decode table above**, including the array rule (varint count + repeated elements, one level only) and the identifier arithmetic (`position + 4` on encode, `identifier - 4` on decode).

To serialize an `ATTRIBUTE_MAP` for submission in a transaction (`mintasset`, `setassetdata`, `createtempl`, `setcoldata`, and similar actions all take `ATTRIBUTE_MAP` parameters that the contract itself serializes on execution; the caller passes attribute maps, not bytes), an off-chain caller does not need this codec at all: it constructs the `ATTRIBUTE_MAP` as ABI JSON per `reference/atomicassets/custom-types.md` and lets the contract's own `serialize` call do the encoding. This codec is needed off-chain specifically to decode `immutable_serialized_data` / `mutable_serialized_data` / collection `serialized_data` bytes read back from `get_table_rows`, or to reproduce the contract's stored bytes for verification. Decoding each layer with this codec is only the first step; combining template and asset layers into one effective attribute set is a separate concern covered in `reference/atomicassets/data-precedence.md`.

Source: `include/atomicassets.hpp` lines 363-421 (`schemas_s`, `templates_s`, `template_mutables_s`, `assets_s` table shapes); `include/atomicassets.hpp` line 458 (`config_s.collection_format`).

## What indexers and readers must implement

- The varint and zigzag codec (above), byte-exact with the contract's implementation: a one-bit deviation desyncs every subsequent field in the row.
- A schema cache keyed by `collection_name` + `schema_name` (and, for collection data, the contract's `collection_format`), refreshed whenever `createschema`, `extendschema`, or `admincoledit` fire, since decoding requires the `FORMAT` list version that was current at write time. Because extension is append-only, a reader that has synced every extension action always has a `FORMAT` list at least as long as any stored data requires.
- Per-type decoders matching the table above exactly, including that `image` and `string` share a decoder, and that `ipfs` values must be re-encoded to Base58 for display.
- Handling for an out-of-range identifier (`identifier - RESERVED` beyond the cached `FORMAT` list length): this means the reader's schema cache is behind the chain, not that the data is corrupt, and the row should be deferred rather than dropped.

Source: `include/atomicdata.hpp` lines 513-524.

## Changed in V2

The serialization algorithm itself (varint/zigzag encoding, the per-type wire formats, the array rule, and the identifier arithmetic) is byte-for-byte unchanged from V1; a V1 reader that already understands this codec can decode V2 asset and template data without modification. V2 adds `FORMAT_TYPE` schema metadata (media type / description hints) as a wholly separate mechanism that never passes through this codec; see `reference/atomicassets/custom-types.md`.

Source: `include/atomicdata.hpp` (identical serialize/deserialize/varint/zigzag logic between the V1 and V2 contract source trees); `include/checkformat.hpp` (identical type-validation logic between V1 and V2, aside from a by-reference parameter refactor with no behavior change).
