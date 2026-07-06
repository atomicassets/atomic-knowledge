# atomicassets-api HTTP API

Validated behavior of the hosted atomicassets-api (eosio-contract-api) HTTP endpoints, such as the reference deployment at wax.api.atomicassets.io.

## List endpoints cap limit at 100

The AtomicMarket API (eosio-contract-api) validates the `limit` query parameter on list endpoints such as `/atomicmarket/v1/buyoffers` and `/atomicmarket/v1/sales` against a maximum that defaults to 100; requests above the cap are rejected with HTTP 400 and `{"success": false, "message": "Invalid value for parameter limit"}` rather than being clamped. The cap is an operator-configurable server setting (`limits` in the API config), so the reference deployment at wax.api.atomicassets.io enforces 100. Pagination code must therefore bound `limit` to 100 and use `page`, and counting code must treat a non-2xx response as an error: an HTTP client helper that returns undefined or empty on failure will silently turn an over-limit request into a zero count.

## Template buyoffers keep all lifecycle states

AtomicMarket template buyoffers in eosio-contract-api follow a three-state lifecycle: `lognewtbuyo` inserts a row in state 0 (LISTED), `canceltbuyo` flips it to 1 (CANCELED), and `fulfilltbuyo` flips it to 2 (SOLD), setting the seller and inserting the fulfilled asset rows. Rows are never deleted or archived: no maintenance job cleans up CANCELED or SOLD offers, so they persist indefinitely as state markers. The `/v1/template_buyoffers` endpoint applies no state filter by default: without an explicit `state` query parameter it returns offers in all three states, so clients that only want active offers must pass `state=0`. Socket notifications are emitted only for new offers; cancellation and fulfillment produce no broadcast. The filler and API state enums both encode LISTED=0, CANCELED=1, SOLD=2 and map 1:1.
