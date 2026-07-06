# Querying the API and reading chain tables

Workflow patterns for reading Atomic data, combining facts from the `reference/` files. Each pattern links back to the reference section that carries the underlying fact.

For the full endpoint, parameter, and schema listing, use the deployment's Swagger UI (`https://wax.api.atomicassets.io/docs/` on the WAX reference deployment); see `reference/api.md` ("Interactive reference (Swagger UI)"), which also covers why no standalone OpenAPI JSON is published.

## Paginate list endpoints under the limit cap

List endpoints such as `/atomicmarket/v1/sales` and `/atomicmarket/v1/buyoffers` reject `limit` values above the server's cap (100 on the reference deployment at wax.api.atomicassets.io) with HTTP 400 and `{"success": false, "message": "Invalid value for parameter limit"}`; the value is not clamped. Bound `limit` to 100 and advance with `page`:

```sh
curl 'https://wax.api.atomicassets.io/atomicmarket/v1/sales?limit=100&page=1'
curl 'https://wax.api.atomicassets.io/atomicmarket/v1/sales?limit=100&page=2'
```

Always treat a non-2xx response as an error. An HTTP helper that returns undefined or an empty list on failure silently turns an over-limit request into a zero count (a wrong answer, not a missing one). See `reference/api.md` ("List endpoints cap limit at 100").

## Filter template buyoffers by state

`/v1/template_buyoffers` applies no state filter by default and rows are never deleted, so an unfiltered query returns LISTED (0), CANCELED (1), and SOLD (2) offers together. Pass `state=0` when you only want active offers:

```sh
curl 'https://wax.api.atomicassets.io/atomicmarket/v1/template_buyoffers?state=0&limit=100&page=1'
```

Do not rely on socket notifications for lifecycle tracking: only new offers are broadcast; cancellation and fulfillment are not. See `reference/api.md` ("Template buyoffers keep all lifecycle states").

## Read chain tables with get_table_rows

When reading contract tables directly over `/v1/chain/get_table_rows`, three behaviors matter:

- **Numeric keys need `key_type: 'i64'`.** @wharfkit/antelope's typed `client.v1.chain.get_table_rows` infers `key_type` only from typed bound instances; plain string or number bounds fall back to `key_type: 'name'` and are silently misread as account names, returning wrong ranges. Pass `key_type: 'i64'` explicitly (or typed bounds) for tables keyed by numeric ids. See `reference/wharfkit.md` ("Typed get_table_rows is not a drop-in for dynamic reads").
- **`show_payer` shapes differ by transport.** The raw endpoint wraps each row as `{ data, payer }`; the typed wharfkit client unwraps rows and moves payers into an index-aligned `ram_payers` array on the response. Read `response.ram_payers[i]` with the typed client, or call the raw endpoint with `json: true, show_payer: true` to keep the envelope. See `reference/wharfkit.md` ("show_payer rows are unwrapped into ram_payers").
- **Large uint64 values arrive as strings.** nodeos serializes uint64 values above 2^32 as JSON strings and smaller values as JSON numbers; current `sale_id`/`auction_id`/`offer_id` values arrive as numbers, but asset ids (around 2^40) arrive as strings. Parse id fields defensively rather than assuming one shape. See `reference/atomicmarket/v2-changes.md` ("Marketplace attribution fields on the shared contract").

## Classify deterministic errors before retrying

Some chain errors are deterministic facts, not transient failures. `/v1/chain/get_account` for a nonexistent account returns HTTP 400 with `error.code` 3060002 and `error.name` `account_query_exception`; retrying is pointless, and classifying it as a generic error traps callers in retry loops. Map 3060002 to a distinct account-not-found response, checking both the structured code (which may arrive as number or string) and the `account_query_exception` message text, since proxies can strip either. This case is common on WAX because Cloud Wallet users can hold a reserved `.wam` name before the on-chain account exists. See `reference/chain.md` ("Error 3060002 means the account does not exist").
