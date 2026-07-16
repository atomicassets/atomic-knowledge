---
scope: atomicassets-api HTTP API behavior - Swagger reference, list-endpoint pagination limits, buyoffer lifecycle states
depends-on: []
key-modules:
    - "atomicassets-api (main): src/api/server.ts, src/api/namespaces/*/openapi.ts"
---

# atomicassets-api HTTP API

## Interactive reference (Swagger UI)

Each deployment serves a live Swagger UI at `/docs` that lists every endpoint, parameter, and response schema for that chain. On the WAX mainnet reference deployment it is `https://wax.api.atomicassets.io/docs/`, and on the WAX testnet reference deployment `https://test.wax.api.atomicassets.io/docs/`. The per-namespace paths (`/atomicassets/docs`, `/atomicmarket/docs`, `/atomictools/docs`) redirect to the same merged UI. Swap the host for another chain's endpoint to get that chain's docs; each host indexes exactly one chain, so mainnet and testnet data never mix.

There is no standalone OpenAPI JSON published: `/openapi.json` and `/docs/swagger.json` both return 404. The full OpenAPI 3.0 document is only reachable embedded inside the Swagger UI bootstrap at `/docs/swagger-ui-init.js`, which is a JavaScript file, not a clean spec URL. For code generation, the durable source of truth is the per-namespace spec definitions in the atomicassets-api repo (`src/api/namespaces/{atomicassets,atomicmarket,atomictools}/openapi.ts`), which the server assembles into the document Swagger renders. Note the served document's title is `EOSIO Contract API`, the software's historical name.

Source: `atomicassets-api src/api/server.ts` (`swagger.setup` mounted at `/docs`, no JSON spec route), `atomicassets-api src/api/namespaces/*/openapi.ts`, live probes of `https://wax.api.atomicassets.io/docs/` (200), `/openapi.json` and `/docs/swagger.json` (404), `/docs/swagger-ui-init.js` (200, carries the `openapi: 3.0.0` document)

## List endpoints cap limit at 100

The atomicassets-api validates the `limit` query parameter on list endpoints such as `/atomicmarket/v1/buyoffers` and `/atomicmarket/v1/sales` against a maximum that defaults to 100; requests above the cap are rejected with HTTP 400 and `{"success": false, "message": "Invalid value for parameter limit"}` rather than being clamped. The cap is an operator-configurable server setting (`limits` in the API config), so the reference deployment at wax.api.atomicassets.io enforces 100. Pagination code must therefore bound `limit` to 100 and use `page`, and counting code must treat a non-2xx response as an error: an HTTP client helper that returns undefined or empty on failure will silently turn an over-limit request into a zero count.

## Template buyoffers keep all lifecycle states

AtomicMarket template buyoffers in the atomicassets-api follow a three-state lifecycle: `lognewtbuyo` inserts a row in state 0 (LISTED), `canceltbuyo` flips it to 1 (CANCELED), and `fulfilltbuyo` flips it to 2 (SOLD), setting the seller and inserting the fulfilled asset rows. Rows are never deleted or archived: no maintenance job cleans up CANCELED or SOLD offers, so they persist indefinitely as state markers. The `/v1/template_buyoffers` endpoint applies no state filter by default: without an explicit `state` query parameter it returns offers in all three states, so clients that only want active offers must pass `state=0`. No socket notifications are broadcast for template buyoffers at the pinned commit: the socket handler for new offers exists in the source but is never wired into the atomicmarket namespace, and cancellation and fulfillment have no handler at all (`reference/api-streaming.md`). Poll the endpoint rather than waiting on socket events. The filler and API state enums both encode LISTED=0, CANCELED=1, SOLD=2 and map 1:1.

## The `state` field means something different on each listing endpoint

Every AtomicMarket listing endpoint returns a numeric `state`, but the enum differs by listing type, and template buyoffers are the odd one out. The four API state enums are:

- **Sales** (`/v1/sales`, `/v1/sales/{id}`): `WAITING=0`, `LISTED=1`, `CANCELED=2`, `SOLD=3`, `INVALID=4`. A completed purchase reads `state=3`.
- **Auctions** (`/v1/auctions`): `WAITING=0`, `LISTED=1`, `CANCELED=2`, `SOLD=3`, `INVALID=4` (INVALID = the auction ended with no bid).
- **Buyoffers** (`/v1/buyoffers`): `PENDING=0`, `DECLINED=1`, `CANCELED=2`, `ACCEPTED=3`, `INVALID=4`.
- **Template buyoffers** (`/v1/template_buyoffers`): `LISTED=0`, `CANCELED=1`, `SOLD=2` (see the section above).

Sales, auctions, and buyoffers share the value `0` for a not-yet-active listing (assets/funds not escrowed) and `2` for CANCELED, but the "settled" value is `3` (SOLD / ACCEPTED), not the `2` a template buyoffer uses. Do not carry a `SOLD=2` assumption from the template-buyoffer enum across to the other three endpoints.

Source: `atomicassets-api src/api/namespaces/atomicmarket/index.ts` (`SaleApiState`, `AuctionApiState`, `BuyofferApiState`, `TemplateBuyofferApiState`)

## Rate limits

REST requests are rate limited per client IP when the deployment sets a `rate_limit` config block; with it unset there is no limiter. The limit is `rate_limit.requests` over a sliding window of `rate_limit.interval` seconds, and the counter lives in Redis (via `rate-limit-redis`) under a per-chain key prefix, so the budget is shared across every API replica for that chain rather than counted per process. The client is keyed by `req.ip`, resolved through the `trust_proxy` setting, so behind Cloudflare a correct CIDR `trust_proxy` list is what makes the bucket the real client rather than the edge. Over the limit the API returns HTTP 429 with `{"success": false, "message": "Rate limit"}`. IPs listed in `ip_whitelist` skip the limiter entirely (and the response cache with it). The limiter is mounted only on the REST namespace paths (`/atomicassets`, `/atomicmarket`, `/atomictools`), so the root operational routes (`/health`, `/alive`, `/healthc`, `/timestamp`, `/metrics`, `/docs`) are not rate limited, and neither are Socket.IO connections, which bypass express entirely (`reference/api-streaming.md`).

Both header families are emitted: the standard draft `RateLimit-Limit`, `RateLimit-Policy`, `RateLimit-Remaining`, `RateLimit-Reset` and the legacy `X-RateLimit-*`. A `curl -sI` of `https://wax.api.atomicassets.io/atomicassets/v1/assets?limit=1` returns `ratelimit-limit: 240` and `ratelimit-policy: 240;w=60`, so the reference WAX deployment allows 240 requests per 60 seconds. Those numbers are deployment config, not a property of the software: the defaults live in the operator's `server.config.json`, other chains and mirrors set their own, and a value read from headers today can change on any redeploy. Bound client request rate to the `RateLimit-Remaining`/`RateLimit-Reset` the server actually returns rather than to a hardcoded ceiling.

When `rate_limit.bill_execution_time` is enabled (it is `true` in the reference config), a request that takes longer than a second costs more than one hit: after the response is sent the limiter adds `ceil(elapsed_seconds) - 1` extra increments to the caller's bucket, so a slow multi-second query draws down the window faster than a fast one. A client that paginates with heavy filters can therefore hit 429 well before it has made `requests` calls. Budget for the billed cost of slow queries, not just the raw call count.

Source: `atomicassets-api src/api/server.ts` (`WebServer` constructor: `rateLimit` with `RedisStore`, `ipKeyGenerator(req.ip)`, `ip_whitelist` skip, 429 `Rate limit` handler, `legacyHeaders`/`standardHeaders` both true, `bill_execution_time` post-send increment loop), `src/api/namespaces/*/index.ts` (`server.web.express.use(this.path, server.web.limiter)` mounts the limiter per namespace path), `src/types/config.ts` (`rate_limit.interval`/`requests`/`bill_execution_time`, `ip_whitelist`), `config/server.config.example.json` (`interval: 60`, `requests: 240`, `bill_execution_time: true`); live `curl -sI` of `https://wax.api.atomicassets.io/atomicassets/v1/assets?limit=1` returning `ratelimit-limit: 240`, `ratelimit-policy: 240;w=60`, and the `x-ratelimit-*` legacy set
