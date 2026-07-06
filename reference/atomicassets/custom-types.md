# AtomicAssets attribute type system

Validated behavior of the ABI/C++ types the `atomicassets` contract uses to describe and carry attribute data: the `FORMAT` schema-line struct, the `ATOMIC_ATTRIBUTE` variant, the `ATTRIBUTE_MAP` map type, and the V2-only `FORMAT_TYPE` metadata struct. This document covers the type system and its ABI/JSON representation; the byte-level encoding those types eventually produce is covered in `reference/atomicassets/serialization.md`, which is the file to read for wire format, not this one. Raw-vs-patched ABI mechanics are covered in `reference/contract-releases.md`; this file only notes where that concern touches these specific types. Full table shapes and scoping for `schemas`/`schematypes`/`templates`/`assets` are covered in `reference/atomicassets/structure.md`; this file focuses on the `FORMAT`/`FORMAT_TYPE`/`ATOMIC_ATTRIBUTE`/`ATTRIBUTE_MAP` types themselves. Contract citations below are against tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets).

## FORMAT declares one attribute's name and wire type

```cpp
struct FORMAT {
    std::string name;
    std::string type;
};
```

A schema is a `vector<FORMAT>`, one line per attribute, and the position of a line in that vector is itself meaningful (see `reference/atomicassets/serialization.md`). `check_format` enforces three rules on a candidate `vector<FORMAT>`: every `name` is non-empty and at most 64 characters; every `type` matches one of the allowed type strings below; no two lines share a `name`; and at least one line must be exactly `{"name": "name", "type": "string"}`. That last rule is a distinct 64-character limit from `check_name_length`, which instead caps the *value* stored under an attribute literally named `name` (any schema, not just the required line). The two checks share a number but apply to different things: one to the schema's declared attribute-name string, the other to the data's `name`-valued string at write time.

Source: `include/atomicdata.hpp` lines 35-38 (struct); `include/checkformat.hpp` lines 32-97 (`check_format`), especially lines 43-44 and 95-96 (name length and required `name` line); `src/atomicassets.cpp` lines 1895-1905 (`check_name_length`).

## Allowed format type strings

`check_format` accepts exactly these base type strings, each optionally suffixed with one `[]` (nested arrays are rejected; see `reference/atomicassets/serialization.md`):

`int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `fixed8`, `fixed16`, `fixed32`, `fixed64`, `bool`, `ipfs`, `bytes`, `float`, `image`, `string`, `double`.

Two of these names are worth flagging precisely, because the validator's accepted list and the codec's implemented list disagree by one entry each:

- `bytes` passes `check_format` (it matches the `bytes`/`float`/`image` five-character prefix branch), but neither `serialize_attribute` nor `deserialize_attribute` has a case for the literal string `"bytes"`. A schema that somehow stored `"bytes"` as a FORMAT type would fail the very first attempt to serialize or deserialize an attribute of that type, with `check(false, "No type could be matched - bytes")`.
- `byte` (singular) rides along in the `||` of one branch of each codec function: `serialize_attribute` pairs it with `fixed8` (one raw byte, no varint) and `deserialize_attribute` pairs it with `bool` (read one raw byte back). That `"byte"` branch is unreachable dead code. `check_format` has no branch that accepts the bare four-character string `"byte"` (it is too short to match the five-character `bytes`/`float`/`image` prefix check, and not a match for the four-character `bool`/`ipfs` check either), so a schema attribute can never be declared with type `"byte"`. Array recursion never produces it either: `fixed8[]` and `bool[]` recurse with the base type string sliced off the `[]` suffix, which is `"fixed8"` and `"bool"` respectively, and each dispatches to its own branch. No call path ever passes the literal `"byte"` into either codec function.

Source: `include/checkformat.hpp` lines 10-30 (type list comment), lines 50-87 (accepted base types and the single `[]` suffix rule); `include/atomicdata.hpp` lines 266-268 (`serialize_attribute` `fixed8`/`byte` case), lines 475-477 (`deserialize_attribute` `bool`/`byte` case).

## ATOMIC_ATTRIBUTE is a variant over 22 alternatives, in a fixed order

```cpp
typedef std::variant <
    int8_t, int16_t, int32_t, int64_t,
    uint8_t, uint16_t, uint32_t, uint64_t,
    float, double, std::string,
    INT8_VEC, INT16_VEC, INT32_VEC, INT64_VEC,
    UINT8_VEC, UINT16_VEC, UINT32_VEC, UINT64_VEC,
    FLOAT_VEC, DOUBLE_VEC, STRING_VEC> ATOMIC_ATTRIBUTE;
```

The eleven `*_VEC` alternatives (`INT8_VEC` through `STRING_VEC`) are named typedefs over `std::vector<T>` rather than bare `std::vector<T>` written inline in the variant. The header's own comment states this exists because a bug in ABI serialization would otherwise produce an invalid ABI. A variant's on-wire tag is the zero-based index into this alternative list, so the list's order is part of the ABI contract: in the generated ABI these alternatives are named `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `float32`, `float64`, `string`, `INT8_VEC`, `INT16_VEC`, `INT32_VEC`, `INT64_VEC`, `UINT8_VEC`, `UINT16_VEC`, `UINT32_VEC`, `UINT64_VEC`, `FLOAT_VEC`, `DOUBLE_VEC`, `STRING_VEC`; note `float32`/`float64` rather than the FORMAT type strings `float`/`double`. These variant-alternative names are a separate vocabulary from the FORMAT type strings in the previous section: a `FORMAT` line's `type` (for example `"ipfs"`, `"image"`, `"bool"`, `"fixed8"`) selects the wire encoding described in `reference/atomicassets/serialization.md`, while the `ATOMIC_ATTRIBUTE` alternative a caller must pick (for example `string`, `uint8`) selects which variant case the ABI carries the value in when the value is placed into the `ATTRIBUTE_MAP` for a transaction. An `ipfs`- or `image`-typed attribute's value is supplied as the `string` alternative, and a `bool`-, `byte`-, or `fixed8`-typed attribute's value is supplied as the `uint8` alternative, matching the `holds_alternative` checks in `serialize_attribute`.

There is no dedicated boolean-array alternative: a `bool[]` attribute's value is supplied as `UINT8_VEC`, the same alternative used for `uint8[]` and `fixed8[]`.

Source: `include/atomicdata.hpp` lines 11-31 (typedefs, variant, and the ABI-bug comment); `atomicassets.abi` `variants` and `types` sections (alternative names and order, `ATOMIC_ATTRIBUTE` type alias); `include/atomicdata.hpp` lines 240-331 (which FORMAT type checks which variant alternative on encode).

## ATTRIBUTE_MAP pairs an attribute name with its ATOMIC_ATTRIBUTE value

```cpp
typedef std::map <std::string, ATOMIC_ATTRIBUTE> ATTRIBUTE_MAP;
```

`ATTRIBUTE_MAP` is the parameter type for every action that accepts attribute data. `mintasset`, `setassetdata`, `createtempl`/`createtempl2`, `setcoldata`, and others all take one or more `ATTRIBUTE_MAP` arguments, and the contract itself calls the `serialize`/`deserialize` codec (`reference/atomicassets/serialization.md`) against the relevant schema's `FORMAT` list on execution. Callers never construct the serialized bytes directly; they build an `ATTRIBUTE_MAP` as ABI JSON and let the action do the encoding.

In the ABI, `ATTRIBUTE_MAP` is generated as `pair_string_ATOMIC_ATTRIBUTE[]` (an array of two-field structs) rather than as a JSON object, because EOSIO/Antelope ABI maps serialize as arrays of key/value pairs, not native JSON objects. Each pair's fields, and the variant field inside each pair, follow standard Antelope ABI JSON conventions: a variant value is a two-element JSON array of `[alternative_name, value]`, and the raw (unpatched) ABI names the pair's fields `first`/`second` rather than `key`/`value`. For example, an unpatched-ABI `ATTRIBUTE_MAP` entry for a string attribute named `rarity` is `{"first": "rarity", "second": ["string", "common"]}`.

Source: `include/atomicdata.hpp` line 33 (`ATTRIBUTE_MAP` typedef); `atomicassets.abi` `types` section (`ATTRIBUTE_MAP` aliased to `pair_string_ATOMIC_ATTRIBUTE[]`) and `structs` section (`pair_string_ATOMIC_ATTRIBUTE` fields `first`/`second` in the raw ABI, `key`/`value` in the patched ABI).

## The raw-vs-patched ABI concern applies directly to ATTRIBUTE_MAP

`reference/contract-releases.md` documents that `make build`'s raw CDT 4.1 ABI and `make release`'s patched ABI differ in exactly two ways: `vector<uint8_t>` renders as `bytes` in the raw ABI versus `uint8[]` in the patched one, and pair fields render as `first`/`second` in the raw ABI versus `key`/`value` in the patched one. Both differences land squarely on `ATTRIBUTE_MAP`: its pair wrapper is exactly the `first`/`second` vs `key`/`value` case, and its `UINT8_VEC` variant alternative is exactly the `bytes` vs `uint8[]` case. The raw ABI generated from this source names both `INT8_VEC` and `UINT8_VEC` as `bytes` (confirmed directly against the built `atomicassets.abi`'s `types` section), which is the same ambiguity `reference/contract-releases.md` describes: the patch verifier cannot distinguish a legitimately-`bytes` `vector<int8_t>` from a `vector<uint8_t>` that should become `uint8[]`. A tool that reads the patched ABI and needs to build an `int8[]`-typed attribute value must still address it by its variant alternative name `INT8_VEC`, since the patch only ever relabels the `UINT8_VEC` alternative to `uint8[]`.

Source: `atomicassets.abi` `structs` section (`pair_string_ATOMIC_ATTRIBUTE` fields `first`/`second` in the raw ABI); `atomicassets.abi` `types` section (`INT8_VEC` and `UINT8_VEC` both aliasing `bytes` in the raw ABI); `reference/contract-releases.md` (raw vs patched ABI mechanics, not duplicated here).

## FORMAT_TYPE is new in V2, and never reaches the binary codec

```cpp
struct FORMAT_TYPE {
    std::string name;
    std::string mediatype;
    std::string info;
};
```

`FORMAT_TYPE` and its action `setschematyp` do not exist in the V1 contract source at all. In V2, `setschematyp` writes a `vector<FORMAT_TYPE>` into a schema-scoped `schematypes` table, keyed by `schema_name` alongside the existing `schemas` table. The contract enforces only two rules on `schema_format_type`: names must be unique within the vector, and every `name` must match an existing `FORMAT.name` in that schema. `mediatype` and `info` are free-form strings with no contract-side validation. Per the action's own comment, this exists to describe a schema attribute (for example labeling what a "Rarity" attribute means) or to tag a media type for an IPFS-backed attribute (for example marking a hash as a `.glb` or `.png` file) for downstream tooling to interpret. `FORMAT_TYPE` rows never pass through `atomicdata::serialize`/`deserialize`. They are plain ABI-serialized table rows, not custom-binary-encoded `vector<uint8_t>` blobs, so `reference/atomicassets/serialization.md`'s codec has no bearing on them at all.

Source: `include/atomicdata.hpp` lines 40-44 (struct, present in V2 only); `include/atomicassets.hpp` lines 109-114 (`setschematyp` action declaration), lines 373-379 (`schema_types_s` / `schematypes` table); `src/atomicassets.cpp` lines 514-560 (`setschematyp` implementation and its validation rules); confirmed absent from the V1 contract source tree (`include/atomicassets.hpp`, `include/atomicassets-interface.hpp`, `src/atomicassets.cpp`).
