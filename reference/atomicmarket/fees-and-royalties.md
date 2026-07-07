---
scope: The full fee model for a sale, auction, or buyoffer settlement on atomicmarket - marketplace fees, fee bounds, collection fee timing, and the V2 royalty split engine
depends-on: [reference/atomicmarket/tables.md, reference/atomicmarket/marketplaces.md]
key-modules: ["atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp, include/atomicmarket.hpp"]
---

# AtomicMarket fees and royalties

The full fee model applied to a sale, auction, or buyoffer settlement on the `atomicmarket` contract: the maker and taker marketplace fees, the protocol-configured market fee bounds, the AtomicAssets collection fee and when it is read, and the V2 royalty split engine that divides the collection's share among founders, template owners, and attribute-matched recipients.

## Every settlement stacks four fee layers before the seller is paid

A sale, auction claim, or buyoffer acceptance all route through `internal_payout_sale`, which deducts, in order: the maker marketplace fee, the taker marketplace fee, the collection fee, and any active bonus fees, crediting each recipient before adding the remainder to the seller's balance. The maker and taker rates come from the `config` singleton's `maker_market_fee` and `taker_market_fee` fields (0.01 each by default) and are computed as `fee_rate * quantity.amount` cast to an integer token amount, credited to the registered marketplace's `creator` account. A strict `seller_cut_quantity.amount > 0` assertion is the final backstop: if the stacked fees would leave the seller nothing (or a negative remainder), the whole settlement reverts rather than silently zeroing the payout.

Source: `src/atomicmarket.cpp:2563-2665` (`internal_payout_sale`), `include/atomicmarket.hpp:638-652` (`config_s`)

## Fee configuration is bounded at config time and re-asserted at settlement

`setmarketfee` rejects a maker/taker combination that, together with the AtomicAssets 15% maximum collection fee, would exceed the full sale price, and `addbonusfee` applies the same check to a single new bonus fee. Neither check can see every bonus fee stacked together, so `internal_payout_sale`'s positive-seller-remainder assertion is the only place that catches a combination of several bonus fees exceeding the price. Fee rates themselves are plain `double` values with no standalone per-rate clamp (`addbonusfee` requires a rate above zero, and the config-time checks bound the combined total at 100% of the price), so a fee rate is only as safe as the config-time and settlement-time checks around it.

Source: `src/atomicmarket.cpp:174-248` (`setmarketfee`, `addbonusfee`), `src/atomicmarket.cpp:2648-2655` (seller-remainder backstop)

## The collection fee applies at execution time, not at listing time

`announcesale`, `announceauct`, and `createbuyo` all read the collection's fee once at creation and store it on the row (`collection_fee`), but that stored value is written only for indexing: the `lognew*` actions emit it so indexers can display a listing's fee without a second lookup. At settlement, `internal_payout_sale` calls `partial_read_collection` again and uses whatever the collection's fee is at that moment, completely ignoring the value stored on the row. A collection author can raise or lower the fee at any time and the new rate applies immediately to every already-open listing; the buyer still pays the listed price, so only the seller/collection split moves. The live value is re-asserted to `0 <= fee <= 0.15` before use, because a fee outside that range (including a negative value, which is undefined behavior once cast to an unsigned integer) must not reach the payout math.

Source: `src/atomicmarket.cpp:2593-2609` (live collection fee read and range check), `src/atomicmarket.cpp:744-809` (`announcesale` storing the listing-time fee for logging only)

## The royalty split engine divides the collection fee among founders, templates, and attributes

When a collection has a `royaltyconf` row, `distribute_collection_fee` splits that asset's share of the collection fee across up to three categories (founders, the asset's template, and any attribute rules the asset matches), proportional to the config's `split_founders`/`split_templates`/`split_attributes` weights. A category with no payees for the given asset (no template royalty registered, no attribute rule matched) is dropped and the remaining categories are renormalized against each other, so no share is stranded. Attribute matching walks the asset's data sources in the fixed precedence order asset-immutable, asset-mutable, template-immutable, template-mutable; `attribute_mode = 0` merges all sources into one lookup per field before matching a rule, while `attribute_mode = 1` matches each source separately against source-tagged rules, and a collection cannot flip between the two modes while attribute rules exist. A collection with no `royaltyconf` row at all pays its full collection fee to the collection author, exactly as under the pre-V2 model.

The standing royalty configuration is readable over the HTTP API as well as the chain. `GET /atomicmarket/v1/royalties/{collection}` returns the founders list, `attribute_mode`, and the `split_founders`/`split_templates`/`split_attributes` weights; `/atomicmarket/v1/royalties/{collection}/templates` and `/atomicmarket/v1/royalties/{collection}/attributes` return the per-template and per-attribute rules; and `/atomicmarket/v1/royalties/accounts/{recipient}` aggregates a recipient's earned payouts. Note the path form (`/royalties/{collection}`) is the config read; the query-parameter form (`/royalties?collection_name=...`) is not a route and returns 404. On the chain these map to `royaltyconf` (scope = the market contract account, primary key = collection), `royaltytemp`, and `royaltyattr` (both scoped by collection).

Source: `src/atomicmarket.cpp:2689-2957` (`distribute_collection_fee` category split and attribute matching), `include/atomicmarket.hpp:477-517` (`royaltyconf_s`, `royaltytemp_s`, `royaltyattr_s`)

## The royalty log actions are trace-only and dust always reconciles

`logroyfound`, `logroytempl`, `logroyattr`, and `logroydust` are inline actions the contract sends to itself (`require_auth(get_self())`, empty bodies) with no `require_recipient`: a payout recipient's contract can never assert inside a notification handler and block someone else's settlement. That also means a plain notification-driven indexer never observes them; only a trace-reading pipeline (state history / an EOS SHiP consumer) captures them. Every recipient's payout inside `distribute_collection_fee` is accumulated in memory and written to the `balances` table exactly once per recipient, and any integer-division remainder from splitting a share across recipients or rules is added to the collection author's payout and reported through `logroydust`, so `sum(all logroy* payout amounts for one settlement) == the collection fee actually applied` always holds exactly, to the unit. Indexers should store these logged amounts rather than recomputing the split from the royalty config tables, which can diverge through rounding or config changes between listing and settlement under the execution-time fee model. A client reads a settled listing's actual payouts from the indexer's per-listing logs endpoint rather than the chain: `/atomicmarket/v1/sales/{sale_id}/logs` returns the `logroyfound`/`logroytempl`/`logroyattr`/`logroydust` entries, each carrying its `payouts` array of `{recipient, amount}`; the same `/logs` suffix serves `/v1/auctions/{auction_id}`, `/v1/buyoffers/{buyoffer_id}`, and `/v1/template_buyoffers/{buyoffer_id}`. There is no aggregate `/royalties` payout endpoint on a listing; the logs are the payout record. The contract repo's `docs/api-integration.md` documents the full indexer interface, and the VeRT suite is an executable reference for every flow.

Source: `src/atomicmarket.cpp:2085-2117` (`logroyfound`/`logroytempl`/`logroyattr`/`logroydust` action bodies), `src/atomicmarket.cpp:2960-2986` (dust accrual and `logroydust` emission)

## Bonus fees are additive marketplace incentives layered on top

`addbonusfee` registers a named fee (a fixed rate paid to a fixed recipient) that applies only to payouts whose `relevant_counter_name`/`relevant_counter_id` falls within the counter ranges the bonus fee was scoped to when added or later extended via `addafeectr`; `stopbonusfee` freezes a bonus fee's ranges at their current end so it no longer applies to future listings without deleting its history, and `delbonusfee` removes it outright. Multiple bonus fees can apply to the same payout simultaneously, which is why the config-time bound in `addbonusfee` (checked against one new fee at a time) cannot be the only protection; the settlement-time seller-remainder check covers the stacked case.

This layer is not hypothetical on WAX: both WAX mainnet and WAX testnet carry a standing bonus fee of 2% paid to the `wax` account (the WAX protocol fee) that applies to essentially every sale, auction, and buyoffer settlement. A client that estimates seller proceeds as `price - maker - taker - collection` is therefore off by that 2% on WAX. Read the `atomicmarket` `bonusfees` table (scope `atomicmarket`) to enumerate the active bonus fees and their rates rather than assuming the maker/taker/collection layers are the whole deduction.

Source: `src/atomicmarket.cpp:203-334` (`addbonusfee`, `addafeectr`, `stopbonusfee`, `delbonusfee`), `include/atomicmarket.hpp:625-635` (`bonusfees_s`)
