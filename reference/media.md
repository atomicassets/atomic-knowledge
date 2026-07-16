---
scope: How NFT media is referenced in the Atomic ecosystem - IPFS storage, de-facto media field-name conventions, bare-CID vs URL handling, and gateway resolution
depends-on:
    - reference/atomicassets/serialization.md
    - reference/atomicassets/custom-types.md
    - reference/atomicassets/data-precedence.md
key-modules: ["atomicassets-contract (v2.0.0-rc4): include/atomicdata.hpp (image/ipfs wire types); live reads of wax.api.atomicassets.io and public IPFS gateways"]
---

# Media conventions

How an Atomic NFT points at its media, and what an integrator must do to render it. The chain stores no image bytes and no media column: media is carried as ordinary schema attributes whose values are IPFS references, under field names that are collection convention rather than contract rule. This page covers those conventions and how to resolve them. The wire encoding of the `ipfs` and `image` FORMAT types is in `reference/atomicassets/serialization.md`; the V2 `FORMAT_TYPE` media-type mechanism is in `reference/atomicassets/custom-types.md`; which data layer a given attribute comes from is in `reference/atomicassets/data-precedence.md`. This file does not restate those.

## Media is attribute data, not a dedicated field

An asset's image, animation, and any other media are stored as normal attributes in the same serialized data layers as every other attribute - template immutable, asset immutable, asset mutable, and (V2) template mutable data - and are read back by deserializing those layers and merging them (`reference/atomicassets/data-precedence.md`). There is no media-specific column on the `assets`, `templates`, or `collections` tables; a media attribute is distinguished only by its name and the shape of its value. Collection-level media follows the same rule: a collection's own artwork lives in its `collection_format`-serialized data under attribute names, not in a fixed schema field.

Source: live read, `https://wax.api.atomicassets.io/atomicassets/v1/templates?collection_name=alien.worlds` (each template's `immutable_data` carries the media attributes inline alongside `name`, `rarity`, and the rest); `reference/atomicassets/data-precedence.md` for the layer merge

## The media field names are de-facto conventions

The contract mandates exactly one attribute - a `string` attribute literally named `name` (`reference/atomicassets/structure.md`). Every media field name is a convention a collection chose, and readers must treat these names as data, not as guaranteed keys. The widely observed conventions on WAX are:

- `img` - the primary still image. Present across alien.worlds, farmersworld, gpk.topps, official.wax, kogsofficial, and effectively every card-style collection sampled.
- `backimg` - a reverse or back-of-card image (alien.worlds `arms.worlds`, kogsofficial `pets.v1`).
- `video` - an animation or video loop, used alongside `img` as a richer render (official.wax `walkers`, kogsofficial `pets.v1`).

Collection artwork uses `img` for the collection logo and an `images` attribute carrying a JSON-encoded string map for named renditions - observed on official.wax as `images: "{\"banner_1920x500\":\"Qm...\",\"logo_512x512\":\"Qm...\"}"`, a JSON object serialized into a single string attribute rather than structured on-chain fields. A reader that wants the banner must parse that inner JSON itself.

None of these names is reserved or validated, so a collection can omit them, rename them, or add others (`audio`, `model`, a `.glb` field); a renderer keyed to a fixed name list silently shows nothing for a collection that named its image something else. Discover the media fields a collection actually uses by reading its schema `format` and its data, not by assuming `img`.

Source: live reads, `https://wax.api.atomicassets.io/atomicassets/v1/templates?collection_name=<col>` for alien.worlds, farmersworld, gpk.topps, official.wax, kogsofficial; `https://wax.api.atomicassets.io/atomicassets/v1/collections/official.wax` (collection `img`, and `images` JSON-string map)

## Media attributes are usually typed `image` or `string`, not `ipfs`

The FORMAT type system has a dedicated `ipfs` type (`reference/atomicassets/custom-types.md`), but the large sampled collections do not use it for their display media. Every `img` attribute observed is declared as type `image`, and `video`/`backimg` attributes are declared as `image` or plain `string`:

| Collection | Schema | Media attribute types (observed) |
| --- | --- | --- |
| official.wax | walkers | `img: image`, `video: string` |
| alien.worlds | arms.worlds | `img: image`, `backimg: image` |
| gpk.topps | packs | `img: image` |
| kogsofficial | pets.v1 | `img: image`, `video: string`, `backimg: string` |

This matters because `image` and `string` share one wire encoding and carry the value as a plain UTF-8 string - `image` is only a display-convention alias for `string` (`reference/atomicassets/serialization.md`). The `ipfs` type is the one that Base58-decodes its value to raw multihash bytes on chain; the `image`/`string`-typed media fields do not, so their stored value is the exact reference string the minter supplied. Two consequences: the attribute's declared type does not reliably tell you the value is an IPFS reference (an `image`-typed field is indistinguishable at the type level from any other string), and a reader must inspect the value's shape, not the schema type, to decide how to resolve it. The one place the `ipfs` type is conventionally used is `collection_format`, where the collection `img` is typically declared `ipfs` (`reference/atomicassets/tables.md`); even there the API hands you back a Base58 string, since `ipfs` values must be re-encoded to Base58 for display (`reference/atomicassets/serialization.md`).

Source: live reads, `https://wax.api.atomicassets.io/atomicassets/v1/schemas/<col>/<schema>` for the four rows above; `reference/atomicassets/serialization.md` (`image` == `string` wire encoding; `ipfs` Base58 round-trip)

## Media values are bare IPFS references, in several shapes

The stored value is a bare content reference with no URI scheme and no gateway host - not a `ipfs://` URL and not an `https://` URL. Across the sampled collections the value takes several shapes, and defensive parsing has to accept all of them:

- **Bare CIDv0** - a Base58 `Qm...` multihash, for example `img: "QmXHzdok8Sxvhj1tPXYk7vG6hnWayFU1WnvoPpieDsh55X"` (alien.worlds). This is the dominant form.
- **Bare CIDv1** - a Base32 `bafy...` string, for example `video: "bafybeiejeflvsf3h5j7j6q5cie4andjxv6qkbnekk2hahujezm3srpn4bu"` (official.wax `walkers`). A parser that only recognizes the `Qm` prefix drops these.
- **CID plus a path suffix** - a directory CID with a trailing file path, for example `img: "QmUt1n6b5re5FhuP7dFj73BS57MGNBYPP3uZeTnvYDtiyN/FoodFightPackArt_WinterCon.png"` (gpk.topps). The suffix is part of the reference and must be preserved through resolution, not stripped to the CID.

A minter can also store a full `https://` URL in these fields; nothing in the contract constrains the string. So a renderer must handle both a bare reference (prepend a gateway) and an already-absolute URL (use as-is), and must not assume the value begins with `Qm` or is a single path-free CID.

Source: live reads, `https://wax.api.atomicassets.io/atomicassets/v1/templates?collection_name=<col>` for alien.worlds, official.wax, gpk.topps

## Resolving a reference to a fetchable URL

The convention is a division of labor: the chain stores the bare CID (keeping the on-chain value small and gateway-agnostic), and the client chooses a gateway at render time and forms `https://<gateway>/ipfs/<value>`. Because the stored value already carries any path suffix, string concatenation onto `/ipfs/` produces the correct URL for the CID-plus-path form without special handling. If the value is already an absolute URL, resolution is a no-op - use it directly.

`https://ipfs.io/ipfs/<cid>` is the canonical public gateway and resolves these references: a live GET of `https://ipfs.io/ipfs/QmXHzdok8Sxvhj1tPXYk7vG6hnWayFU1WnvoPpieDsh55X` (the alien.worlds template `img` above) returns HTTP 206 with `Content-Type: image/webp` and the `RIFF....WEBP` file signature, confirming the bare on-chain CID fetches real image bytes through a public gateway with no chain-side transformation. Dedicated gateways (a project-run or commercial IPFS gateway) are used in production for latency and rate-limit headroom, and a resilient client resolves through its preferred gateway first and falls back to another on failure rather than hard-coding one host. Which gateway to use, and whether the referenced content stays pinned and therefore retrievable at all, are integrator and operator concerns that this ecosystem does not settle on chain: a CID on chain is a claim about content, not a guarantee any node still serves it.

Source: live gateway read, `GET https://ipfs.io/ipfs/QmXHzdok8Sxvhj1tPXYk7vG6hnWayFU1WnvoPpieDsh55X` (HTTP 206, `image/webp`, WebP magic bytes)

## V2 media-type descriptors

V2 adds an optional per-attribute descriptor - `setschematyp` writes a `FORMAT_TYPE { name, mediatype, info }` into the `schematypes` table, letting a collection tag what a media attribute holds (marking an image reference as a `.glb` model or a `.png`, for example) for downstream tooling. This is metadata only, never affects serialization or the stored value, and is covered in `reference/atomicassets/custom-types.md`. Do not infer a media type from the API's schema response: it synthesizes a default `mediatype` per attribute even when no on-chain descriptor exists, so the presence of a `mediatype` field is not evidence a real `FORMAT_TYPE` was set - read the `schematypes` table on chain to know (`reference/atomicassets/tables.md`). Absent a descriptor, the file type must be inferred from the fetched bytes (as the WebP signature above shows) or the value's path suffix, not from the attribute name.

Source: `reference/atomicassets/custom-types.md` (FORMAT_TYPE, setschematyp), `reference/atomicassets/tables.md` (API mediatype-synthesis caveat)

## Correct and avoid

Correct:

- Discover media fields from the collection's schema `format` and data; treat `img`/`backimg`/`video` as likely-but-not-guaranteed names.
- Accept every value shape: bare CIDv0 (`Qm...`), bare CIDv1 (`bafy...`), CID-plus-path, and full `https://` URLs.
- Resolve a bare reference as `https://<gateway>/ipfs/<value>` and use an already-absolute URL as-is; preserve any path suffix intact.
- Resolve through a preferred gateway with a fallback gateway on failure.
- Determine content type from the fetched bytes or a V2 `schematypes` descriptor read from chain, not from the attribute name.

Avoid:

- Hotlinking a single hard-coded gateway with no fallback - one gateway's outage or rate limit then blanks all media.
- Assuming `img` is always present, always a CID, or always begins with `Qm` - CIDv1, path suffixes, and full URLs all occur, and the field may be absent or renamed.
- Inferring "this is IPFS" from the attribute's FORMAT type - `image`/`string`-typed fields carry the reference as an opaque string and look identical to any other text attribute.
- Trusting the API's synthesized `mediatype` as proof a real media-type descriptor was set.
