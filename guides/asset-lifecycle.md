# Asset lifecycle: creating and managing AtomicAssets NFTs

The full creator flow on the `atomicassets` contract: create a collection, define a schema, optionally create a template, mint assets, edit mutable data, transfer, and burn. Baseline is AtomicAssets V2; notes call out where V1 differed. Every data shape, required authorization, RAM payer, and failure mode below was checked against tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets), `src/atomicassets.cpp`.

Each step shows the action's data as plain JSON first, then the same call through `@wharfkit/session`'s `session.transact()`. `ATTRIBUTE_MAP` fields (`data`, `immutable_data`, `mutable_data`) serialize as an array of `{key, value}` pairs, where `value` is a two-element `[type, value]` variant. The `key`/`value` naming is only present in the patched release ABI; the raw CDT build names the same fields `first`/`second`. See `reference/contract-releases.md` ("Raw vs patched ABI").

## Collection naming rules

`createcol` enforces one of three paths, checked in order:

1. If `collection_name` is already a registered account, that account must co-sign the transaction (`has_auth(collection_name)`), regardless of the name's length or format.
2. Otherwise, if the name contains a `.` (its EOSIO `suffix()` differs from the full name), the account matching the suffix must co-sign. This lets an account holding e.g. `wam` create `anything.wam` without registering `anything.wam` as a chain account first.
3. Otherwise, the name must be exactly 12 characters.

`author` must always sign the transaction on top of whichever of the above applies. Collection names are otherwise ordinary EOSIO/Antelope `name` values: lowercase `a`-`z`, digits `1`-`5`, and `.`, up to 12 characters, enforced structurally by the `name` type before the action body runs.

Source: `atomicassets-contract/src/atomicassets.cpp:105-117` (the three-path naming check inside `createcol`); the same rule exists in V1.

## Create a collection: createcol

```json
{
  "author": "mycreator11",
  "collection_name": "mycollectn1",
  "allow_notify": true,
  "authorized_accounts": ["mycreator11"],
  "notify_accounts": [],
  "market_fee": 0.05,
  "data": [
    { "key": "name", "value": ["string", "My Collection"] },
    { "key": "img", "value": ["string", "QmYourIpfsHash"] }
  ]
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'createcol',
    authorization: [session.permissionLevel],
    data: {
      author: session.actor,
      collection_name: 'mycollectn1',
      allow_notify: true,
      authorized_accounts: [session.actor],
      notify_accounts: [],
      market_fee: 0.05,
      data: [{ key: 'name', value: ['string', 'My Collection'] }],
    },
  },
})
```

- Required authorization: `author`, plus the co-signer required by the naming rule above.
- RAM payer: `author`.
- Fails when: a collection with this name already exists (`"A collection with this name already exists"`); `notify_accounts` is non-empty while `allow_notify` is false (`"Can't add notify_accounts if allow_notify is false"`); `authorized_accounts` or `notify_accounts` contains a nonexistent account or a duplicate; `market_fee` is outside `0` to `0.15` (the message is built with `std::to_string` of the `double` bound, so at runtime it reads `"The market_fee must be between 0 and 0.150000"`); or a `data` attribute named `name` exceeds 64 characters (`"Names (attribute with name: \"name\") can only be 64 characters max"`).

Source: `atomicassets-contract/src/atomicassets.cpp:91-158` (`createcol`), market_fee bound at `:141-142`; `MAX_MARKET_FEE` at `include/atomicassets.hpp:13`; name-length check at `src/atomicassets.cpp:1895-1905` (`check_name_length`).

## Create a schema: createschema

A schema is a named, append-only list of `{name, type}` attribute lines that assets and templates in the collection serialize their data against.

```json
{
  "authorized_creator": "mycreator11",
  "collection_name": "mycollectn1",
  "schema_name": "cards",
  "schema_format": [
    { "name": "name", "type": "string" },
    { "name": "img", "type": "image" },
    { "name": "power", "type": "uint32" }
  ]
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'createschema',
    authorization: [session.permissionLevel],
    data: {
      authorized_creator: session.actor,
      collection_name: 'mycollectn1',
      schema_name: 'cards',
      schema_format: [
        { name: 'name', type: 'string' },
        { name: 'img', type: 'image' },
        { name: 'power', type: 'uint32' },
      ],
    },
  },
})
```

- Required authorization: `authorized_creator`, who must be the collection's author or listed in its `authorized_accounts`.
- RAM payer: `authorized_creator`.
- Fails when: the caller isn't an authorized account for the collection (`"Missing authorization for this collection"`); `schema_name` isn't 1 to 12 characters; a schema with this name already exists for the collection; any line's `type` isn't a recognized scalar or vector type, or a name is empty, over 64 characters, or duplicated; or the format omits a line with `name: "name"` and `type: "string"` (`"A format line with {\"name\": \"name\" and \"type\": \"string\"} needs to be defined for every schema"`).

Source: `atomicassets-contract/src/atomicassets.cpp:450-475` (`createschema`); collection authorization at `src/atomicassets.cpp:1861-1875` (`check_has_collection_auth`); format validation at `include/checkformat.hpp:32-97`.

## Create a template: createtempl

Templates store data shared by many assets once, instead of once per asset, and set the `transferable`/`burnable`/`max_supply` policy assets minted against them inherit.

```json
{
  "authorized_creator": "mycreator11",
  "collection_name": "mycollectn1",
  "schema_name": "cards",
  "transferable": true,
  "burnable": true,
  "max_supply": 1000,
  "immutable_data": [
    { "key": "name", "value": ["string", "Fire Dragon"] },
    { "key": "power", "value": ["uint32", 85] }
  ]
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'createtempl',
    authorization: [session.permissionLevel],
    data: {
      authorized_creator: session.actor,
      collection_name: 'mycollectn1',
      schema_name: 'cards',
      transferable: true,
      burnable: true,
      max_supply: 1000,
      immutable_data: [
        { key: 'name', value: ['string', 'Fire Dragon'] },
        { key: 'power', value: ['uint32', 85] },
      ],
    },
  },
})
```

`createtempl2` takes the same fields plus a `mutable_data` map, seeding the template's editable data at creation instead of a separate `settempldata` call.

- Required authorization: `authorized_creator`, authorized for the collection.
- RAM payer: `authorized_creator`.
- Fails when: no schema with `schema_name` exists for the collection; both `transferable` and `burnable` are false (`"A template cannot be both non-transferable and non-burnable"`); or an `immutable_data`/`mutable_data` attribute named `name` exceeds 64 characters. `max_supply: 0` is valid and means unlimited.

Source: `atomicassets-contract/src/atomicassets.cpp:566-576` (`createtempl`), `src/atomicassets.cpp:1579-1655` (`internal_create_template`, shared by `createtempl`/`createtempl2`).

## Mint an asset: mintasset

```json
{
  "authorized_minter": "mycreator11",
  "collection_name": "mycollectn1",
  "schema_name": "cards",
  "template_id": 123456,
  "new_asset_owner": "collector.wam",
  "immutable_data": [],
  "mutable_data": [{ "key": "level", "value": ["uint32", 1] }],
  "tokens_to_back": []
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'mintasset',
    authorization: [session.permissionLevel],
    data: {
      authorized_minter: session.actor,
      collection_name: 'mycollectn1',
      schema_name: 'cards',
      template_id: 123456,
      new_asset_owner: 'collector.wam',
      immutable_data: [],
      mutable_data: [{ key: 'level', value: ['uint32', 1] }],
      tokens_to_back: [],
    },
  },
})
```

Pass `template_id: -1` to mint a templateless asset carrying its own `immutable_data` directly instead of inheriting from a template.

- Required authorization: `authorized_minter`, authorized for the collection.
- RAM payer: `authorized_minter`, not `new_asset_owner`. The new row lives in the owner's scope, but the minter pays for it, so a minter without enough RAM staked blocks its own mint regardless of the recipient's resources.
- Fails when: `template_id` is neither `-1` nor an existing template id; the template belongs to a different schema than `schema_name`; the template's `max_supply` is already reached (`"The template's maxsupply has already been reached"`); `new_asset_owner` isn't a registered account; or `tokens_to_back` is non-empty (`"Native backing has been deprecated on the AtomicAssets Contract"`).

**Changed in V2:** native token backing (the `tokens_to_back` parameter and the `backasset` action) is deprecated: any non-empty `tokens_to_back` aborts the mint, and `backasset` unconditionally fails. Under V1 both were functional and moved real token balances onto the asset.

Source: `atomicassets-contract/src/atomicassets.cpp:697-788` (`mintasset`; backing guard at `:786-787`); V1 backing behavior in this repo's V1 tree (`contracts/atomicassets-contract/src/atomicassets.cpp`).

## Update mutable data: setassetdata

```json
{
  "authorized_editor": "mycreator11",
  "asset_owner": "collector.wam",
  "asset_id": 1099511627887,
  "new_mutable_data": [{ "key": "level", "value": ["uint32", 2] }]
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'setassetdata',
    authorization: [session.permissionLevel],
    data: {
      authorized_editor: session.actor,
      asset_owner: 'collector.wam',
      asset_id: '1099511627887',
      new_mutable_data: [{ key: 'level', value: ['uint32', 2] }],
    },
  },
})
```

Asset ids sit around 2^40, so `@wharfkit/antelope` returns them as JSON strings, not numbers; pass `asset_id` as a string in the action data too. See `reference/wharfkit.md` for the same string/number split on chain table reads.

- Required authorization: `authorized_editor`, authorized for the collection that owns the asset's schema, not the asset's owner.
- RAM payer: reassigned to `authorized_editor` on every call (`_asset.ram_payer = authorized_editor`), replacing whoever paid before, including the original minter.
- Fails when: no asset with `asset_id` exists for `asset_owner`; the caller isn't authorized for the asset's collection; or a `new_mutable_data` attribute named `name` exceeds 64 characters.

Source: `atomicassets-contract/src/atomicassets.cpp:796-836`.

## Transfer an asset: transfer

```json
{
  "from": "collector.wam",
  "to": "otheruser.wam",
  "asset_ids": [1099511627887],
  "memo": "gift"
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'transfer',
    authorization: [session.permissionLevel],
    data: {
      from: session.actor,
      to: 'otheruser.wam',
      asset_ids: ['1099511627887'],
      memo: 'gift',
    },
  },
})
```

- Required authorization: `from`.
- RAM payer: unchanged for an existing scope; the row keeps whoever originally paid for it. If `to` has never held any AtomicAssets asset before, a new scope must be created, and `from` implicitly pays for it (the transfer aborts if `from` hasn't authorized the action, which it always has, since `from` is the one calling `transfer`).
- Fails when: `to` isn't a registered account; `from` equals `to`; `asset_ids` is empty or contains a repeated id; the memo exceeds 256 characters; `from` doesn't own one of the listed assets (`"Sender doesn't own at least one of the provided assets"`); or at least one asset's template has `transferable: false` (`"At least one asset isn't transferable"`). The contract appends the offending id to both of these messages as a ` (ID: <asset_id>)` suffix, so a match on either string should allow for the trailing id.

Source: `atomicassets-contract/src/atomicassets.cpp:76-86` (`transfer` action), `src/atomicassets.cpp:1665-1761` (`internal_transfer`, shared with `acceptoffer`).

## Burn an asset: burnasset

```json
{
  "asset_owner": "collector.wam",
  "asset_id": 1099511627887
}
```

```ts
await session.transact({
  action: {
    account: 'atomicassets',
    name: 'burnasset',
    authorization: [session.permissionLevel],
    data: {
      asset_owner: session.actor,
      asset_id: '1099511627887',
    },
  },
})
```

- Required authorization: `asset_owner`.
- RAM payer: none afterward; the row and its RAM are released back to whoever paid for it. If the asset carries any `backed_tokens`, `burnasset` credits them to the owner's `balances` row before erasing the asset. That crediting code is retained in V2, so a legacy V1-backed asset still pays out its backing on burn; V2 only makes new backing impossible (`backasset` aborts and `mintasset` rejects a non-empty `tokens_to_back`), so no freshly-minted asset can accumulate a balance to release.
- Fails when: no asset with `asset_id` exists for `asset_owner`, or the asset's template has `burnable: false` (`"The asset is not burnable"`). Templateless assets (`template_id: -1`) are always burnable.

Source: `atomicassets-contract/src/atomicassets.cpp:1096-1177` (`burnasset`; backed-token crediting at `:1112-1145`).

## See also

- `guides/offers.md`: the trade-offer flow used to move assets between accounts that haven't pre-arranged a direct `transfer`, and the primitive AtomicMarket sales are built on.
- `reference/atomicassets/v2-upgrade.md`: V2 upgrade compatibility and indexer implications.
- `reference/wharfkit.md`: client-library pitfalls when reading the tables these actions write to.
