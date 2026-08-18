---
scope: "@atomichub/atomicassets JavaScript/TypeScript SDK: ExplorerApi and RpcApi reads, attribute serialization, v2 action building, and the network factories"
depends-on: [reference/api.md, reference/wharfkit.md, reference/atomicassets/serialization.md]
key-modules:
    - "@atomichub/atomicassets 2.1.0 (atomicassets-sdk v2.1.0, 0dbf061): src/index.ts, src/API/Explorer/index.ts, src/API/Rpc/index.ts, src/Actions/Generator.ts, src/Serialization/index.ts, src/Schema/index.ts, src/Networks.ts"
---

# @atomichub/atomicassets SDK

The official JavaScript/TypeScript client for the AtomicAssets standard on Antelope chains. It reads asset data over the hosted API and directly from chain tables, serializes and deserializes attribute data, and builds v2 contract actions for a signer to sign. Version-sensitive facts below were read from the 2.1.0 source tree; re-verify against current source after an upgrade.

```
npm install @atomichub/atomicassets
```

## The package has zero runtime dependencies and ships ESM and CJS

`@atomichub/atomicassets` declares no runtime `dependencies`; everything it needs (fetch, serialization, the queue) is either built in or supplied by the host runtime's global `fetch`. It publishes dual builds (`build/index.mjs` for `import`, `build/index.cjs` for `require`) with types for both, and requires Node `>=20`. The package declares `sideEffects: false`, so a bundler may drop what an application does not import: importing only `ActionBuilder` no longer pulls in the base58 coder, the parser table, or the action-name map. Every public type and value is re-exported from the package root, so consumers import from `@atomichub/atomicassets` and never reach into `build/` subpaths.

Source: atomicassets-sdk (v2.1.0, 0dbf061) package.json:25 (`sideEffects: false`), package.json:27-28 (`engines.node >=20`), package.json (no `dependencies` key; `main`/`module`/`exports` dual build), src/index.ts:10-61 (flat root re-exports)

## ExplorerApi reads the hosted atomicassets-api

`ExplorerApi` wraps the hosted HTTP API (the same endpoints documented in [atomicassets-api HTTP API](../api.md)). The constructor takes `(endpoint, namespace, { fetch? })`: `endpoint` is the deployment host (`https://wax.api.atomicassets.io`), `namespace` is the API namespace (`atomicassets`), and the optional `fetch` overrides the runtime global (bound to `globalThis` by default, because a browser `fetch` called bare throws "Illegal invocation").

Construction starts no network request. `explorerApi.action` is a read-only getter returning a promise of an `ExplorerActionGenerator` bound to the contract account in `/v1/config`; that config is fetched on first access, shared between concurrent accessors, and refetched on the next access after a failure. Because it is a getter it does not appear in `Object.keys` or a spread of the instance, and assigning to it throws.

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/API/Explorer/index.ts:59-64 (no constructor I/O, cached and cleared on failure), src/API/Explorer/index.ts:71-82 (constructor, bound fetch), src/API/Explorer/index.ts:84-103 (`action` getter)

### The getter surface

Every getter maps onto one API route and returns the response `data` payload already unwrapped. List getters default to `page = 1` and `limit = 100`.

| Method | Route | Returns |
| --- | --- | --- |
| `getConfig()` | `/v1/config` | `IConfig` |
| `getAssets(options, page, limit, data)` | `/v1/assets` | `IAsset[]` |
| `countAssets(options, data)` | `/v1/assets/_count` | `number` |
| `getAsset(id)` | `/v1/assets/{id}` | `IAsset` |
| `getAssetStats(id)` | `/v1/assets/{id}/stats` | `IAssetStats` |
| `getAssetLogs(id, page, limit, order)` | `/v1/assets/{id}/logs` | `ILog[]` |
| `getCollections(options, page, limit)` | `/v1/collections` | `ICollection[]` |
| `countCollections(options)` | `/v1/collections/_count` | `number` |
| `getCollection(name)` | `/v1/collections/{name}` | `ICollection` |
| `getCollectionStats(name)` | `/v1/collections/{name}/stats` | `ICollectionStats` |
| `getCollectionLogs(name, page, limit, order)` | `/v1/collections/{name}/logs` | `ILog[]` |
| `getSchemas(options, page, limit)` | `/v1/schemas` | `IApiSchema[]` |
| `countSchemas(options)` | `/v1/schemas/_count` | `number` |
| `getSchema(collection, name)` | `/v1/schemas/{collection}/{name}` | `IApiSchema` |
| `getSchemaStats(collection, name)` | `/v1/schemas/{collection}/{name}/stats` | `ISchemaStats` |
| `getSchemaLogs(collection, name, page, limit, order)` | `/v1/schemas/{collection}/{name}/logs` | `ILog[]` |
| `getTemplates(options, page, limit, data)` | `/v1/templates` | `ITemplate[]` |
| `countTemplates(options, data)` | `/v1/templates/_count` | `number` |
| `getTemplate(collection, id)` | `/v1/templates/{collection}/{id}` | `ITemplate` |
| `getTemplateStats(collection, name)` | `/v1/templates/{collection}/{name}/stats` | `ITemplateStats` |
| `getTemplateLogs(collection, id, page, limit, order)` | `/v1/templates/{collection}/{id}/logs` | `ILog[]` |
| `getTransfers(options, page, limit)` | `/v1/transfers` | `ITransfer[]` |
| `countTransfers(options)` | `/v1/transfers/_count` | `number` |
| `getOffers(options, page, limit)` | `/v1/offers` | `IOffer[]` |
| `countOffers(options)` | `/v1/offers/_count` | `number` |
| `getOffer(id)` | `/v1/offers/{id}` | `IOffer` |
| `getAccounts(options, page, limit)` | `/v1/accounts` | `Array<{ account, assets }>` |
| `countAccounts(options)` | `/v1/accounts/_count` | `number` |
| `getAccount(account, options)` | `/v1/accounts/{account}` | `IAccountStats` |
| `getAccountCollection(account, collection)` | `/v1/accounts/{account}/{collection}` | `IAccountCollectionStats` |
| `getBurns(options, page, limit)` | `/v1/burns` | `Array<{ account, assets }>` |
| `getAccountBurns(account, options)` | `/v1/burns/{account}` | `IAccountStats` |
| `fetchEndpoint(path, args)` | any path | the raw `data` payload |
| `countEndpoint(path, args)` | any `_count` path | `number` |

Options are typed per entity (`AssetsApiParams`, `TemplateApiParams`, `CollectionApiParams`, and so on), each carrying the filter, greylist, boundary, `sort`, and `order` fields that route accepts; `sort` and `order` values are the `AssetsSort`/`OrderParam` string enums exported from the root.

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/API/Explorer/index.ts:105-231 (getters and their routes), src/API/Explorer/index.ts:288-292 (`countEndpoint` appends `/_count`), src/API/Explorer/Params.ts, src/API/Explorer/Enums.ts

### Path segments and query keys are percent-encoded

Every caller-supplied path segment goes through `encodeURIComponent` where the path is assembled, so an asset id, collection, schema, template or account name carrying `/`, `?` or `#` cannot escape its own segment and rewrite the request target. The query side encodes both the key and the value, because the key is caller-supplied too: `buildDataOptions` splices a data-filter key and type into it, and an unencoded `&` or `=` there would smuggle extra parameters into the query. A hand-rolled URL that skips either step is the flaw this closes; see [Query the API and chain tables](../../guides/querying-the-api.md#percent-encode-every-caller-supplied-url-part) ("Percent-encode every caller-supplied URL part").

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/API/Explorer/index.ts:32-38 (`encodeSegment`), src/API/Explorer/index.ts:118-231 (every path segment encoded), src/API/Explorer/index.ts:248-251 (query key and value encoded)

### Typed data filters and the long-query POST switch

The final `data` argument on `getAssets`/`getTemplates` targets the on-chain data filters: each entry `{ key, value, type? }` becomes a query field keyed `data.<key>`, `data:number.<key>`, or `data:bool.<key>` by the value's JS type (`type` defaults to `data`, and can be set to `template_data`/`immutable_data`/`mutable_data`). Percent-encoding then puts the colon on the wire as `%3A`, so `data:number.id=4` is sent as `data%3Anumber.id=4`. Requests whose query string reaches 1000 characters are sent as a POST with a JSON body instead of a GET, transparently to the caller.

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/API/Explorer/index.ts:40-56 (`buildDataOptions`), src/API/Explorer/index.ts:251 (`encodeURIComponent` on the key), src/API/Explorer/index.ts:254-270 (the 1000-character GET/POST switch)

### Reads against WAX mainnet

Live reads against `https://wax.api.atomicassets.io`:

```js
import { ExplorerApi, explorerApiForNetwork } from '@atomichub/atomicassets';

const api = explorerApiForNetwork('wax'); // or: new ExplorerApi('https://wax.api.atomicassets.io', 'atomicassets', {})

await api.getAsset('1099519850420');
// -> { asset_id: '1099519850420', name: 'Proof of Concept 4/4', owner: '14yr4.wam',
//      collection: { collection_name: 'cryptoswatch', ... }, schema: { schema_name: 'swatches', ... }, ... }

await api.getAssets({ collection_name: 'pixeltycoons', sort: 'asset_id', order: 'desc' }, 1, 2);
// -> IAsset[] of length 2

await api.getTemplates({ collection_name: 'pixeltycoons' }, 1, 2);
// -> ITemplate[] of length 2
```

Every getter throws `ApiError` on a non-200 response or a `success: false` body, so a rejected promise is the failure signal; there is no undefined-on-error path. List endpoints reject `limit` above the deployment cap (100 on the reference deployment) with HTTP 400, surfaced as an `ApiError`; bound `limit` to 100 and page through. See [atomicassets-api HTTP API](../api.md#list-endpoints-cap-limit-at-100) ("List endpoints cap limit at 100").

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/API/Explorer/index.ts:277-283 (`fetchEndpoint` error handling); live reads against `https://wax.api.atomicassets.io`

## RpcApi reads chain tables directly, with a rate-limited queue and a cache

`RpcApi` reads the AtomicAssets contract tables straight from a node's `/v1/chain/get_table_rows` rather than through the indexer. The constructor takes `(endpoint, contract, { fetch?, rateLimit? })`; `contract` defaults to `atomicassets` through the `rpcApiForNetwork` factory, and `rateLimit` defaults to 4. Requests pass through an internal queue that releases at `rateLimit` calls per second (a 250 ms interval at the default), so a burst of `getAsset` calls is spread out rather than fired at once. Resolved rows are held in an in-memory cache for 15 minutes; passing `cache = false` to a getter evicts that entry first and forces a fresh read.

The getters return lazy wrapper objects, not plain rows. `getAsset(owner, id)` resolves an `RpcAsset` whose `immutableData()`/`mutableData()`/`data()` methods deserialize the row's `serialized_data` against the schema format fetched on demand, and whose `template()`/`collection()`/`schema()` resolve the related wrappers; `data()` applies AtomicAssets precedence (template data overrides asset data, immutable over mutable). `getTemplate`, `getCollection`, `getSchema`, `getOffer`, and the account-scoped `getAccountAssets`/`getAccountOffers`/`getCollectionInventory` follow the same wrapper pattern. `getTableRows` is the raw escape hatch; it forces `limit: 101` and `json: true`.

Prefer `ExplorerApi` for anything the indexer answers: filtered lists, search, sort orders, counts, stats, and cross-owner enumeration (the `assets` table is scoped by owner on chain, so there is no chain-side path from a collection to its assets without knowing the owners). Reach for `RpcApi` when you need the unindexed chain truth: reading a specific row without indexer lag, or running against a node when no atomicassets-api deployment is available. The two clients do not share a cache.

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/API/Rpc/index.ts:32-44 (constructor, queue construction), src/API/Rpc/index.ts:80-166 (getters), src/API/Rpc/index.ts:172-181 (`getTableRows` forcing `limit: 101`, `json: true`), src/API/Rpc/Queue.ts:15 and :130-137 (`setInterval(..., ceil(1000/requestLimit))`, default 4), src/API/Rpc/RpcCache.ts:124 (15-minute TTL), src/API/Rpc/Asset.ts (lazy wrapper, precedence in `data()`)

## Serialization decodes table blobs; the attribute-map helpers build action data

Two distinct jobs use two distinct helpers, and mixing them is a common error. `ObjectSchema(format)` builds a codec from a schema format (an array of `{ name, type }`), and `serialize(object, codec)` / `deserialize(bytes, codec)` convert between a plain object and the binary `serialized_data` that chain rows and SHIP deltas carry. `toByteArray(input)` normalizes the three shapes serialized data arrives in (a hex string, optionally `\x`-prefixed from Postgres bytea; a plain number array; or a `Uint8Array`) before decoding. `CachedObjectSchema` memoizes the codec by the JSON of its format, bounded to 500 entries, for hot paths that rebuild the same schema per row. This is the read path: it is what `RpcAsset.immutableData()` uses under the hood, and what a filler uses to decode deltas. For the binary format itself see [AtomicAssets attribute serialization](../atomicassets/serialization.md).

Building action data is the other direction and does not produce bytes. `createAttributeMap(values, types)` and `toAttributeMap(values, schemaFormat)` turn a plain object into the `ATTRIBUTE_MAP` shape the contract's action arguments expect: an array of `{ key, value: [variantName, value] }` pairs, where the variant name is the ABI's `ATOMIC_ATTRIBUTE` name for the field's type. `createAttributeMap` takes an explicit per-key type map; `toAttributeMap` derives the types from a schema format. The chain, not the SDK, serializes this map to bytes during transaction execution, so action `immutable_data`/`mutable_data`/`data` fields are attribute-map arrays, never `serialize()` output.

Decoding accepts both spellings of the attribute pair. The on-chain `pair_string_ATOMIC_ATTRIBUTE` struct is `key`/`value` in the v1 mainnet ABI and in the v2 release ABI alike, but CDT 4.1 and newer emit the C++ member names `first`/`second` from abigen, and the contract's release build patches them back before the ABI ships. An ABI taken from an unpatched build hands back the other spelling, so `DecodedAttributeMap` admits both and a caller need not normalize first.

Round-trip run against a live schema format read from `https://wax.api.atomicassets.io`, and a standalone format:

```js
import { ObjectSchema, serialize, deserialize } from '@atomichub/atomicassets';

const format = [{ name: 'name', type: 'string' }, { name: 'level', type: 'uint32' }, { name: 'img', type: 'ipfs' }];
const codec = ObjectSchema(format);
const obj = { name: 'Hero', level: 42, img: 'QmABC' };
deserialize(serialize(obj, codec), codec);
// -> { name: 'Hero', level: 42, img: 'QmABC' }  (round-trips equal)
```

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/Serialization/index.ts (`serialize`/`deserialize`/`toByteArray`), src/Schema/index.ts:56-100 (`ObjectSchema`, `CachedObjectSchema`, the 500-entry bound), src/Actions/Generator.ts:54-91 (`ATOMIC_ATTRIBUTE`), src/Actions/Generator.ts:96-118 (`createAttributeMap`), src/Actions/Generator.ts:26-36 (`DecodedAttributeMap` accepting `first`/`second`); round-trip executed against a live schema read from `https://wax.api.atomicassets.io`

## Action building: a sync authorization-free builder and an async authorization-first generator

The SDK builds every AtomicAssets action as a plain object; it never signs or pushes. There are three layers. `ActionBuilder(contract)` is synchronous and authorization-free: one method per action, each returning a single `{ account, name, data }` object (`EosioSimpleAction`), for pipelines that attach authorization themselves. `ActionGenerator(contract)` wraps the same builders as `async` methods taking an `authorization` array first and returning `[{ account, name, authorization, data }]`. `ExplorerActionGenerator` (reached via `explorerApi.action`) additionally accepts plain-object data for the data-bearing actions (`createcol`, `createtempl`, `mintasset`, `setassetdata`, `setcoldata`) and serializes it to the attribute-map shape by fetching the relevant schema or collection format, so callers pass `{ name: 'Hero' }` instead of hand-building pairs.

The two packages differ here, and a caller composing both trips on it: an `ActionBuilder` method returns one action object, while every `MarketActionBuilder` method in [@atomichub/atomicmarket SDK](atomicmarket.md) returns an array of them. Spread the market builder's result and push the assets builder's.

`mintasset` on the builder takes eight positional arguments in ABI order: `authorized_minter, collection_name, schema_name, template_id, new_asset_owner, immutable_data, mutable_data, tokens_to_back` (the `ActionGenerator` form adds `authorization` as the first argument, making nine). Two data-map arguments and a backed-token array are separate, and their order matters. `transfer(from, to, asset_ids, memo)` names its first two parameters after the ABI fields they fill, so nothing is remapped on the way through.

```js
import { ActionBuilder, createAttributeMap } from '@atomichub/atomicassets';

const builder = new ActionBuilder('atomicassets');
const immutable = createAttributeMap({ name: 'Hero' }, { name: 'string' });
builder.mintasset('minteracct', 'pixeltycoons', 'heroes', 4, 'targetacct', immutable, [], []);
// -> { account: 'atomicassets', name: 'mintasset',
//      data: { authorized_minter: 'minteracct', collection_name: 'pixeltycoons', schema_name: 'heroes',
//              template_id: 4, new_asset_owner: 'targetacct',
//              immutable_data: [{ key: 'name', value: ['string', 'Hero'] }], mutable_data: [], tokens_to_back: [] } }
```

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/Actions/Generator.ts:14-18 (`EosioSimpleAction`), src/Actions/Generator.ts:524-526 (`_action` returning one object), src/Actions/Generator.ts:373-384 (8-argument `mintasset`), src/Actions/Generator.ts:516-518 (`transfer(from, to, asset_ids, memo)`), src/Actions/Generator.ts:529-536 and :855-857 (`ActionGenerator`, `_authorize` returning an array), src/Actions/Explorer.ts (`ExplorerActionGenerator` auto-serialization); `mintasset` output executed locally

### Numeric parameters are checked against their ABI type and throw

The builders check almost nothing, deliberately: names, symbols, and 64-bit ids are forwarded unchecked because the chain rejects a malformed one with an error that names it. The numeric parameters are the exception, because a bad value there neither throws nor survives the trip. Action data reaches a signing library as JSON, where `NaN` and `Infinity` have no form, so `max_supply: NaN` is written as `"max_supply": null` and the mistake is erased before anything on chain can name it. A fractional or negative value for an integer field is the quieter version: it serializes intact and surfaces, if at all, in a chain error naming neither the call nor the field.

Each numeric parameter is therefore checked against the ABI type of the field it fills and throws a `SerializationError` naming that field:

| Parameter | Checked as | Where |
| --- | --- | --- |
| `template_id` | int32, so `-1` stays available as the no-template sentinel | `mintasset`, `deltemplate`, `locktemplate`, `settempldata`, `redtemplmax` |
| `max_supply` | uint32, refusing a fractional or negative supply | `createtempl`, `createtempl2` |
| `new_max_supply` | uint32 | `redtemplmax` |
| `market_fee` | float64, so only finiteness is checkable | `createcol`, `setmarketfee` |

The error text carries the field and the offending value, for example `max_supply 1.5 is not a uint32 (an integer 0 to 4294967295)`. What the contract requires beyond the ABI width, such as which market fee a collection may charge, stays the chain's to enforce and returns a legible error of its own.

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/Actions/Generator.ts:126-157 (`INT32_MIN`/`INT32_MAX`/`UINT32_MAX`, `assertFinite`, `assertInt32`, `assertUint32`), src/Actions/Generator.ts:276 and :451 (`market_fee`), src/Actions/Generator.ts:299 and :311 (`max_supply`), src/Actions/Generator.ts:330, :355, :394-395, :477 (`template_id`, `new_max_supply`), src/Actions/Generator.ts:379 (`mintasset` `template_id`)

### Native backing is deprecated on the action and on the mint parameter

`backasset` carries a `@deprecated` tag on both the builder and the generator, and `mintasset` carries the same tag on its `tokens_to_back` parameter. AtomicAssets v2 ends `mintasset` with a check that `tokens_to_back` is empty and guards `backasset` the same way, so both abort there. Both still execute on a chain that has not migrated, which means a call that works says the chain has not arrived yet rather than that the path is supported. Pass `[]` and back nothing. The contract-side rule and its abort message are in [Create a collection and mint assets](../../guides/asset-lifecycle.md#mint-an-asset-mintasset) ("Mint an asset: mintasset").

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/Actions/Generator.ts:238-240 (`backasset` on the builder), src/Actions/Generator.ts:581-585 (`backasset` on the generator), src/Actions/Generator.ts:358-372 (`mintasset` `tokens_to_back`)

## Network factories carry AtomicHub's public hosts

`explorerApiForNetwork(network, options?)` and `rpcApiForNetwork(network, contract?, options?)` construct a preconfigured client against AtomicHub's public endpoints, and `NETWORK_ENDPOINTS` exposes the host map. The valid `AtomicHubNetwork` keys are `wax`, `wax-testnet`, `vaulta`, `xpr`, `xpr-testnet`, and `jungle4`. Each key currently maps its `api` and `rpc` to the same host (for example `wax` to `https://wax.api.atomicassets.io`), and the split is kept so the shapes survive if the hosts ever diverge. Any compatible deployment can still be passed straight to the `ExplorerApi`/`RpcApi` constructors instead of using a factory.

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/Networks.ts:9-48 (`AtomicHubNetwork`, `NETWORK_ENDPOINTS`, `explorerApiForNetwork`, `rpcApiForNetwork`); `wax` factory verified live

## Error types are exported for instanceof matching

Failures throw typed `Error` subclasses, all exported from the root so consumers can `instanceof`-match them. `ApiError` carries an `isApiError = true` flag and a numeric `status` (the HTTP status, or 500 for a transport failure); it is what every `ExplorerApi` getter throws. `RpcError` wraps a node error response and pulls the deepest available message out of the nodeos `error.details`/`processed.except` envelope. `SerializationError`, `DeserializationError`, and `SchemaError` cover the codec paths and the numeric guards above, and `ExplorerError` the explorer-action path. Match on `ApiError` and read `.status` to distinguish an over-limit 400 from a 404 from a transport 500.

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/Errors/ApiError.ts, src/Errors/RpcError.ts, src/Errors/{Serialization,Deserialization,Schema,Explorer}Error.ts, src/index.ts:32-37 (root re-exports)

## SDK action output composes directly with @wharfkit session.transact

The action objects the generator returns are already in the shape WharfKit's `session.transact({ actions })` accepts: `{ account, name, authorization, data }`, with each authorization entry an `{ actor, permission }` object matching the SDK's `EosioAuthorizationObject`. So a signer flow is `session.transact({ actions: await explorerApi.action.then(a => a.mintasset(auth, ...)) })`, where `auth = [{ actor, permission }]`. Because the data-bearing actions carry the attribute-map shape (not serialized bytes), the ABI encoding happens inside WharfKit and nodeos at transact time, the same as any hand-built action. The SDK's job ends at producing the action array. For WharfKit's table-read and authority behavior, and its eosjs-migration caveats, see [@wharfkit/antelope client behavior](../wharfkit.md).

Source: atomicassets-sdk (v2.1.0, 0dbf061) src/Actions/Generator.ts:4-18 (`EosioActionObject`, `EosioAuthorizationObject`), src/Actions/Generator.ts:855-857 (`_authorize`)

## When to use the SDK versus raw HTTP or WharfKit table reads

Three read paths cover different needs, consistent with `guides/querying-the-api.md`:

- **`ExplorerApi` (this SDK)** for typed indexer reads from JS/TS: filtered lists, search, sort, counts, stats, and cross-owner enumeration, with params and response objects already typed and errors raised as `ApiError`. This is the default for application and bot code.
- **Raw HTTP against the atomicassets-api** when you are not in a JS runtime, or want full control over paging and caching without the wrapper. The endpoints, the limit cap, and the lifecycle-state enums are in [atomicassets-api HTTP API](../api.md).
- **Chain table reads** (`RpcApi` here, or `@wharfkit/antelope`'s `get_table_rows`) when you need unindexed chain truth without indexer lag, or a node is your only backend. Note the numeric-key and `show_payer` pitfalls of the typed WharfKit client in [@wharfkit/antelope client behavior](../wharfkit.md); `RpcApi` reads through its own queue and cache instead.

List endpoints reached through `ExplorerApi` inherit the deployment's `limit` cap of 100; see [atomicassets-api HTTP API](../api.md#list-endpoints-cap-limit-at-100) ("List endpoints cap limit at 100").
