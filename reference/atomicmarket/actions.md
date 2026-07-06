# AtomicMarket actions

Complete action reference for the `atomicmarket` contract, baselined on the V2 source. Every entry cites its declaration in `include/atomicmarket.hpp` and its body in `src/atomicmarket.cpp` (paths relative to the atomicmarket-contract repo). "Changed in V2" notes compare against the V1 source (`contracts/atomicmarket-contract` in the atomichub monorepo).

For marketplace attribution, execution-time collection fees, trace-only royalty logs, bundle retirement mechanics, and defensive guards, see `reference/atomicmarket/v2-changes.md`, `reference/atomicmarket/v2-changes.md`, `reference/atomicmarket/fees-and-royalties.md`, `reference/atomicmarket/marketplaces.md`, and `reference/atomicmarket/ram.md`. This page stays brief on those topics and cross-links instead of repeating them.

Custodial rentals do not appear anywhere in this source tree: neither the V1 baseline nor the V2 source declare any rent-prefixed action or table. A custodial rental feature was explored during V2 development and descoped before shipping; this page can only confirm the feature's absence from both source trees, not the history of the descope itself.

## Admin

All admin actions require the authorization of the contract account itself (`require_auth(get_self())`).

### init

No parameters.

Creates the `config` singleton with its defaults if it does not already exist, and seeds the default (empty-name) marketplace with `DEFAULT_MARKETPLACE_CREATOR` (`fees.atomic`) as its creator if that row does not already exist. Run once per deployment.

Source: include/atomicmarket.hpp:66, src/atomicmarket.cpp:8-20

### convcounters

No parameters.

Migrates the deprecated `sale_counter` and `auction_counter` fields on the `config` singleton into the `counters` table (creating `sale` and `auction` counter rows) and zeroes the singleton fields. Only relevant when upgrading a pre-1.2.0 deployment; asserts unless both counters are still non-zero.

Source: include/atomicmarket.hpp:68, src/atomicmarket.cpp:32-56

### setminbidinc

- `minimum_bid_increase: double`: must be greater than 0.

Sets the minimum relative increase a new auction bid must exceed the current bid by.

Source: include/atomicmarket.hpp:70-72, src/atomicmarket.cpp:64-72

### setversion

- `new_version: string`

Sets the `version` field of the `config` singleton.

Source: include/atomicmarket.hpp:74-76, src/atomicmarket.cpp:80-89

### addconftoken

- `token_contract: name`
- `token_symbol: symbol`

Adds a token to `config.supported_tokens`. Rejects a symbol that is already supported.

Source: include/atomicmarket.hpp:78-81, src/atomicmarket.cpp:97-112

### adddelphi

- `delphi_pair_name: name`
- `invert_delphi_pair: bool`
- `listing_symbol: symbol`
- `settlement_symbol: symbol`

Adds a listing/settlement symbol pair backed by a Delphi Oracle price feed, used for stable-priced listings (see `calc_settlement_price`, src/atomicmarket.cpp:2468-2515). Validates the pair exists in the configured `delphioracle` contract, that listing and settlement precisions match the oracle's quote/base precisions (accounting for `invert_delphi_pair`), that the pair is not already registered, and that the settlement symbol is a supported token.

Source: include/atomicmarket.hpp:83-88, src/atomicmarket.cpp:120-166

### setmarketfee

- `maker_market_fee: double`
- `taker_market_fee: double`

Sets the global maker and taker cut of every settlement. Both fees must be non-negative, and their sum plus the 15% AtomicAssets maximum collection fee must not exceed the sale price: a config-time bound that turns a misconfiguration into an upfront error instead of a settlement that reverts later.

Source: include/atomicmarket.hpp:90-93, src/atomicmarket.cpp:174-194

### addbonusfee

- `fee_recipient: name`: must be an existing account.
- `fee: double`: must be positive; combined with the maker, taker, and 15% maximum collection fee must not exceed the sale price.
- `applicable_counter_names: vector<name>`: at least one required; see the `counters` table in `reference/atomicmarket/tables.md` for the counter names a bonus fee can attach to.
- `fee_name: string`

Creates a new bonus fee that applies going forward to settlements whose relevant counter (sale, auction, buyoffer, or template buyoffer id) falls at or above the counter's current value at creation time for each listed counter name. Multiple bonus fees can still stack past 100% on a single payout; `internal_payout_sale` enforces a hard backstop that the seller's remainder stays positive.

Source: include/atomicmarket.hpp:95-100, src/atomicmarket.cpp:203-248

### addafeectr

- `bonusfee_id: uint64_t`
- `counter_name_to_add: name`

Adds another applicable counter name to an existing, not-yet-stopped bonus fee, starting from that counter's current value.

Source: include/atomicmarket.hpp:102-105, src/atomicmarket.cpp:257-296

### stopbonusfee

- `bonusfee_id: uint64_t`

Freezes the end of range for every counter name attached to a bonus fee at its current counter value, so the fee no longer applies to listings created afterward while still applying to ones already in range.

Source: include/atomicmarket.hpp:107-109, src/atomicmarket.cpp:304-325

### delbonusfee

- `bonusfee_id: uint64_t`

Erases a bonus fee row entirely. Because `internal_payout_sale` reads the bonus fee table live at settlement time, this also stops the fee from applying to already-created listings that have not settled yet, unlike `stopbonusfee`, which only affects future listings.

Source: include/atomicmarket.hpp:111-113, src/atomicmarket.cpp:334-344

### setdefmktcr

- `new_creator: name`: must be an existing account.

Redirects the fee recipient of the default (empty-name) marketplace. Exists so the same chain-agnostic binary can point the default marketplace at a real account on chains where `fees.atomic` does not exist.

Source: include/atomicmarket.hpp:122-124, src/atomicmarket.cpp:402-414

### migratebal

- `from: name`
- `to: name`: must be an existing account, must differ from `from`.

Moves every balance row quantity from one account to another, merging per symbol, and erases the source row. Used together with `setdefmktcr` to relocate balances already accrued under the old default-marketplace creator.

Source: include/atomicmarket.hpp:127-130, src/atomicmarket.cpp:426-464

## Marketplaces

### regmarket

- `creator: name`: required authorization.
- `marketplace_name: name`

Registers a marketplace name usable in `maker_marketplace`/`taker_marketplace` parameters. Existing-account names require that account's authorization. Names with a suffix (`x.y`) require the suffix account's authorization. A plain 12-character name needs no special authorization beyond the creator's. Registration exists so the contract is not paying RAM, on an attacker's behalf, for balance rows keyed to made-up marketplace names. See `reference/atomicmarket/marketplaces.md` for the full attribution model.

Source: include/atomicmarket.hpp:116-119, src/atomicmarket.cpp:359-388

## Balances

### withdraw

- `owner: name`: required authorization.
- `token_to_withdraw: asset`

Transfers `token_to_withdraw` out of the caller's internal balance and out of the contract, back to `owner`, via a real inline token transfer. Throws if the balance is insufficient.

Source: include/atomicmarket.hpp:133-136, src/atomicmarket.cpp:472-481

### Deposit (via token transfer, not a direct action)

`[[eosio::on_notify("*::transfer")]] receive_token_transfer(from, to, quantity, memo)` fires on every inbound token transfer notification from any contract. If `to` is not this contract it is ignored. Otherwise it requires `quantity`'s symbol and token contract to be a supported pair (`config.supported_tokens`) and the memo to be exactly `"deposit"`; any other memo throws. On a valid deposit it credits `from`'s internal balance table row.

There is no separate "deposit" action; depositing means sending a transfer to the contract with memo `"deposit"`.

Source: include/atomicmarket.hpp:349-354, src/atomicmarket.cpp:1870-1882

## Royalty split configuration (V2 only)

New in V2; V1 has no royalty split tables or actions and pays the full collection fee to the collection author. See `reference/atomicmarket/fees-and-royalties.md` for the full split engine (category renormalization, attribute matching precedence, dust reconciliation) and `reference/atomicmarket/v2-changes.md` for the V1-to-V2 comparison.

All six actions in this group require the collection author's authorization specifically (`require_auth(author)`, read from a partial deserialization of the AtomicAssets `collections` row). Authorized accounts of the collection are deliberately rejected, because these configs control where settlement funds are paid out.

### setroyalconf

- `collection_name: name`
- `founders: vector<{recipient: name, weight: uint32_t}>`
- `attribute_mode: uint8_t`: 0 (merged) or 1 (granular per attribute source).
- `split_founders: uint32_t`
- `split_templates: uint32_t`
- `split_attributes: uint32_t`

Creates or updates a collection's royalty split config. At least one split weight must be positive. `founders` must be non-empty (validated: 1-64 entries, no duplicate recipients, all existing accounts, all positive weights) whenever `split_founders > 0`, and must be empty otherwise. `attribute_mode` cannot be changed while any attribute royalty rule exists for the collection: merged-mode rules (source 0) and granular-mode rules (sources 1-4) hash into disjoint lookup spaces, so flipping the mode would silently orphan existing rules.

Source: include/atomicmarket.hpp:148-155, src/atomicmarket.cpp:495-545

### delroyalconf

- `collection_name: name`

Deletes a collection's royalty split config, reverting the collection fee to pay the author in full. All template royalties and attribute royalty rules for the collection must already be deleted.

Source: include/atomicmarket.hpp:157-159, src/atomicmarket.cpp:558-576

### settemplroy

- `collection_name: name`
- `template_id: int32_t`: must be non-negative and must reference an existing template in the collection.
- `recipients: vector<{recipient: name, weight: uint32_t}>`: validated the same way as `founders`.

Creates or updates the royalty recipients for one template. Requires a royalty split config to already exist for the collection.

Source: include/atomicmarket.hpp:161-165, src/atomicmarket.cpp:585-618

### deltemplroy

- `collection_name: name`
- `template_id: int32_t`

Deletes a template's royalty recipients.

Source: include/atomicmarket.hpp:167-170, src/atomicmarket.cpp:627-638

### setattrroy

- `collection_name: name`
- `source: uint8_t`: must be 0 if the collection's `attribute_mode` is merged; must be 1-4 (asset immutable, asset mutable, template immutable, template mutable) if granular.
- `field: string`: 1-64 characters.
- `value: ATOMIC_ATTRIBUTE`: the attribute value the rule matches. Float and double-typed values are rejected as match keys, as are vector-typed values (`value.index() <= 10`, meaning only the scalar and string alternatives are allowed). The value's serialized type is part of the lookup key, so a `uint32_t` and an `int32_t` holding the same number are different rules.
- `rule_weight: uint32_t`: must be positive.
- `recipients: vector<{recipient: name, weight: uint32_t}>`

Creates a rule matching assets whose resolved attribute at `(source, field)` equals `value`, or updates the existing rule for that exact triple if one exists. New rule ids come from a persistent `attrroyalty` counter rather than the table's `available_primary_key()`, specifically so that deleting the highest-numbered rule can never let a later rule reuse its id: reused ids would corrupt the rule history that indexers reconstruct from `logroyattr` traces.

Source: include/atomicmarket.hpp:172-179, src/atomicmarket.cpp:652-714

### delattrroy

- `collection_name: name`
- `rule_id: uint64_t`

Deletes one attribute royalty rule by its id.

Source: include/atomicmarket.hpp:181-184, src/atomicmarket.cpp:723-734

## Sales

Instant-sale listings settle through a lazy-accept AtomicAssets offer; see `reference/atomicmarket/v2-changes.md` for why overlapping listings of the same asset are valid chain state.

### announcesale

- `seller: name`: required authorization.
- `asset_ids: vector<uint64_t>`: must contain exactly one id.
- `listing_price: asset`
- `settlement_symbol: symbol`
- `maker_marketplace: name`: must be a registered marketplace.

Creates a `sales` row. No assets or tokens move yet; the seller still has to create a matching AtomicAssets offer (memo `"sale"`) to activate it. Rejects a second announcement by the same seller for the identical asset id set (via the `assetidshash` secondary index). Reads and stores the collection's fee at announcement time purely for the `lognewsale` informational log; the fee actually applied at settlement is read fresh (see `reference/atomicmarket/v2-changes.md`). Emits `lognewsale`.

Changed in V2: `asset_ids.size() == 1` is enforced here; V1 allowed multi-asset bundle listings.

Source: include/atomicmarket.hpp:187-193, src/atomicmarket.cpp:744-827

### cancelsale

- `sale_id: uint64_t`

Erases a sale row. If the sale is invalid (its AtomicAssets offer was cancelled, the seller no longer owns one of the listed assets, or, for a legacy row, it lists more than one asset), anyone can cancel it without the seller's authorization; otherwise the seller's authorization is required. Also declines the backing AtomicAssets offer if one exists and is still active.

Source: include/atomicmarket.hpp:195-197, src/atomicmarket.cpp:838-885

### purchasesale

- `buyer: name`: required authorization.
- `sale_id: uint64_t`
- `intended_delphi_median: uint64_t`: must be 0 unless the sale uses a Delphi-priced settlement symbol.
- `taker_marketplace: name`: must be a registered marketplace.

For a legacy multi-asset sale row (`asset_ids.size() > 1`), this call cancels the listing instead of purchasing it and charges the buyer nothing. For a normal single-asset sale: asserts the buyer is not the seller, the sale has an active backing offer, and the taker marketplace is registered; computes the settlement price (resolving the Delphi median if applicable); decreases the buyer's internal balance by that price; runs the full payout split (see `internal_payout_sale`, cross-linked below); accepts the AtomicAssets offer and transfers the assets to the buyer; erases the sale row.

Token/asset movement: buyer's internal balance -> maker/taker marketplace balances, collection royalty split balances, bonus fee balances, and the seller's balance (immediately withdrawn to a real token transfer to the seller). NFT: AtomicAssets offer accepted, asset moves seller -> buyer.

Source: include/atomicmarket.hpp:199-204, src/atomicmarket.cpp:896-981

### assertsale

- `sale_id: uint64_t`
- `asset_ids_to_assert: vector<uint64_t>`
- `listing_price_to_assert: asset`
- `settlement_symbol_to_assert: symbol`

No authorization required. Pure validation, meant to run in the same transaction immediately before `purchasesale` so a buyer's expectations about a sale's contents can't be front-run. Throws if any of the asserted values differ from the stored sale row. Asset id comparison uses the 4-iterator `std::is_permutation` overload deliberately (see `reference/atomicmarket/v2-changes.md` ("Defensive guards in the V2 contract") for why the 3-iterator overload is unsafe here).

Source: include/atomicmarket.hpp:206-211, src/atomicmarket.cpp:993-1015

## Auctions

### announceauct

- `seller: name`: required authorization.
- `asset_ids: vector<uint64_t>`: must contain exactly one id.
- `starting_bid: asset`: amount must be greater than zero; symbol must be supported.
- `duration: uint32_t`: seconds; must be within `config.minimum_auction_duration`/`maximum_auction_duration` (120s to 30 days by default).
- `maker_marketplace: name`: must be a registered marketplace.

Creates an `auctions` row with `assets_transferred = false`. The seller still has to send an AtomicAssets `transfer` with memo `"auction"` to activate it (see the notification handler below). Rejects a second announcement by the same seller for the identical asset id set. Emits `lognewauct`.

Changed in V2: `asset_ids.size() == 1` is enforced here; V1 allowed multi-asset bundle auctions.

Source: include/atomicmarket.hpp:214-220, src/atomicmarket.cpp:1027-1113

### Auction activation (via asset transfer, not a direct action)

`[[eosio::on_notify("atomicassets::transfer")]] receive_asset_transfer(from, to, asset_ids, memo)` fires on inbound AtomicAssets transfers. With memo `"auction"` and a single asset id, it locates a non-finished auction announced by `from` for that exact asset id set, sets `assets_transferred = true`, and emits `logauctstart`. A multi-asset transfer against memo `"auction"` throws: only legacy bundle auction rows can have more than one asset id, and those can no longer be activated this way.

Source: include/atomicmarket.hpp:333-338, src/atomicmarket.cpp:1889-1943

### cancelauct

- `auction_id: uint64_t`

Erases an auction row. An auction with no bids and where the seller no longer owns a listed asset can be cancelled by anyone; otherwise the seller's authorization is required, and an auction with a live bid can never be cancelled through this action (only a legacy multi-asset auction with a bid can be dissolved this way, and only while unclaimed by both sides). If assets were already transferred into custody, they are returned to the seller, and any current bidder is refunded to their internal balance.

Source: include/atomicmarket.hpp:222-224, src/atomicmarket.cpp:1125-1173

### auctionbid

- `bidder: name`: required authorization.
- `auction_id: uint64_t`
- `bid: asset`: must match the auction's current bid symbol.
- `taker_marketplace: name`: must be a registered marketplace.

For a legacy multi-asset auction (`asset_ids.size() > 1`), this call dissolves the auction instead of bidding: refunds the current bidder if any, returns custodied assets to the seller, erases the row. For a normal single-asset auction: asserts the bidder is not the seller, the auction is active and not yet ended, and the bid meets the minimum (the starting bid if there is no current bidder, or the current bid times `1 + minimum_bid_increase` otherwise). Decreases the bidder's internal balance by `bid` and refunds the previous bidder's balance with the previous bid. Extends `end_time` by `auction_reset_duration` if the bid arrives close to the end (anti-sniping).

Token movement: internal balance only; no real token transfer happens on a bid.

Source: include/atomicmarket.hpp:226-231, src/atomicmarket.cpp:1183-1265

### auctclaimbuy

- `auction_id: uint64_t`. Required authorization: the auction's current (highest) bidder.

Claims the asset side of a finished auction for the winning bidder. Requires the auction to be active, finished (`end_time` passed), have a bidder, and not already claimed by the buyer. For a legacy multi-asset auction unclaimed by the seller, this dissolves the auction instead (refunds the bid, returns assets to the seller). Otherwise transfers the assets to the winning bidder and marks `claimed_by_buyer`, erasing the row once both sides have claimed.

Source: include/atomicmarket.hpp:233-235, src/atomicmarket.cpp:1273-1322

### auctclaimsel

- `auction_id: uint64_t`. Required authorization: the auction's seller.

Claims the bid side of a finished auction for the seller. Requires the auction to be active, finished, have a bidder, and not already claimed by the seller. For a legacy multi-asset auction unclaimed by the buyer, this dissolves the auction instead. Otherwise runs the same payout split as `purchasesale` on the winning bid amount, sourcing asset ownership data from either the contract itself or the winning bidder depending on whether the buyer has already claimed. Marks `claimed_by_seller`, erasing the row once both sides have claimed.

Source: include/atomicmarket.hpp:237-239, src/atomicmarket.cpp:1332-1392

### assertauct

- `auction_id: uint64_t`
- `asset_ids_to_assert: vector<uint64_t>`

No authorization required. Validates the asserted asset ids match the auction row, meant to run immediately before `auctionbid` in the same transaction.

Source: include/atomicmarket.hpp:241-244, src/atomicmarket.cpp:1404-1415

## Buyoffers

A buyoffer is a standing offer to buy specific assets from a specific recipient, escrowed from the buyer's internal balance at creation.

### createbuyo

- `buyer: name`: required authorization.
- `recipient: name`: must differ from `buyer`.
- `price: asset`: amount must be greater than zero; symbol must be supported.
- `asset_ids: vector<uint64_t>`: must contain exactly one id, owned by `recipient`.
- `memo: string`: up to 256 characters.
- `maker_marketplace: name`: must be a registered marketplace.

Decreases the buyer's internal balance by `price` immediately (escrow) and creates a `buyoffers` row. Emits `lognewbuyo`.

Changed in V2: `asset_ids.size() == 1` is enforced here; V1 allowed multi-asset bundle buyoffers.

Source: include/atomicmarket.hpp:247-254, src/atomicmarket.cpp:1425-1491

### cancelbuyo

- `buyoffer_id: uint64_t`. Required authorization: the buyoffer's buyer.

Refunds the escrowed price to the buyer's internal balance and erases the row.

Source: include/atomicmarket.hpp:256-258, src/atomicmarket.cpp:1501-1513

### acceptbuyo

- `buyoffer_id: uint64_t`
- `expected_asset_ids: vector<uint64_t>`: must match the buyoffer's stored asset ids (permutation-safe comparison).
- `expected_price: asset`: must match the buyoffer's stored price.
- `taker_marketplace: name`: must be a registered marketplace. Required authorization: the buyoffer's recipient.

For a legacy multi-asset buyoffer, this cancels the buyoffer and refunds the buyer instead of trading (identical outcome to `declinebuyo`). For a normal single-asset buyoffer: requires the most recently created AtomicAssets offer to be exactly `recipient -> atomicmarket`, offering only the buyoffer's asset, asking for nothing, with memo `"buyoffer"`. Accepts that offer, transfers the asset to the buyer, and runs the payout split on the escrowed price, crediting/withdrawing to the recipient (the erstwhile seller).

Token/asset movement: escrowed buyer balance -> maker/taker/collection royalty/bonus fee balances and the recipient's withdrawn balance. NFT: recipient -> buyer via the accepted AtomicAssets offer.

Source: include/atomicmarket.hpp:260-265, src/atomicmarket.cpp:1533-1626

### declinebuyo

- `buyoffer_id: uint64_t`
- `decline_memo: string`: up to 256 characters. Required authorization: the buyoffer's recipient.

Refunds the escrowed price to the buyer's internal balance and erases the row.

Source: include/atomicmarket.hpp:267-270, src/atomicmarket.cpp:1634-1649

## Template buyoffers

A template buyoffer is a standing offer to buy any asset minted from a given template, fulfillable by any owner of a matching asset.

### createtbuyo

- `buyer: name`: required authorization.
- `price: asset`: amount must be greater than zero; symbol must be supported.
- `collection_name: name`
- `template_id: uint64_t`: must exist in `collection_name`.
- `maker_marketplace: name`: must be a registered marketplace.

Decreases the buyer's internal balance by `price` immediately and creates a `tbuyoffers` row. Emits `lognewtbuyo`.

Source: include/atomicmarket.hpp:281-287, src/atomicmarket.cpp:1651-1701

### canceltbuyo

- `buyoffer_id: uint64_t`. Required authorization: the buyoffer's buyer.

Refunds the escrowed price and erases the row.

Source: include/atomicmarket.hpp:294-296, src/atomicmarket.cpp:1703-1715

### fulfilltbuyo

- `seller: name`: required authorization.
- `buyoffer_id: uint64_t`
- `asset_id: uint64_t`: must be owned by `seller` and minted from the buyoffer's template.
- `expected_price: asset`: must match the buyoffer's stored price.
- `taker_marketplace: name`: must be a registered marketplace.

Requires the most recently created AtomicAssets offer to be exactly `seller -> atomicmarket`, offering only `asset_id`, asking for nothing, with memo `"tbuyoffer"`. Accepts that offer, transfers the asset to the buyer, and runs the payout split on the escrowed price, crediting/withdrawing to `seller`. Erases the row.

Token/asset movement: escrowed buyer balance -> maker/taker/collection royalty/bonus fee balances and the seller's withdrawn balance. NFT: seller -> buyer via the accepted AtomicAssets offer.

Source: include/atomicmarket.hpp:308-314, src/atomicmarket.cpp:1717-1794

## RAM

Each of these three actions re-homes the RAM payer of an existing row to `payer` by erasing and re-emplacing it under the new payer, with no other field changes and no token movement. See `reference/atomicmarket/ram.md` for who pays RAM by default and the sizing implications for a high-volume marketplace.

### paysaleram

- `payer: name`: required authorization.
- `sale_id: uint64_t`

Source: include/atomicmarket.hpp:317-320, src/atomicmarket.cpp:1800-1817

### payauctram

- `payer: name`: required authorization.
- `auction_id: uint64_t`

Source: include/atomicmarket.hpp:322-325, src/atomicmarket.cpp:1823-1840

### paybuyoram

- `payer: name`: required authorization.
- `buyoffer_id: uint64_t`

Source: include/atomicmarket.hpp:327-330, src/atomicmarket.cpp:1846-1863

Note: there is no `paytbuyoram`. The `tbuyoffers` table has no equivalent RAM-repayment action in this source.

## Offer notification handler

`[[eosio::on_notify("atomicassets::lognewoffer")]] receive_asset_offer(offer_id, sender, recipient, sender_asset_ids, recipient_asset_ids, memo)` fires when AtomicAssets logs a newly created offer to this contract. With memo `"sale"`: asserts the offer asks for nothing back and offers exactly one asset, locates the matching pending sale by `sender` and asset id hash, links the offer's id onto that `sales` row (`offer_id`), and emits `logsalestart`. With memo `"buyoffer"` or `"tbuyoffer"`, it does nothing: those flows are handled entirely inside `acceptbuyo`/`fulfilltbuyo` by reading the latest AtomicAssets offer directly. A multi-asset sale offer throws: only legacy bundle sale rows could ever match one, and those can no longer be activated.

Source: include/atomicmarket.hpp:340-347, src/atomicmarket.cpp:1950-2013

## Event logs (indexer hooks)

These actions carry no state change beyond `require_auth(get_self())` (and, for `lognewsale`/`lognewauct`, a `require_recipient` to the seller). They exist purely so notification-driven indexers can observe listing creation and activation as inline action traces. All are dispatched by the contract itself, never called directly by users.

- `lognewsale(sale_id, seller, asset_ids, listing_price, settlement_symbol, maker_marketplace, collection_name, collection_fee)`: sent from `announcesale`. Notifies `seller`. Source: include/atomicmarket.hpp:356-365, src/atomicmarket.cpp:2016-2029
- `lognewauct(auction_id, seller, asset_ids, starting_bid, duration, end_time, maker_marketplace, collection_name, collection_fee)`: sent from `announceauct`. Notifies `seller`. Source: include/atomicmarket.hpp:367-377, src/atomicmarket.cpp:2031-2045
- `lognewbuyo(buyoffer_id, buyer, recipient, price, asset_ids, memo, maker_marketplace, collection_name, collection_fee)`: sent from `createbuyo`. No `require_recipient`. Source: include/atomicmarket.hpp:379-389, src/atomicmarket.cpp:2047-2059
- `lognewtbuyo(buyoffer_id, buyer, price, template_id, maker_marketplace, collection_name, collection_fee)`: sent from `createtbuyo`. Source: include/atomicmarket.hpp:391-399, src/atomicmarket.cpp:2061-2066
- `logsalestart(sale_id, offer_id)`: sent from `receive_asset_offer` once a sale's backing offer is linked. Source: include/atomicmarket.hpp:401-404, src/atomicmarket.cpp:2068-2073
- `logauctstart(auction_id)`: sent from `receive_asset_transfer` once an auction's assets are transferred into custody. Source: include/atomicmarket.hpp:406-408, src/atomicmarket.cpp:2075-2079

The `collection_fee` carried on these logs (and stored on the corresponding table row) is the fee read at listing time for informational/indexing purposes only. It is not necessarily the fee actually applied at settlement. See `reference/atomicmarket/fees-and-royalties.md`.

## Royalty distribution logs (V2 only)

New in V2. Sent inline from `distribute_collection_fee` (src/atomicmarket.cpp:2689-2986) during every settlement (`purchasesale`, `auctclaimsel`, `acceptbuyo`, `fulfilltbuyo`) that distributes a collection fee through a royalty split config. Like the event logs above, they carry no state change beyond `require_auth(get_self())`, deliberately with no `require_recipient` to any payout recipient, since notifying an arbitrary recipient contract would let it assert in its own notification handler and block the collection's settlements entirely. See `reference/atomicmarket/fees-and-royalties.md` for why this makes them trace-only for indexers and why the payout amounts always reconcile to the collection fee.

### logroyfound

- `collection_name: name`
- `asset_id: uint64_t`
- `payouts: vector<{recipient: name, amount: asset}>`

Sent once per settled asset when the founders category has a non-empty payout.

Source: include/atomicmarket.hpp:421-425, src/atomicmarket.cpp:2085-2091

### logroytempl

- `collection_name: name`
- `asset_id: uint64_t`
- `template_id: int32_t`
- `payouts: vector<{recipient: name, amount: asset}>`

Sent once per settled asset when the template category has a non-empty payout.

Source: include/atomicmarket.hpp:427-432, src/atomicmarket.cpp:2093-2100

### logroyattr

- `collection_name: name`
- `asset_id: uint64_t`
- `rule_id: uint64_t`
- `payouts: vector<{recipient: name, amount: asset}>`

Sent once per matched attribute rule with a non-empty payout. An asset matching several rules produces several `logroyattr` actions.

Source: include/atomicmarket.hpp:434-439, src/atomicmarket.cpp:2102-2109

### logroydust

- `collection_name: name`
- `collection_author: name`
- `amount: asset`

Sent once per settlement (only if non-zero) reporting the amount that fell through to the collection author: integer-rounding dust from every category split, plus the share of any asset for which no category had payees. The amounts across `logroyfound` + `logroytempl` + `logroyattr` + `logroydust` for a settlement always sum to exactly the collection fee charged.

Source: include/atomicmarket.hpp:441-445, src/atomicmarket.cpp:2111-2117
