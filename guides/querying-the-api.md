---
scope: Workflow patterns for reading Atomic data over the HTTP API and get_table_rows - pagination caps, state filters, chain reads, and deterministic errors
depends-on: [reference/api.md]
key-modules: ["atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp", "atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp"]
---

# Query the API and chain tables

Workflow patterns for reading Atomic data, combining facts from the `reference/` files. Each pattern links back to the reference section that carries the underlying fact.

For the full endpoint, parameter, and schema listing, use the deployment's Swagger UI (`https://wax.api.atomicassets.io/docs/` on the WAX reference deployment); see [atomicassets-api HTTP API](../reference/api.md#interactive-reference-swagger-ui) ("Interactive reference (Swagger UI)"), which also covers why no standalone OpenAPI JSON is published.

## Switching to testnet means swapping two hosts, not one

The examples here use WAX mainnet hosts. The `atomicassets` and `atomicmarket` contract accounts have the same names on WAX testnet, so nothing in an action's data changes, and that is exactly what makes the mistake easy to miss.

| Read | WAX mainnet | WAX testnet |
| --- | --- | --- |
| Chain tables (`get_table_rows`) | `https://wax.greymass.com` | `https://waxtestnet.greymass.com` |
| HTTP API | `https://wax.api.atomicassets.io` | `https://test.wax.api.atomicassets.io` |

The testnet API host runs the same atomicassets-api software indexing the testnet chain. The mainnet host has no testnet data, so an integrator who changes only the RPC node and keeps the mainnet API host reads an unrelated chain and sees a working request return facts about someone else's assets. Testnet is also where the V2 contracts run, so a V2-only route such as the royalty read layer answers there and returns HTTP 416 everywhere on mainnet; see [atomicassets-api HTTP API](../reference/api.md#the-royalty-routes-answer-416-when-a-collection-has-no-config) ("The royalty routes answer 416 when a collection has no config").

## Percent-encode every caller-supplied URL part

Both SDKs percent-encode caller-supplied path segments and both the key and the value of every query parameter. A hand-rolled URL has to do the same. An asset id, collection, schema, template, or account name that carries `/`, `?`, or `#` escapes its own path segment and sends the request somewhere else; a data-filter key carrying `&` or `=` appends query parameters of its own.

```
// correct: encodeURIComponent (or the equivalent) on each path segment, and on both sides of every query pair
// avoid: pasting a caller-supplied value straight into the URL string
```

Encoding the whole key is safe even where it looks unnecessary. The typed data filters carry a colon (`data:number.level`, `data:bool.foil`, `data:text.rarity`), which encodes to `data%3Anumber.level` on the wire, and the deployment answers both spellings identically:

```sh
curl 'https://wax.api.atomicassets.io/atomicassets/v1/templates?collection_name=alien.worlds&data:text.rarity=Common&limit=2'
curl 'https://wax.api.atomicassets.io/atomicassets/v1/templates?collection_name=alien.worlds&data%3Atext.rarity=Common&limit=2'
# both return the same two templates (906463, 906461)
```

See [@atomichub/atomicassets SDK](../reference/sdk/atomicassets.md#path-segments-and-query-keys-are-percent-encoded) ("Path segments and query keys are percent-encoded") for what the SDKs do on the caller's behalf.

## Paginate list endpoints under the limit cap

List endpoints such as `/atomicmarket/v1/sales` and `/atomicmarket/v1/buyoffers` reject `limit` values above the server's cap (100 on the reference deployment at wax.api.atomicassets.io) with HTTP 400 and `{"success": false, "message": "Invalid value for parameter limit"}`; the value is not clamped. Bound `limit` to 100 and advance with `page`:

```sh
curl 'https://wax.api.atomicassets.io/atomicmarket/v1/sales?limit=100&page=1'
curl 'https://wax.api.atomicassets.io/atomicmarket/v1/sales?limit=100&page=2'
```

```
// correct: limit=100, page through with `page`, and treat any non-2xx as an error
// avoid: limit=1000, or an HTTP helper that returns an empty list on failure
```

Always treat a non-2xx response as an error. An HTTP helper that returns undefined or an empty list on failure silently turns an over-limit request into a zero count (a wrong answer, not a missing one). See [atomicassets-api HTTP API](../reference/api.md#list-endpoints-cap-limit-at-100) ("List endpoints cap limit at 100").

## Filter template buyoffers by state

`/v1/template_buyoffers` applies no state filter by default and rows are never deleted, so an unfiltered query returns LISTED (0), CANCELED (1), and SOLD (2) offers together. Pass `state=0` when you only want active offers:

```sh
curl 'https://wax.api.atomicassets.io/atomicmarket/v1/template_buyoffers?state=0&limit=100&page=1'
```

Do not rely on socket notifications for lifecycle tracking: only new offers are broadcast; cancellation and fulfillment are not. See [atomicassets-api HTTP API](../reference/api.md#template-buyoffers-keep-all-lifecycle-states) ("Template buyoffers keep all lifecycle states").

## Read chain tables with get_table_rows

When reading contract tables directly over `/v1/chain/get_table_rows`, three behaviors matter:

- **Numeric keys need `key_type: 'i64'`.** @wharfkit/antelope's typed `client.v1.chain.get_table_rows` infers `key_type` only from typed bound instances; plain string or number bounds fall back to `key_type: 'name'` and are silently misread as account names, returning wrong ranges. Pass `key_type: 'i64'` explicitly (or typed bounds) for tables keyed by numeric ids. See [@wharfkit/antelope client behavior](../reference/wharfkit.md#typed-get_table_rows-is-not-a-drop-in-for-dynamic-reads) ("Typed get_table_rows is not a drop-in for dynamic reads").
- **`show_payer` shapes differ by transport.** The raw endpoint wraps each row as `{ data, payer }`; the typed WharfKit client unwraps rows and moves payers into an index-aligned `ram_payers` array on the response. Read `response.ram_payers[i]` with the typed client, or call the raw endpoint with `json: true, show_payer: true` to keep the envelope. See [@wharfkit/antelope client behavior](../reference/wharfkit.md#show_payer-rows-are-unwrapped-into-ram_payers) ("show_payer rows are unwrapped into ram_payers").
- **Large uint64 values arrive as strings.** nodeos serializes uint64 values above 2^32 as JSON strings and smaller values as JSON numbers; current `sale_id`/`auction_id`/`offer_id` values arrive as numbers, but asset ids (around 2^40) arrive as strings. Parse id fields defensively rather than assuming one shape. See [AtomicMarket V2 changes](../reference/atomicmarket/v2-changes.md#large-integers-serialize-as-strings) ("Large integers serialize as strings").
- **The `assets` table is scoped by owner, with no collection or template index.** Enumerating every asset in a collection or template is an API-only capability: `/atomicassets/v1/assets?collection_name=...` joins across owners, but `get_table_rows` on `assets` takes the owner account as `scope`, so there is no chain-side path from a collection to its asset list without already knowing the owners. To read one specific asset over the chain, use its current owner as `scope` and its `asset_id` as an `i64`-typed bound.

## Classify deterministic errors before retrying

Some chain errors are deterministic facts, not transient failures. `/v1/chain/get_account` for a nonexistent account returns HTTP 400 with `error.code` 3060002 and `error.name` `account_query_exception`; retrying is pointless, and classifying it as a generic error traps callers in retry loops. Map 3060002 to a distinct account-not-found response, checking both the structured code (which may arrive as number or string) and the `account_query_exception` message text, since proxies can strip either. This case is common on WAX because Cloud Wallet users can hold a reserved `.wam` name before the on-chain account exists. See [Chain RPC behavior](../reference/chain.md#error-3060002-means-the-account-does-not-exist) ("Error 3060002 means the account does not exist").
