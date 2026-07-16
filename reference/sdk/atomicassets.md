---
scope: "@atomichub/atomicassets JavaScript/TypeScript SDK: ExplorerApi and RpcApi reads, attribute serialization, and v2 action building"
depends-on: [reference/api.md, reference/wharfkit.md, reference/atomicassets/serialization.md]
key-modules:
    - "@atomichub/atomicassets 2.0.0 (atomicassets-sdk main, 80580c5): src/index.ts, src/API/Explorer/index.ts, src/API/Rpc/index.ts, src/Actions/Generator.ts, src/Serialization/index.ts, src/Schema/index.ts, src/Networks.ts"
---

# @atomichub/atomicassets SDK

The official JavaScript/TypeScript client for the AtomicAssets NFT standard on Antelope chains. It reads NFT data over the hosted API and directly from chain tables, serializes and deserializes attribute data, and builds v2 contract actions for a signer to sign. Version-sensitive facts below were read from the 2.0.0 source tree; re-verify against current source after an upgrade.

```
npm install @atomichub/atomicassets
```

## The package has zero runtime dependencies and ships ESM and CJS

`@atomichub/atomicassets` declares no runtime `dependencies`; everything it needs (fetch, serialization, the queue) is either built in or supplied by the host runtime's global `fetch`. It publishes dual builds (`build/index.mjs` for `import`, `build/index.cjs` for `require`) with types for both, and requires Node `>=20`. Every public type and value is re-exported from the package root, so consumers import from `@atomichub/atomicassets` and never reach into `build/` subpaths.

Source: atomicassets-sdk (main, 80580c5) package.json (no `dependencies` key; `main`/`module`/`exports` dual build; `engines.node >=20`), src/index.ts (flat root re-exports)

## ExplorerApi reads the hosted atomicassets-api

`ExplorerApi` wraps the hosted HTTP API (the same endpoints documented in `reference/api.md`). The constructor takes `(endpoint, namespace, { fetch? })`: `endpoint` is the deployment host (`https://wax.api.atomicassets.io`), `namespace` is the API namespace (`atomicassets`), and the optional `fetch` overrides the runtime global (bound to `globalThis` by default, because a browser `fetch` called bare throws "Illegal invocation"). Constructing an `ExplorerApi` eagerly fires one `/v1/config` request: the instance exposes an `action` promise that resolves to an `ExplorerActionGenerator` bound to the config's contract account.

The getters map one-to-one onto API routes and return the response `data` payload already unwrapped: `getAsset(id)`, `getAssets(options, page, limit, data)`, `getTemplates(options, page, limit, data)`, `getCollections`, `getSchemas`, `getOffers`, `getTransfers`, `getAccounts`, plus per-entity `getX`, `getXStats`, `getXLogs`, and `countX` variants. List getters default to `page = 1`, `limit = 100`. Options are typed per entity (`AssetsApiParams`, `TemplateApiParams`, `CollectionApiParams`, and so on), each carrying the filter, greylist, boundary, `sort`, and `order` fields that route accepts; `sort` and `order` values are the `AssetsSort`/`OrderParam` string enums exported from the root.

The final `data` argument on `getAssets`/`getTemplates` targets the on-chain data filters: each entry `{ key, value, type? }` becomes a query field keyed `data.<key>`, `data:number.<key>`, or `data:bool.<key>` by the value's JS type (`type` defaults to `data`, and can be set to `template_data`/`immutable_data`/`mutable_data`). Requests whose query string reaches 1000 characters are sent as a POST with a JSON body instead of a GET, transparently to the caller.

Live reads against `https://wax.api.atomicassets.io` (WAX mainnet):

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

Every getter throws `ApiError` on a non-200 response or a `success: false` body, so a rejected promise is the failure signal; there is no undefined-on-error path. List endpoints reject `limit` above the deployment cap (100 on the reference deployment) with HTTP 400, surfaced as an `ApiError`; bound `limit` to 100 and page through. See `reference/api.md` ("List endpoints cap limit at 100").

Source: atomicassets-sdk (main, 80580c5) src/API/Explorer/index.ts (constructor, getters, `buildDataOptions`, the 1000-char GET/POST switch, `fetchEndpoint` error handling), src/API/Explorer/Params.ts, src/API/Explorer/Enums.ts; live reads against `https://wax.api.atomicassets.io`

## RpcApi reads chain tables directly, with a rate-limited queue and a cache

`RpcApi` reads the AtomicAssets contract tables straight from a node's `/v1/chain/get_table_rows` rather than through the indexer. The constructor takes `(endpoint, contract, { fetch?, rateLimit? })`; `contract` defaults to `atomicassets` through the `rpcApiForNetwork` factory, and `rateLimit` defaults to 4. Requests pass through an internal queue that releases at `rateLimit` calls per second (a 250 ms interval at the default), so a burst of `getAsset` calls is spread out rather than fired at once. Resolved rows are held in an in-memory cache for 15 minutes; passing `cache = false` to a getter evicts that entry first and forces a fresh read.

The getters return lazy wrapper objects, not plain rows. `getAsset(owner, id)` resolves an `RpcAsset` whose `immutableData()`/`mutableData()`/`data()` methods deserialize the row's `serialized_data` against the schema format fetched on demand, and whose `template()`/`collection()`/`schema()` resolve the related wrappers; `data()` applies AtomicAssets precedence (template data overrides asset data, immutable over mutable). `getTemplate`, `getCollection`, `getSchema`, `getOffer`, and the account-scoped `getAccountAssets`/`getAccountOffers`/`getCollectionInventory` follow the same wrapper pattern. `getTableRows` is the raw escape hatch; it forces `limit: 101` and `json: true`.

Prefer `ExplorerApi` for anything the indexer answers: filtered lists, search, sort orders, counts, stats, and cross-owner enumeration (the `assets` table is scoped by owner on chain, so there is no chain-side path from a collection to its assets without knowing the owners). Reach for `RpcApi` when you need the unindexed chain truth: reading a specific row without indexer lag, or running against a node when no atomicassets-api deployment is available. The two clients do not share a cache.

Source: atomicassets-sdk (main, 80580c5) src/API/Rpc/index.ts (constructor, getters, `getTableRows`), src/API/Rpc/Queue.ts (`setInterval(..., ceil(1000/requestLimit))`, default 4), src/API/Rpc/RpcCache.ts (15-minute TTL), src/API/Rpc/Asset.ts (lazy wrapper, precedence in `data()`)

## Serialization decodes table blobs; the attribute-map helpers build action data

Two distinct jobs use two distinct helpers, and mixing them is a common error. `ObjectSchema(format)` builds a codec from a schema format (an array of `{ name, type }`), and `serialize(object, codec)` / `deserialize(bytes, codec)` convert between a plain object and the binary `serialized_data` that chain rows and SHIP deltas carry. `toByteArray(input)` normalizes the three shapes serialized data arrives in (a hex string, optionally `\x`-prefixed from Postgres bytea; a plain number array; or a `Uint8Array`) before decoding. `CachedObjectSchema` memoizes the codec by the JSON of its format, bounded to 500 entries, for hot paths that rebuild the same schema per row. This is the read path: it is what `RpcAsset.immutableData()` uses under the hood, and what a filler uses to decode deltas. For the binary format itself see `reference/atomicassets/serialization.md`.

Building action data is the other direction and does not produce bytes. `createAttributeMap(values, types)` and `toAttributeMap(values, schemaFormat)` turn a plain object into the `ATTRIBUTE_MAP` shape the contract's action arguments expect: an array of `{ key, value: [variantName, value] }` pairs, where the variant name is the ABI's `ATOMIC_ATTRIBUTE` name for the field's type. `createAttributeMap` takes an explicit per-key type map; `toAttributeMap` derives the types from a schema format. The chain, not the SDK, serializes this map to bytes during transaction execution, so action `immutable_data`/`mutable_data`/`data` fields are attribute-map arrays, never `serialize()` output.

Round-trip run against a live schema format read from `https://wax.api.atomicassets.io`, and a standalone format:

```js
import { ObjectSchema, serialize, deserialize } from '@atomichub/atomicassets';

const format = [{ name: 'name', type: 'string' }, { name: 'level', type: 'uint32' }, { name: 'img', type: 'ipfs' }];
const codec = ObjectSchema(format);
const obj = { name: 'Hero', level: 42, img: 'QmABC' };
deserialize(serialize(obj, codec), codec);
// -> { name: 'Hero', level: 42, img: 'QmABC' }  (round-trips equal)
```

Source: atomicassets-sdk (main, 80580c5) src/Serialization/index.ts (`serialize`/`deserialize`/`toByteArray`), src/Schema/index.ts (`ObjectSchema`, `CachedObjectSchema`), src/Actions/Generator.ts (`createAttributeMap`, `toAttributeMap`, `ATOMIC_ATTRIBUTE`); round-trip executed against a live schema read from `https://wax.api.atomicassets.io`

## Action building: a sync authorization-free builder and an async authorization-first generator

The SDK builds every AtomicAssets action as a plain object; it never signs or pushes. There are three layers. `ActionBuilder(contract)` is synchronous and authorization-free: one method per action, each returning a single `{ account, name, data }` object (`EosioSimpleAction`), for pipelines that attach authorization themselves. `ActionGenerator(contract)` wraps the same builders as `async` methods taking an `authorization` array first and returning `[{ account, name, authorization, data }]`. `ExplorerActionGenerator` (reached via `explorerApi.action`) additionally accepts plain-object data for the data-bearing actions (`createcol`, `createtempl`, `mintasset`, `setassetdata`, `setcoldata`) and serializes it to the attribute-map shape by fetching the relevant schema or collection format, so callers pass `{ name: 'Hero' }` instead of hand-building pairs.

`mintasset` on the builder takes eight positional arguments in ABI order: `authorized_minter, collection_name, schema_name, template_id, new_asset_owner, immutable_data, mutable_data, tokens_to_back` (the `ActionGenerator` form adds `authorization` as the first argument, making nine). Two data-map arguments and a backed-token array are separate, and their order matters. Note `transfer` remaps its `account_from`/`account_to` parameters to the contract's `from`/`to` data keys.

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

Source: atomicassets-sdk (main, 80580c5) src/Actions/Generator.ts (`ActionBuilder`, `ActionGenerator`, 8-arg `mintasset`, `transfer` from/to remap), src/Actions/Explorer.ts (`ExplorerActionGenerator` auto-serialization); `mintasset` output executed locally

## Network factories carry AtomicHub's public hosts

`explorerApiForNetwork(network, options?)` and `rpcApiForNetwork(network, contract?, options?)` construct a preconfigured client against AtomicHub's public endpoints, and `NETWORK_ENDPOINTS` exposes the host map. The valid `AtomicHubNetwork` keys are `wax`, `wax-testnet`, `vaulta`, `xpr`, `xpr-testnet`, and `jungle4`. Each key currently maps its `api` and `rpc` to the same host (for example `wax` to `https://wax.api.atomicassets.io`), and the split is kept so the shapes survive if the hosts ever diverge. Any compatible deployment can still be passed straight to the `ExplorerApi`/`RpcApi` constructors instead of using a factory.

Source: atomicassets-sdk (main, 80580c5) src/Networks.ts (`AtomicHubNetwork`, `NETWORK_ENDPOINTS`, `explorerApiForNetwork`, `rpcApiForNetwork`); `wax` factory verified live

## Error types are exported for instanceof matching

Failures throw typed `Error` subclasses, all exported from the root so consumers can `instanceof`-match them. `ApiError` carries an `isApiError = true` flag and a numeric `status` (the HTTP status, or 500 for a transport failure); it is what every `ExplorerApi` getter throws. `RpcError` wraps a node error response and pulls the deepest available message out of the nodeos `error.details`/`processed.except` envelope. `SerializationError`, `DeserializationError`, and `SchemaError` cover the codec paths, and `ExplorerError` the explorer-action path. Match on `ApiError` and read `.status` to distinguish an over-limit 400 from a 404 from a transport 500.

Source: atomicassets-sdk (main, 80580c5) src/Errors/ApiError.ts, src/Errors/RpcError.ts, src/Errors/{Serialization,Deserialization,Schema,Explorer}Error.ts, src/index.ts (root re-exports)

## SDK action output composes directly with @wharfkit session.transact

The action objects the generator returns are already in the shape WharfKit's `session.transact({ actions })` accepts: `{ account, name, authorization, data }`, with each authorization entry an `{ actor, permission }` object matching the SDK's `EosioAuthorizationObject`. So a signer flow is `session.transact({ actions: await explorerApi.action.then(a => a.mintasset(auth, ...)) })`, where `auth = [{ actor, permission }]`. Because the data-bearing actions carry the attribute-map shape (not serialized bytes), the ABI encoding happens inside WharfKit and nodeos at transact time, the same as any hand-built action. The SDK's job ends at producing the action array. For WharfKit's table-read and authority behavior, and its eosjs-migration caveats, see `reference/wharfkit.md`.

Source: atomicassets-sdk (main, 80580c5) src/Actions/Generator.ts (`EosioActionObject`, `EosioAuthorizationObject`, `_authorize`)

## When to use the SDK versus raw HTTP or wharfkit table reads

Three read paths cover different needs, consistent with `guides/querying-the-api.md`:

- **`ExplorerApi` (this SDK)** for typed indexer reads from JS/TS: filtered lists, search, sort, counts, stats, and cross-owner enumeration, with params and response objects already typed and errors raised as `ApiError`. This is the default for application and bot code.
- **Raw HTTP against the atomicassets-api** when you are not in a JS runtime, or want full control over paging and caching without the wrapper. The endpoints, the limit cap, and the lifecycle-state enums are in `reference/api.md`.
- **Chain table reads** (`RpcApi` here, or `@wharfkit/antelope`'s `get_table_rows`) when you need unindexed chain truth without indexer lag, or a node is your only backend. Note the numeric-key and `show_payer` pitfalls of the typed wharfkit client in `reference/wharfkit.md`; `RpcApi` reads through its own queue and cache instead.

List endpoints reached through `ExplorerApi` inherit the deployment's `limit` cap of 100; see `reference/api.md` ("List endpoints cap limit at 100").
