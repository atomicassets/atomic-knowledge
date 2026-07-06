---
scope: atomicassets-api HTTP API behavior - Swagger reference, list-endpoint pagination limits, buyoffer lifecycle states
depends-on: []
key-modules:
    - "atomicassets-api (main): src/api/server.ts, src/api/namespaces/*/openapi.ts"
---

# atomicassets-api HTTP API

## Interactive reference (Swagger UI)

Each deployment serves a live Swagger UI at `/docs` that lists every endpoint, parameter, and response schema for that chain. On the WAX reference deployment it is `https://wax.api.atomicassets.io/docs/`. The per-namespace paths (`/atomicassets/docs`, `/atomicmarket/docs`, `/atomictools/docs`) redirect to the same merged UI. Swap the host for another chain's endpoint to get that chain's docs.

There is no standalone OpenAPI JSON published: `/openapi.json` and `/docs/swagger.json` both return 404. The full OpenAPI 3.0 document is only reachable embedded inside the Swagger UI bootstrap at `/docs/swagger-ui-init.js`, which is a JavaScript file, not a clean spec URL. For code generation, the durable source of truth is the per-namespace spec definitions in the atomicassets-api repo (`src/api/namespaces/{atomicassets,atomicmarket,atomictools}/openapi.ts`), which the server assembles into the document Swagger renders. Note the served document's title is `EOSIO Contract API`, the software's historical name.

Source: `atomicassets-api src/api/server.ts` (`swagger.setup` mounted at `/docs`, no JSON spec route), `atomicassets-api src/api/namespaces/*/openapi.ts`, live probes of `https://wax.api.atomicassets.io/docs/` (200), `/openapi.json` and `/docs/swagger.json` (404), `/docs/swagger-ui-init.js` (200, carries the `openapi: 3.0.0` document)

## List endpoints cap limit at 100

The AtomicMarket API (eosio-contract-api) validates the `limit` query parameter on list endpoints such as `/atomicmarket/v1/buyoffers` and `/atomicmarket/v1/sales` against a maximum that defaults to 100; requests above the cap are rejected with HTTP 400 and `{"success": false, "message": "Invalid value for parameter limit"}` rather than being clamped. The cap is an operator-configurable server setting (`limits` in the API config), so the reference deployment at wax.api.atomicassets.io enforces 100. Pagination code must therefore bound `limit` to 100 and use `page`, and counting code must treat a non-2xx response as an error: an HTTP client helper that returns undefined or empty on failure will silently turn an over-limit request into a zero count.

## Template buyoffers keep all lifecycle states

AtomicMarket template buyoffers in eosio-contract-api follow a three-state lifecycle: `lognewtbuyo` inserts a row in state 0 (LISTED), `canceltbuyo` flips it to 1 (CANCELED), and `fulfilltbuyo` flips it to 2 (SOLD), setting the seller and inserting the fulfilled asset rows. Rows are never deleted or archived: no maintenance job cleans up CANCELED or SOLD offers, so they persist indefinitely as state markers. The `/v1/template_buyoffers` endpoint applies no state filter by default: without an explicit `state` query parameter it returns offers in all three states, so clients that only want active offers must pass `state=0`. Socket notifications are emitted only for new offers; cancellation and fulfillment produce no broadcast. The filler and API state enums both encode LISTED=0, CANCELED=1, SOLD=2 and map 1:1.
