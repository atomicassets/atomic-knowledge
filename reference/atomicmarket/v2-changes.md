---
scope: V2 changes index for the atomicmarket contract, plus the two facts that live only here - defensive guards and uint64 JSON serialization
depends-on: [reference/atomicmarket/fees-and-royalties.md, reference/atomicmarket/actions.md, reference/atomicmarket/tables.md]
key-modules: ["atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp, include/atomicmarket.hpp"]
---

# AtomicMarket V2 behavior changes and defensive guards

Two facts live only on this page: the V2 contract's defensive guards, and nodeos's uint64 JSON serialization behavior. Every other V2 change to the shared `atomicmarket` contract is indexed below, each pointing to its authoritative home.

## Defensive guards in the V2 contract

The AtomicMarket V2 contract carries four classes of defensive guard: First, fee configuration is bounded at config time (`setmarketfee` and `addbonusfee` reject fees that, together with the 15% maximum collection fee, exceed the sale price) with a strict `seller payout > 0` assertion at settlement as the backstop: the only place that sees stacked bonus fees plus the live collection fee together. Second, the 3-iterator `std::is_permutation(first1, last1, first2)` overload never checks the second range's length and reads past the stored vector on a longer caller-supplied list (undefined behavior in wasm linear memory), so `assertsale`, `assertauct`, and `acceptbuyo` use the length-checking 4-iterator overload. Third, the collection fee read live at settlement is re-asserted to `0 <= fee <= 0.15`, because casting a negative double to uint64_t is undefined behavior, not a large number. Fourth, `--table.end()` on a possibly-empty multi_index is guarded by a `begin() != end()` check first. Each guard has regression coverage in the contract repo's VeRT test suite.

Source: `src/atomicmarket.cpp:174-248` (fee bound at config time: `setmarketfee`, `addbonusfee`), `src/atomicmarket.cpp:2648-2655` (seller-remainder backstop), `src/atomicmarket.cpp:993-1015` (`assertsale` 4-iterator guard), `src/atomicmarket.cpp:1404-1415` (`assertauct` 4-iterator guard), `src/atomicmarket.cpp:1533-1626` (`acceptbuyo` 4-iterator guard), `src/atomicmarket.cpp:2593-2609` (negative-double fee range re-assertion), `src/atomicmarket.cpp:1567-1572` (`acceptbuyo` `--table.end()` guard), `src/atomicmarket.cpp:1741-1743` (`fulfilltbuyo` `--table.end()` guard)

## Large integers serialize as strings

Reading these tables over `/v1/chain/get_table_rows`, nodeos serializes uint64 values above 2^32 as JSON strings and smaller values as JSON numbers. Current `sale_id`/`auction_id`/`offer_id` values arrive as numbers, but asset ids (around 2^40) arrive as strings, so parse id fields defensively rather than assuming one shape.

## Marketplace attribution

See `reference/atomicmarket/marketplaces.md` for the full attribution model: how `maker_marketplace`/`taker_marketplace` are supplied, which side survives past settlement, and how a marketplace's cut is credited.

## Execution-time fees and trace-only royalty logs

See `reference/atomicmarket/fees-and-royalties.md` for the full fee model: the collection fee applies at execution time rather than listing time, the royalty log actions are trace-only, and the seller-remainder assertion is the settlement-time backstop against stacked fees.

## Bundle listing retirement

V2 removes bundle (multi-asset) listings. Each action's own legacy-row handling is documented inline via the "Changed in V2" notes and per-action descriptions in `reference/atomicmarket/actions.md` and `reference/atomicmarket/tables.md`.

## Overlapping and lazy-accept listings

See `guides/sales.md` for why AtomicMarket's lazy-accept escrow model makes multiple live sale listings of the same asset valid chain state, not drift.
