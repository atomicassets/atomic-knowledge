# AtomicMarket RAM

Who pays the RAM for each `atomicmarket` table row, the voluntary `pay*ram` actions that let a third party take over that cost, and the sizing implications for a high-volume marketplace or dapp.

## The contract pays RAM for every balances row

`internal_add_balance`, the only function that creates or grows a `balances` row, always uses `get_self()` as the RAM payer, never the account the balance belongs to. This is true regardless of why the balance exists: a marketplace's maker/taker fee cut, a royalty recipient's split payout, a token deposit, or a seller's proceeds all land in a `balances` row paid for by the `atomicmarket` contract account itself. There is one row per owner (scope `get_self()`, primary key `owner.value`), holding a `vector<asset>` of per-symbol quantities rather than one row per token type, so a single account accruing balances in several token symbols still only costs one row's worth of base RAM. `internal_decrease_balance` erases the row entirely once its last quantity reaches zero (and merely shrinks the quantities vector if other symbols remain), so a fully-withdrawn balance gives its RAM back rather than leaving an empty row behind.

Source: `src/atomicmarket.cpp:2993-3026` (`internal_add_balance`), `src/atomicmarket.cpp:3034-3070` (`internal_decrease_balance`), `include/atomicmarket.hpp:519-526` (`balances_s`)

## Sellers and buyers pay RAM for their own listing rows by default

A `sales` row is created with the seller as RAM payer (`announcesale`); an `auctions` row likewise names the seller (`announceauct`); a `buyoffers` row and a `tbuyoffers` (template buyoffer) row both name the buyer (`createbuyo`, `createtbuyo`). This is the opposite allocation from the `balances` table: a listing's creator carries its RAM cost until the listing is settled, cancelled, or (for sales/auctions/buyoffers) handed off via the corresponding `pay*ram` action.

Source: `src/atomicmarket.cpp:799` (`announcesale`), `src/atomicmarket.cpp:1080` (`announceauct`), `src/atomicmarket.cpp:1462` (`createbuyo`), `src/atomicmarket.cpp:1677` (`createtbuyo`)

## Royalty split config rows are paid by the collection author

`setroyalconf`, `settemplroy`, and `setattrroy` all resolve their RAM payer through `require_collection_author`, which also enforces that only the collection's own highest authority (not an authorized secondary account) can call them: the same authority that controls where the collection's royalty payouts go also carries the RAM for defining them. This keeps royalty configuration RAM off the `atomicmarket` contract's own account regardless of how many founders, template rules, or attribute rules a collection registers.

Source: `src/atomicmarket.cpp:2299-2311` (`require_collection_author`), `src/atomicmarket.cpp:495-545` (`setroyalconf`), `src/atomicmarket.cpp:585-618` (`settemplroy`)

## paysaleram, payauctram, and paybuyoram move RAM ownership without touching the trade

`paysaleram(payer, sale_id)`, `payauctram(payer, auction_id)`, and `paybuyoram(payer, buyoffer_id)` each require only `payer`'s own authorization (not the original seller's or buyer's) and work identically: copy the row, erase the original, and re-emplace an identical copy with `payer` as the new RAM payer. None of them touch the listing's price, marketplace attribution, or collection fee; they exist purely so a dapp or bot can sponsor the RAM for a user's listing without that user needing enough of their own RAM to list in the first place, improving onboarding for accounts that hold tokens but little RAM.

Source: `src/atomicmarket.cpp:1800-1863` (`paysaleram`, `payauctram`, `paybuyoram`)

## A seller's settlement payout does not linger in the balances table

`internal_payout_sale` calls `internal_add_balance` to credit the seller's cut and then immediately calls `internal_withdraw_tokens` for that same amount within the same action: the seller's balance is credited and drained in one transaction, so a seller who held no prior balance in that token incurs no persistent `balances` RAM from a settlement. Marketplace creators and royalty recipients are not auto-withdrawn this way: their cuts accrue in `balances` via `internal_add_balance` alone and stay there, contract-paid, until they call `withdraw` themselves.

Source: `src/atomicmarket.cpp:2657-2665` (seller payout followed by auto-withdrawal inside `internal_payout_sale`)

## Practical sizing implications for a high-volume marketplace

Because every `balances` row is paid for by the `atomicmarket` contract account itself, and because that cost is driven by the number of distinct accounts holding an uncollected balance rather than by transaction volume, the contract's own RAM footprint grows with the number of unique marketplace creators, royalty recipients, and depositors who have a nonzero balance at any given time, not with how many sales clear. A marketplace or royalty recipient that withdraws promptly keeps its footprint on the contract to a single small row; one that lets fees accumulate across many token symbols still costs only one row, since quantities merge into the row's vector rather than creating new rows. On the listing side, a dapp expecting high listing volume from RAM-poor accounts should budget for sponsoring `paysaleram`/`payauctram`/`paybuyoram` calls (or `deposit` transfers that leave enough of a margin) rather than assuming every seller or buyer can cover their own `sales`/`auctions`/`buyoffers` row; the amount to budget scales with concurrently open listings per user, since a settled or cancelled listing's row is erased and its RAM returned to whichever account was paying for it at the time.

Source: `src/atomicmarket.cpp:2993-3026` (`internal_add_balance` payer and row-per-owner merge behavior), `src/atomicmarket.cpp:1800-1863` (`pay*ram` actions)
