---
scope: Unvalidated claims about the atomicassets-api hosted HTTP surface, waiting on a source read or a live probe before they can enter the polished tier
depends-on: []
key-modules: []
---

# Learning log: hosted HTTP API

Unvalidated claims about the atomicassets-api HTTP surface. See `INSTRUCTIONS.md` for the entry format and the promotion gate.

## The /v2/sales route omits sales in the Waiting state

- **Claim.** `/atomicmarket/v2/sales` excludes sales whose `state` is `0` (WAITING, announced but with no escrow offer yet), so a query that wants those rows belongs on `/atomicmarket/v1/sales`.
- **How it would be validated.** Read the route's query construction in the atomicassets-api source (`src/api/namespaces/atomicmarket/routes/sales.ts` and the materialized-view definition the `/v2` handler selects from) at a pinned commit, and check whether the view's predicate filters the waiting state. A live probe cannot settle it alone: a waiting sale exists only between `announcesale` and the escrow offer, and both the WAX mainnet and the WAX testnet deployments report a `state=0` count of zero on `/v1` and `/v2` alike, so the two routes agree vacuously. A live confirmation needs a sale announced without an offer on a chain the prober controls, then the same `state=0` query against both routes.
- **Promote to:** `reference/api.md`, the section "Two sales list routes answer on the hosted deployment".

What is already validated and lives in `reference/api.md`: both routes answer 200 on the reference deployment, their unfiltered and `state=1` counts match, the row shapes are the same (both are typed `ISale` in `@atomichub/atomicmarket`), and the served OpenAPI document describes `/v2/sales` and not `/v1/sales`. Only the waiting-state exclusion is unvalidated, which is why the polished page states the routes without it.
