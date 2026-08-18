---
scope: "@atomichub/atomicmarket JavaScript/TypeScript SDK: AtomicMarketApi reads, the v2 royalty layer, every v2 action, the flow composers, and delphi settlement math"
depends-on: [reference/api.md, reference/atomicmarket/fees-and-royalties.md, reference/sdk/atomicassets.md]
key-modules:
    - "@atomichub/atomicmarket 2.3.0 (atomicmarket-sdk v2.3.0, 36aee58): src/index.ts, src/API/Explorer/index.ts, src/API/Explorer/Objects.ts, src/Actions/Generator.ts, src/Actions/Delphi.ts, src/Actions/Symbols.ts, src/Tables.ts, src/Networks.ts"
---

# @atomichub/atomicmarket SDK

The official JavaScript/TypeScript client for the AtomicMarket marketplace contract. It reads sales, auctions, buyoffers, marketplaces, and the v2 royalty configuration over the hosted API, builds every v2 contract action for a signer, composes the multi-action listing and purchase flows, and derives the settlement amount an oracle-priced purchase has to deposit. Version-sensitive facts below were read from the 2.3.0 source tree; re-verify against current source after an upgrade.

```
npm install @atomichub/atomicmarket
```

## The package depends on @atomichub/atomicassets at runtime

`@atomichub/atomicmarket` has exactly one runtime dependency, `@atomichub/atomicassets`, and re-exports the shared eosio action shapes (`EosioActionObject`, `EosioAuthorizationObject`), the network presets (`AtomicHubNetwork`, `NETWORK_ENDPOINTS`), and the AtomicAssets response types it composes with (a market asset is an AtomicAssets asset plus sale/auction/price fields). The dependency is load-bearing rather than incidental: the flow composers below build AtomicAssets `createoffer` and `transfer` actions through that package's own `ActionBuilder`. Installing the market SDK therefore pulls the assets SDK, and the two share one source of truth for those types. The package ships dual ESM/CJS builds, declares `sideEffects: false`, and requires Node `>=20`, like the assets SDK.

Source: atomicmarket-sdk (v2.3.0, 36aee58) package.json:25 (`sideEffects: false`), package.json:27-28 (`engines.node >=20`), package.json:58-59 (single `dependencies` entry), src/Actions/Generator.ts:1-8 (the assets `ActionBuilder` import and the eosio type re-exports), src/Networks.ts:1-10 (re-exported presets)

## AtomicMarketApi reads sales, auctions, buyoffers, and marketplaces

`AtomicMarketApi` wraps the hosted `/atomicmarket` API. The constructor takes `(endpoint, namespace, { fetch? })`, with `namespace` the `atomicmarket` API namespace; the `marketApiForNetwork` factory supplies both. Every getter returns the response `data` payload already unwrapped, and list getters default to `page = 1` and `limit = 100`.

| Method | Route | Returns |
| --- | --- | --- |
| `getSales(options, page, limit, data)` | `/v1/sales` | `ISale[]` |
| `countSales(options, data)` | `/v1/sales/_count` | `number` |
| `getSale(id)` | `/v1/sales/{id}` | `ISale` |
| `getSaleLogs(id, page, limit, order)` | `/v1/sales/{id}/logs` | `ILog[]` |
| `getSalesV2(options, page, limit, data)` | `/v2/sales` | `ISale[]` |
| `countSalesV2(options, data)` | `/v2/sales/_count` | `number` |
| `getAuctions(options, page, limit, data)` | `/v1/auctions` | `IAuction[]` |
| `countAuctions(options, data)` | `/v1/auctions/_count` | `number` |
| `getAuction(id)` | `/v1/auctions/{id}` | `IAuction` |
| `getAuctionLogs(id, page, limit, order)` | `/v1/auctions/{id}/logs` | `ILog[]` |
| `getBuyoffers(options, page, limit, data)` | `/v1/buyoffers` | `IBuyoffer[]` |
| `countBuyoffers(options, data)` | `/v1/buyoffers/_count` | `number` |
| `getBuyoffer(id)` | `/v1/buyoffers/{id}` | `IBuyoffer` |
| `getBuyofferLogs(id, page, limit, order)` | `/v1/buyoffers/{id}/logs` | `ILog[]` |
| `getMarketplaces()` | `/v1/marketplaces` | `IMarketplace[]` |
| `getMarketplace(name)` | `/v1/marketplaces/{name}` | `IMarketplace` |
| `getConfig()` | `/v1/config` | `IMarketConfig` |
| `getRoyaltyConfig(collection)` | `/v1/royalties/{collection}` | `IRoyaltyConfig` or `null` |
| `getRoyaltyTemplateRules(collection, page, limit)` | `/v1/royalties/{collection}/templates` | `IRoyaltyTemplateRule[]` |
| `getRoyaltyAttributeRules(collection, page, limit)` | `/v1/royalties/{collection}/attributes` | `IRoyaltyAttributeRule[]` |
| `getPriceHistory(options)` | `/v1/prices/sales` | per-sale price rows |
| `getPriceHistoryByDays(options)` | `/v1/prices/sales/days` | daily average and median rows |
| `getTemplatePriceStats(options)` | `/v1/prices/templates` | per-template price stats |
| `getAssetPrices(options, data)` | `/v1/prices/assets` | per-asset price stats |
| `getAssets(options, page, limit, data)` | `/v1/assets` | `IMarketAsset[]` |
| `getAsset(id)` | `/v1/assets/{id}` | `IMarketAsset` |
| `getTransfers(options, page, limit)` | `/v1/transfers` | `IMarketTransfer[]` |
| `getOffers(options, page, limit)` | `/v1/offers` | `IMarketOffer[]` |
| `countOffers(options)` | `/v1/offers/_count` | `number` |
| `getOffer(id)` | `/v1/offers/{id}` | `IMarketOffer` |
| `fetchEndpoint(path, args)` | any path | the raw `data` payload |
| `countEndpoint(path, args)` | any `_count` path | `number` |

Two facts about that surface are not inventory. The `state` field on each listing is a typed enum and it differs by listing type: state 1 is Listed for a sale, Declined for a buyoffer, and Canceled for a template buyoffer, so reusing one listing type's enum against another reads plausibly and returns the wrong rows. `SaleState`, `AuctionState`, `BuyofferState`, and `TemplateBuyofferState` ship as runtime values, and the authoritative per-endpoint meanings are in [atomicassets-api HTTP API](../api.md#the-state-field-means-something-different-on-each-listing-endpoint) ("The `state` field means something different on each listing endpoint"). And every getter throws `ApiError` (carrying `isApiError` and a numeric `status`) on a non-200 or `success: false` response, with the single exception of `getRoyaltyConfig` below; there is no undefined-on-error path.

Options are typed per listing (`SaleApiParams`, `AuctionApiParams`, `BuyofferApiParams`), each widening `state` to a string so a comma-joined multi-state filter is expressible. `MarketOfferApiParams` does the same for offers, which the AtomicAssets package pins to its `OfferState` enum; `getOffers` and `countOffers` share that widened surface.

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/API/Explorer/index.ts:36-185 (constructor, getters, routes), src/API/Explorer/index.ts:213-219 (`ApiError` on non-200 or `success: false`), src/API/Explorer/index.ts:224-228 (`countEndpoint` appends `/_count`), src/API/Explorer/Enums.ts:1-46 (the four state enums and the per-listing divergence), src/API/Explorer/Params.ts:54-59 (`MarketOfferApiParams` widening `state`), src/API/Explorer/Objects.ts (`ISale`, `IAuction`, `IBuyoffer`, `IMarketConfig`); live reads against `https://wax.api.atomicassets.io`

### The materialized /v2/sales route

`getSalesV2` and `countSalesV2` read `/atomicmarket/v2/sales`, the API's materialized sales index. Its row shape is identical to `/v1/sales`, which is why both getters return `ISale`, and it takes the same filters. The hosted WAX deployment serves both routes, and the OpenAPI document behind its Swagger UI describes only the `/v2` one. See [atomicassets-api HTTP API](../api.md#two-sales-list-routes-answer-on-the-hosted-deployment) ("Two sales list routes answer on the hosted deployment").

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/API/Explorer/index.ts:59-67 (`getSalesV2`, `countSalesV2`, and the note that the row shape matches `/v1/sales`); live reads of `https://wax.api.atomicassets.io/atomicmarket/v2/sales` (200) and `/atomicmarket/v2/sales/_count` (200)

### Path ids and query keys are percent-encoded

Every caller-supplied path id goes through `encodeURIComponent`, and so does each query key and value, the key mattering because `buildDataOptions` splices a data-filter key and type into it. A value carrying `/`, `?`, `#`, `&`, or `=` therefore cannot reshape the request. A hand-rolled URL that skips either step is the flaw this closes; see [Query the API and chain tables](../../guides/querying-the-api.md#percent-encode-every-caller-supplied-url-part) ("Percent-encode every caller-supplied URL part").

The `data` argument on the listing getters produces the same typed-filter keys the assets client does: each `{ key, value, type? }` entry becomes `data.<key>`, `data:number.<key>`, or `data:bool.<key>` by the value's JS type, and encoding puts the colon on the wire as `%3A`, so `data:number.level=1` is sent as `data%3Anumber.level=1`.

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/API/Explorer/index.ts:52-185 (every path id encoded), src/API/Explorer/index.ts:191-203 (query key and value encoded), src/API/Explorer/index.ts:12-28 (`buildDataOptions` and the typed-filter key shapes)

## The v2 royalty read layer returns config, template rules, and attribute rules

Three getters read the AtomicMarket v2 royalty configuration that backs the fee split documented in [AtomicMarket fees and royalties](../atomicmarket/fees-and-royalties.md). `getRoyaltyConfig(collection)` returns the founders list plus the founders/templates/attributes split, `getRoyaltyTemplateRules(collection, page, limit)` the per-template recipient rules, and `getRoyaltyAttributeRules(collection, page, limit)` the attribute-match rules (each carrying its raw contract variant `value` tuple, for example `["string", "legendary"]`, preserved verbatim).

`getRoyaltyConfig` is the one getter that does not throw on every failure. It catches HTTP 416 and returns `null`, because 416 is the API's answer for a collection with no royalty config, which is a normal result rather than an error. Any other status still raises `ApiError`.

That mapping is what makes the mainnet case quiet rather than loud. WAX mainnet still runs the V1 contracts, and its reference deployment answers `/atomicmarket/v1/royalties/{collection}` with HTTP 416 and `{"success": false, "message": "Royalty config not found"}` for every collection, so `getRoyaltyConfig` returns `null` there and never raises. Guard on `null`, not on `ApiError`: a caller who treats `null` as "this collection has no royalties" reads a mainnet-wide "the route has no data" as a per-collection fact. Point the getter at a deployment carrying V2, such as WAX testnet, matching the mainnet-versus-testnet split in [Query the API and chain tables](../../guides/querying-the-api.md).

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

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/API/Explorer/index.ts:115-135 (`getRoyaltyConfig` 416-to-null, `getRoyaltyTemplateRules`, `getRoyaltyAttributeRules`), src/API/Explorer/Objects.ts (`IRoyaltyConfig`, `IRoyaltyTemplateRule`, `IRoyaltyAttributeRule`); live reads against `https://test.wax.api.atomicassets.io`, and a live mainnet probe of `https://wax.api.atomicassets.io/atomicmarket/v1/royalties/pixeltycoons` returning HTTP 416

## Reading the market config, including the delphi pairs

`getConfig()` returns the contract's live parameters plus the token and symbol-pair registries. The pair entries are what the settlement math below needs, so read the config before deriving a settlement amount rather than hardcoding a precision.

Live read against the WAX testnet deployment, which runs AtomicMarket V2:

```js
import { marketApiForNetwork } from '@atomichub/atomicmarket';

const test = marketApiForNetwork('wax-testnet');

await test.getConfig();
// -> { atomicmarket_contract: 'atomicmarket', version: '2.0.0',
//      maker_market_fee: 0.01, taker_market_fee: 0.01,
//      minimum_auction_duration: 120, maximum_auction_duration: 2592000,
//      minimum_bid_increase: 0.1, auction_reset_duration: 120,
//      supported_tokens: [{ token_contract: 'eosio.token', token_symbol: 'WAX', token_precision: 8 }],
//      supported_pairs: [{ listing_symbol: 'USD', settlement_symbol: 'WAX', delphi_pair_name: 'waxpusd',
//                          invert_delphi_pair: false,
//                          data: { median: 35, median_precision: 4, base_precision: 8, quote_precision: 2, ... } }] }
```

The `version` string is the contract's own, so it reads `1.3.3` against a mainnet host and `2.0.0` against a V2 deployment. Table presence, not the version string, is the authoritative V2 check; see [AtomicAssets V2 upgrade](../atomicassets/v2-upgrade.md).

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/API/Explorer/index.ts:109-111 (`getConfig`), src/API/Explorer/Objects.ts (`IMarketConfig`, `IMarketPair`); live read of `https://test.wax.api.atomicassets.io/atomicmarket/v1/config`

## MarketActionBuilder builds every v2 action, plus five flow composers

`MarketActionBuilder(contract)` is synchronous and authorization-free; `MarketActionGenerator(contract)` wraps the same methods as `async` ones that take an `authorization` array first and return `[{ account, name, authorization, data }]`, the shape `@wharfkit` `session.transact({ actions })` accepts. Both classes carry 31 methods: 26 that build one contract action each, and five composers that return a whole flow.

| Family | Builder methods |
| --- | --- |
| Royalty configuration (v2 only) | `setroyalconf`, `settemplroy`, `setattrroy`, `delroyalconf`, `deltemplroy`, `delattrroy` |
| Sale lifecycle | `announcesale`, `assertsale`, `purchasesale`, `cancelsale` |
| Auction lifecycle | `announceauct`, `auctionbid`, `auctclaimbuy`, `auctclaimsel`, `assertauct`, `cancelauct` |
| Buyoffers | `createbuyo`, `declinebuyo`, `cancelbuyo` |
| Template buyoffers | `createtbuyo`, `canceltbuyo` |
| RAM payment | `paysaleram`, `payauctram`, `paybuyoram` |
| Marketplace and balance | `regmarket`, `withdraw` |
| Flow composers | `announceSaleActions`, `purchaseSaleActions`, `announceAuctionActions`, `acceptBuyofferActions`, `fulfillTemplateBuyofferActions` |

Two contract actions are deliberately absent from that list. `acceptbuyo` and `fulfilltbuyo` have no standalone builder method, because each reads the globally last row of the AtomicAssets offers table rather than an offer id it is handed, so an action built on its own is unsafe. They are reachable only through `acceptBuyofferActions` and `fulfillTemplateBuyofferActions`. `AtomicMarketActions` still exports every v2 contract action name as a string constant, including those two.

Every builder method returns an array of `{ account, name, data }` objects, even the ones that build a single action. The sibling assets package returns one object rather than an array; see [@atomichub/atomicassets SDK](atomicassets.md#action-building-a-sync-authorization-free-builder-and-an-async-authorization-first-generator) ("Action building"). Spread a market result and push an assets result.

None of these actions carry an `authorized_*` field in `data`: the signer is implicit in the transaction authorization, and adding one is not in the ABI and fails on encode. The builder coerces `uint8`/`uint32`/`int32` fields (weights, splits, `template_id`) through `Number()` so numeric strings are accepted, while `uint64` fields (`rule_id`, the listing ids, `intended_delphi_median`) are forwarded as strings because `Number()` corrupts values above 2^53. `asset` and `symbol` fields are chain-notation strings (`"1.00000000 WAX"`, `"8,WAX"`) and pass through verbatim.

Coercion is not validation, and the one numeric field that is checked is `duration` on `announceauct`. `Number()` reads a non-numeric string as `NaN`, which serializes as `null` and reaches a signing library as a field it cannot encode, so the value is refused at the call with an error naming it. The bound is the ABI's, a whole number from 0 to 4294967295; the config's minimum and maximum auction duration are chain state and go unchecked here.

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

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Actions/Generator.ts:208-734 (`MarketActionBuilder`, 26 action methods and five composers), src/Actions/Generator.ts:731-733 (`_pack` returning an array), src/Actions/Generator.ts:739-944 (`MarketActionGenerator`, `_authorize`), src/Actions/Generator.ts:12-64 (`AtomicMarketActions`), src/Actions/Generator.ts:190-207 (the numeric-coercion rules), src/Actions/Generator.ts:713-729 (`_uint32`), src/Actions/Generator.ts:312-323 (`announceauct` calling it for `duration`); action outputs executed locally

### The five composers

Each composer emits a whole flow in the order the contract requires, with the memo literals and the owning contract account filled in. `assets_contract` on the input names the AtomicAssets contract the assets live on, which is `atomicassets` on every current chain.

| Composer | Emits, in order | Refuses |
| --- | --- | --- |
| `announceSaleActions(input)` | `announcesale`, then the AtomicAssets `createoffer` with memo `sale` | nothing; every remaining condition is chain state |
| `purchaseSaleActions(input)` | `assertsale`, the settlement token's `transfer` with memo `deposit`, then `purchasesale` | a bundle `asset_ids`, and the settlement-quantity mismatches below |
| `announceAuctionActions(input)` | `announceauct`, then the AtomicAssets `transfer` with memo `auction` | nothing; the transfer must follow the announce, and that order is fixed here |
| `acceptBuyofferActions(input)` | the AtomicAssets `createoffer` with memo `buyoffer`, then `acceptbuyo` | a bundle `asset_ids` |
| `fulfillTemplateBuyofferActions(input)` | the AtomicAssets `createoffer` with memo `tbuyoffer`, then `fulfilltbuyo` | nothing; a template buyoffer names one asset by construction |

The two offer-consuming composers carry a placement rule the caller has to respect: the market action reads the globally last created row of the AtomicAssets offers table, so the offer must be created in the same transaction immediately before it, and no other `createoffer` may run in between. Actions appended after the market action are safe, the inline `acceptoffer` having consumed the row by then. Neither composer accepts the offer itself, because the market contract sends that `acceptoffer` inline and a pre-accepted offer is already gone from the table.

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Actions/Generator.ts:604-613 (`announceSaleActions`), src/Actions/Generator.ts:493-592 (`purchaseSaleActions`), src/Actions/Generator.ts:630-639 (`announceAuctionActions`), src/Actions/Generator.ts:658-688 (`acceptBuyofferActions`), src/Actions/Generator.ts:694-707 (`fulfillTemplateBuyofferActions`), src/Actions/Generator.ts:641-657 (the last-offer placement rule)

### The two bundle opt-out flags

`purchaseSaleActions` throws when `asset_ids` carries more than one id, unless `allow_v1_bundle_sale` is set. `acceptBuyofferActions` does the same behind `allow_v1_bundle_buyoffer`. Both guard the one caller error in their family that commits rather than reverting.

On a purchase, `purchasesale` under V2 returns early for a sale row holding more than one asset: it declines the offer, erases the row, and returns before touching any balance, while `assertsale` has already passed and the deposit has already credited the buyer. The transaction commits with the buyer paid, nothing delivered, and the tokens recoverable only through a separate `withdraw`. On an accept, `acceptbuyo` under V2 refunds the escrowed price and erases the buyoffer row before it ever reads the offers table, leaving the offer the composer created dangling in the AtomicAssets offers table on the recipient's RAM until they cancel it.

Set the flag only for a chain still running AtomicMarket V1, where bundle rows are ordinary listings that purchase and accept correctly. The lifecycle side of both rules is in [Working with sales](../../guides/sales.md#purchase-a-sale) ("Purchase a sale") and [Buyoffers](../../guides/buyoffers.md#accepting-a-buyoffer) ("Accepting a buyoffer").

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Actions/Generator.ts:115-120 (`allow_v1_bundle_sale`), src/Actions/Generator.ts:504-520 (the purchase throw and its reason), src/Actions/Generator.ts:169-174 (`allow_v1_bundle_buyoffer`), src/Actions/Generator.ts:659-675 (the accept throw and its reason)

### What purchaseSaleActions requires of settlement_quantity

The composer keys its checks on the contract's own settlement discriminator: whether `listing_price` and `settlement_symbol` name one symbol, precision and code both. A sale listing `30.00 WAX` against `8,WAX` names two symbols and settles through the oracle like any other cross-symbol sale.

- When the two name different symbols, `settlement_quantity` is required and must be denominated in `settlement_symbol`. Such a sale settles the oracle conversion of its listing price, not the price itself, and `assertsale` pins only the listing terms, so nothing on chain catches a deposit in the wrong symbol or of the wrong size.
- When the two name one symbol, `settlement_quantity` may be omitted, and a supplied one must equal `listing_price` exactly. `intended_delphi_median` must then be `'0'`.

Both refusals rule out a transaction the chain would take, deliberately: depositing more than the sale costs leaves the surplus as balance, and depositing nothing lets a standing balance pay. Each is legitimate for a caller who means it and indistinguishable from a wrong amount for one who does not, and the composer cannot see a balance to tell them apart. To do either on purpose, assemble the transaction from `assertsale`, your own transfer, and `purchasesale`, which assert nothing.

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Actions/Generator.ts:106-112 (the `settlement_quantity` contract on the input type), src/Actions/Generator.ts:494-502 (`namesSameSymbol` as the discriminator), src/Actions/Generator.ts:522-549 (the same-symbol branch), src/Actions/Generator.ts:550-576 (the cross-symbol branch), src/Actions/Symbols.ts:80-86 (`namesSameSymbol`), src/Actions/Symbols.ts:30-69 (quantity and symbol parsing)

## Delphi settlement math: deriveSettlementAmount and formatQuantity

A delphi sale lists in one symbol and settles in another at the oracle rate, and `assertsale` pins only the listing terms. Nothing on chain asserts the settlement amount the buyer deposits, which makes deriving it the integrator's hardest step and its failure a wrong payment. `deriveSettlementAmount(listingAmount, median, pair)` returns that amount as a raw integer, and `formatQuantity(rawAmount, precision, symbolCode)` renders it as the chain quantity string an `asset` field expects. `DelphiPairSpec` is the flat projection the derivation needs, assembled from a supported pair in `getConfig()`.

The derivation reproduces what the contract computes rather than what it ought to compute. The contract divides and scales in binary64 and truncates into a `uint64_t`, so its charge is not the exact rational floor; on the WAX/USD pair it lands a raw unit above the exact floor on a minority of listing amounts. Deriving the exact floor instead would leave the deposit a unit short and the purchase would throw, unless a standing balance quietly covered the difference. The arithmetic here is therefore the contract's, numerical sloppiness included.

Two conditions throw rather than return a number:

- A pair whose exponent works out negative. The contract builds that exponent in unsigned 64-bit arithmetic, so a negative one wraps past 1.8e19, overflows the power step, and has no defined conversion. There is no settlement amount to reproduce.
- A result at or past 2^64, the width the contract assigns the converted price into. No purchase at that price can land.

The helpers also reject a non-positive median, a negative `listingAmount` or `rawAmount`, and a precision outside the 0 to 18 the chain allows.

Worked against the pair the WAX testnet deployment serves (`median: 35`, `median_precision: 4`, `base_precision: 8`, `quote_precision: 2`, `invert_delphi_pair: false`), for a `30.00 USD` listing:

```js
import { deriveSettlementAmount, formatQuantity } from '@atomichub/atomicmarket';

const pair = { median_precision: 4, base_precision: 8, quote_precision: 2, invert_delphi_pair: false };

const raw = deriveSettlementAmount(3000n, 35n, pair);
// -> 857142857142n   (exponent 4 + 8 - 2 = 10; 3000 / 35 * 1e10, truncated)

formatQuantity(raw, 8, 'WAX');
// -> '8571.42857142 WAX'   (pass this as settlement_quantity, and '35' as intended_delphi_median)
```

Read the median immediately before submitting and pass that exact value as `intended_delphi_median`; the contract scans the oracle's `datapoints` table for a row matching it and throws when none does. The chain-side conversion rule and the datapoint read are in [Working with sales](../../guides/sales.md#delphi-oracle-sales) ("Delphi (oracle) sales").

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Actions/Delphi.ts:15-20 (`DelphiPairSpec`), src/Actions/Delphi.ts:27-31 (the 0 to 18 precision bound), src/Actions/Delphi.ts:37 (`UINT64_LIMIT`), src/Actions/Delphi.ts:72-122 (`deriveSettlementAmount`, the exponent, the two throws, the truncation), src/Actions/Delphi.ts:132-153 (`formatQuantity`); the pair values live-read from `https://test.wax.api.atomicassets.io/atomicmarket/v1/config`, the worked figures computed from the pinned formula

## Typed table rows ship alongside the API types

`src/Tables.ts` exports the `get_table_rows` shapes for the v2 contract tables, so a chain-side read deserializes into a named type instead of `any`. Field widths follow the on-chain ABI: `uint64` and `name` fields arrive as strings, and `int32`/`uint32`/`uint8`/`float64` fields arrive as numbers. Use these when reading the market's tables directly rather than through the indexer.

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Tables.ts:1-46 (row interfaces and the field-width rule), src/index.ts:27-28 (root re-export)

## Network factory carries AtomicHub's public hosts

`marketApiForNetwork(network, options?)` constructs an `AtomicMarketApi` against AtomicHub's public endpoints for the same `AtomicHubNetwork` keys the assets SDK defines (`wax`, `wax-testnet`, `vaulta`, `xpr`, `xpr-testnet`, `jungle4`), reusing the re-exported `NETWORK_ENDPOINTS`. Any compatible deployment can be passed straight to the `AtomicMarketApi` constructor instead.

Source: atomicmarket-sdk (v2.3.0, 36aee58) src/Networks.ts:12-16 (`marketApiForNetwork`), src/Networks.ts:1-10 (re-exported `AtomicHubNetwork`/`NETWORK_ENDPOINTS`); `wax` and `wax-testnet` factories verified live

## When to use the SDK versus raw HTTP or WharfKit table reads

The read-path choice mirrors the AtomicAssets SDK, consistent with `guides/querying-the-api.md`:

| Read path | When it is right | Caveat |
| --- | --- | --- |
| `AtomicMarketApi` (this SDK) | Typed indexer reads of sales, auctions, buyoffers, marketplaces, and the royalty layer from JS/TS | Inherits the deployment's `limit` cap of 100, and failures arrive as a rejected promise carrying `ApiError` |
| Raw HTTP against the AtomicMarket API | Outside a JS runtime, or when you want direct control over paging | You own the percent-encoding, the state-enum choice, and treating a non-2xx as an error; the endpoints are in [atomicassets-api HTTP API](../api.md) |
| Chain table reads (`@wharfkit/antelope` `get_table_rows`) | Unindexed marketplace state without indexer lag | The numeric-key and `show_payer` behaviors in [@wharfkit/antelope client behavior](../wharfkit.md) apply, and large ids can arrive as strings |

List endpoints reached through `AtomicMarketApi` inherit the deployment's `limit` cap of 100; see [atomicassets-api HTTP API](../api.md#list-endpoints-cap-limit-at-100) ("List endpoints cap limit at 100").
