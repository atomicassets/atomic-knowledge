---
scope: "@atomichub/atomicmarket JavaScript/TypeScript SDK: AtomicMarketApi reads, the v2 royalty read layer, and royalty-config action building"
depends-on: [reference/api.md, reference/atomicmarket/fees-and-royalties.md, reference/sdk/atomicassets.md]
key-modules:
    - "@atomichub/atomicmarket 2.0.0 (atomicmarket-sdk main, 278bdfa): src/index.ts, src/API/Explorer/index.ts, src/API/Explorer/Objects.ts, src/Actions/Generator.ts, src/Networks.ts"
---

# @atomichub/atomicmarket SDK

The official JavaScript/TypeScript client for the AtomicMarket marketplace contract. It reads sales, auctions, buyoffers, and the v2 royalty configuration over the hosted API, and builds the v2 royalty-config actions for a signer. Version-sensitive facts below were read from the 2.0.0 source tree; re-verify against current source after an upgrade.

```
npm install @atomichub/atomicmarket
```

## The package depends on @atomichub/atomicassets at runtime

`@atomichub/atomicmarket` has exactly one runtime dependency, `@atomichub/atomicassets`, and re-exports the shared eosio action shapes (`EosioActionObject`, `EosioAuthorizationObject`), the network presets (`AtomicHubNetwork`, `NETWORK_ENDPOINTS`), and the AtomicAssets response types it composes with (a market asset is an AtomicAssets asset plus sale/auction/price fields). Installing the market SDK therefore pulls the assets SDK, and the two share one source of truth for those types. The package ships dual ESM/CJS builds and requires Node `>=20`, like the assets SDK.

Source: atomicmarket-sdk (main, 278bdfa) package.json (single `dependencies` entry `@atomichub/atomicassets`), src/index.ts and src/Actions/Generator.ts (re-exports of the assets eosio types), src/Networks.ts (re-exported presets)

## AtomicMarketApi reads sales, auctions, buyoffers, and marketplaces

`AtomicMarketApi` wraps the hosted `/atomicmarket` API. The constructor takes `(endpoint, namespace, { fetch? })`, with `namespace` the `atomicmarket` API namespace; the `marketApiForNetwork` factory supplies both. The listing getters mirror the AtomicAssets SDK shape: `getSales(options, page, limit, data)`, `getSale(id)`, `getAuctions`, `getAuction`, `getBuyoffers`, `getBuyoffer`, each with `getXLogs` and `countX` variants, plus `getMarketplaces`/`getMarketplace` and `getConfig`. List getters default to `page = 1`, `limit = 100`, and options are typed per listing (`SaleApiParams`, `AuctionApiParams`, `BuyofferApiParams`). The `state` field on each listing is a typed enum, and it differs by listing type; the SDK's `SaleState`/`AuctionState`/`BuyofferState` enums ship as runtime values, and the authoritative per-endpoint meanings are in `reference/api.md` ("The `state` field means something different on each listing endpoint"). Every getter throws `ApiError` (carrying `isApiError` and a numeric `status`) on a non-200 or `success: false` response.

Live reads against `https://wax.api.atomicassets.io` (WAX mainnet):

```js
import { AtomicMarketApi, marketApiForNetwork } from '@atomichub/atomicmarket';

const market = marketApiForNetwork('wax');

await market.getSales({ state: '3', sort: 'sale_id', order: 'desc' }, 1, 2);
// -> ISale[] of length 2

await market.getSale('173548902');
// -> { sale_id: '173548902', seller: 'alienz251212', state: 3,
//      price: { amount: '992994', token_symbol: 'WAX', ... }, collection: { collection_name: 'rustveil', ... }, ... }

await market.getConfig();
// -> { maker_market_fee: 0.01, taker_market_fee: 0.01, version: '1.3.3', ... }
```

Source: atomicmarket-sdk (main, 278bdfa) src/API/Explorer/index.ts (constructor, listing getters, `getConfig`), src/API/Explorer/Enums.ts (state enums), src/API/Explorer/Objects.ts (`ISale`, `IAuction`, `IBuyoffer`, `IMarketConfig`); live reads against `https://wax.api.atomicassets.io`

## The v2 royalty read layer returns config, template rules, and attribute rules

Three getters read the AtomicMarket v2 royalty configuration that backs the fee split documented in `reference/atomicmarket/fees-and-royalties.md`. `getRoyaltyConfig(collection)` returns the founders list plus the founders/templates/attributes split, `getRoyaltyTemplateRules(collection, page, limit)` the per-template recipient rules, and `getRoyaltyAttributeRules(collection, page, limit)` the attribute-match rules (each carrying its raw contract variant `value` tuple, for example `["string", "legendary"]`, preserved verbatim). `getRoyaltyConfig` catches the API's HTTP 416 (a collection with no royalty config) and returns `null` rather than throwing, so `null` is the normal "no config" signal and any other status still raises `ApiError`.

This read layer is a v2 API surface. WAX mainnet still runs the V1 contracts and its reference deployment does not serve `/atomicmarket/v1/royalties/*` at all (the route returns HTTP 404, which surfaces as an `ApiError` rather than `null`); the endpoints answer on the V2 deployments such as WAX testnet. Point `getRoyaltyConfig` at a deployment that carries V2, matching the mainnet-versus-testnet split in `guides/querying-the-api.md`.

Live reads against the WAX testnet deployment `https://test.wax.api.atomicassets.io`:

```js
const test = marketApiForNetwork('wax-testnet');

await test.getRoyaltyConfig('royaltycol11');
// -> { collection_name: 'royaltycol11',
//      founders: [{ weight: 1, recipient: 'jacktestr125' }, { weight: 3, recipient: 'pe2etestacct' }],
//      attribute_mode: 0, split_founders: '2', split_templates: '1', split_attributes: '1', ... }

await test.getRoyaltyConfig('farmmetricsx');
// -> null   (HTTP 416, no royalty config for this collection)

await test.getRoyaltyAttributeRules('royaltycol11');
// -> [{ rule_id: '2', source: 0, field: 'rarity', value: ['string', 'legendary'],
//      weight: '1', recipients: [{ weight: 1, recipient: 'jacktestr125' }], ... }]
```

Note the split fields and rule weights come back as decimal strings while recipient weights inside pairs are numbers, matching the deployed API's raw serialization.

Source: atomicmarket-sdk (main, 278bdfa) src/API/Explorer/index.ts (`getRoyaltyConfig` 416-to-null, `getRoyaltyTemplateRules`, `getRoyaltyAttributeRules`), src/API/Explorer/Objects.ts (`IRoyaltyConfig`, `IRoyaltyTemplateRule`, `IRoyaltyAttributeRule`); live reads against `https://test.wax.api.atomicassets.io`, and a mainnet 404 probe of `/atomicmarket/v1/royalties/`

## MarketActionBuilder builds the v2 royalty-config actions

The action layer covers the v2 royalty configuration only, not the trade actions (announce, purchase, bid, and the like live in the contract action reference). `MarketActionBuilder(contract)` is synchronous and authorization-free, returning `[{ account, name, data }]`; `MarketActionGenerator(contract)` wraps the same builders as `async` methods that take an `authorization` array first and return `[{ account, name, authorization, data }]`, the shape `@wharfkit` `session.transact({ actions })` accepts. The six actions are `setroyalconf` (founders plus the category split and attribute mode), `settemplroy` (per-template recipients), `setattrroy` (an attribute-match rule), and their deletes `delroyalconf`, `deltemplroy`, `delattrroy`. `AtomicMarketActions` exports every v2 contract action name as string constants for reference.

None of these actions carry an `authorized_*` field in `data`: the signer is implicit in the transaction authorization, and adding one is not in the ABI and fails on encode. The builder coerces `uint8`/`uint32`/`int32` fields (weights, splits, `template_id`) through `Number()` so numeric strings are accepted, while `uint64` fields (`rule_id` on `delattrroy`) are forwarded as strings because `Number()` corrupts values above 2^53.

```js
import { MarketActionBuilder } from '@atomichub/atomicmarket';

const builder = new MarketActionBuilder('atomicmarket');
builder.setroyalconf('mycollection', {
    founders: [{ recipient: 'founderacct', weight: 10000 }],
    attribute_mode: 0, split_founders: 5000, split_templates: 3000, split_attributes: 2000
});
// -> [{ account: 'atomicmarket', name: 'setroyalconf',
//       data: { collection_name: 'mycollection', founders: [{ recipient: 'founderacct', weight: 10000 }],
//               attribute_mode: 0, split_founders: 5000, split_templates: 3000, split_attributes: 2000 } }]

// Weights and splits are relative shares whose semantics (and how they resolve
// to payouts of the collection fee) are defined in
// reference/atomicmarket/fees-and-royalties.md; read that page before
// configuring a live collection, since a wrong split misdirects royalty payouts.
builder.settemplroy('mycollection', 12345, [{ recipient: 'artistacct', weight: 10000 }]);
// -> [{ account: 'atomicmarket', name: 'settemplroy',
//       data: { collection_name: 'mycollection', template_id: 12345, recipients: [{ recipient: 'artistacct', weight: 10000 }] } }]
```

Source: atomicmarket-sdk (main, 278bdfa) src/Actions/Generator.ts (`MarketActionBuilder`, `MarketActionGenerator`, `AtomicMarketActions`, the numeric-coercion rules); action outputs executed locally

## Network factory carries AtomicHub's public hosts

`marketApiForNetwork(network, options?)` constructs an `AtomicMarketApi` against AtomicHub's public endpoints for the same `AtomicHubNetwork` keys the assets SDK defines (`wax`, `wax-testnet`, `vaulta`, `xpr`, `xpr-testnet`, `jungle4`), reusing the re-exported `NETWORK_ENDPOINTS`. Any compatible deployment can be passed straight to the `AtomicMarketApi` constructor instead.

Source: atomicmarket-sdk (main, 278bdfa) src/Networks.ts (`marketApiForNetwork`, re-exported `AtomicHubNetwork`/`NETWORK_ENDPOINTS`); `wax` and `wax-testnet` factories verified live

## When to use the SDK versus raw HTTP or wharfkit table reads

The read-path choice mirrors the AtomicAssets SDK, consistent with `guides/querying-the-api.md`:

- **`AtomicMarketApi` (this SDK)** for typed indexer reads of sales, auctions, buyoffers, marketplaces, and the royalty read layer from JS/TS, with params and response objects typed and failures raised as `ApiError`.
- **Raw HTTP against the atomicmarket API** outside a JS runtime, or when you want direct control over paging; the endpoints, limit cap, and per-endpoint `state` enums are in `reference/api.md`.
- **Chain table reads** (`@wharfkit/antelope` `get_table_rows`) for unindexed marketplace state without indexer lag; mind the numeric-key and `show_payer` behaviors in `reference/wharfkit.md`, and that large ids can arrive as strings.

List endpoints reached through `AtomicMarketApi` inherit the deployment's `limit` cap of 100; see `reference/api.md` ("List endpoints cap limit at 100").
