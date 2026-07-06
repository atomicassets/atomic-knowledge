# AtomicMarket marketplaces

How a frontend or dapp registers as a marketplace on the shared `atomicmarket` contract, how maker and taker marketplace attribution flows through the sale, auction, and buyoffer actions, and how the fees a marketplace earns reach its account.

## Registering a marketplace with regmarket

`regmarket(creator, marketplace_name)` requires `creator`'s authorization and rejects a name already registered by anyone. The naming rule branches on what `marketplace_name` looks like: if it is the name of an existing account, that account's own authorization is required (not just the caller's); if it is not an existing account but has an account-name suffix (an EOSIO-style dotted name, e.g. `foo.bar`), the suffix owner's authorization is required instead; otherwise, for a fresh, suffix-free name, it must be exactly 12 characters, the only case that needs no special authorization beyond the caller's own. This lets an account register a marketplace matching its own name freely, lets a suffix owner mint namespaced marketplace names under its suffix, and otherwise forces marketplace names into the same 12-character space as EOSIO account names so an unregistered name can never later collide with a real account. `creator` pays the RAM for the new `marketplaces` row.

Source: `src/atomicmarket.cpp:359-388` (`regmarket`), `include/atomicmarket.hpp:605-612` (`marketplaces_s`)

## The default marketplace and redirecting its fee recipient

`init()` seeds a `marketplaces` row for the empty-string name (`name("")`) with `creator` set to the constant `DEFAULT_MARKETPLACE_CREATOR` (`fees.atomic`). Any action that carries a maker or taker marketplace parameter accepts the empty name, which is what a caller passes when it has no marketplace of its own to attribute the listing to; those fees then accrue to the default marketplace's creator. On a chain where `fees.atomic` does not exist (the contract binary is chain-agnostic), `setdefmktcr` lets the contract's own authority repoint the default marketplace to a real account, and `migratebal` moves any balance already accrued under the old creator to the new one, merging quantities per token symbol and erasing the source row.

Source: `src/atomicmarket.cpp:8-20` (`init` seeding the default marketplace), `src/atomicmarket.cpp:402-464` (`setdefmktcr`, `migratebal`)

## Only a registered marketplace name is accepted as an attribution parameter

Every action that takes a `maker_marketplace` or `taker_marketplace` parameter checks it against the `marketplaces` table via `is_valid_marketplace` before accepting the listing or trade; an unregistered name is rejected outright. There is no way to attribute a sale, auction, or buyoffer to a marketplace that has not called `regmarket` (or is not the seeded empty-string default).

Source: `src/atomicmarket.cpp:2453-2456` (`is_valid_marketplace`), `src/atomicmarket.cpp:791` and `:937` (`announcesale`/`purchasesale` validity checks, representative of the same check in every listing/settlement action)

## Maker and taker attribution across the listing and settlement actions

A maker marketplace is supplied by the party creating a listing and stored on the row at creation; a taker marketplace is supplied by the counterparty at settlement and is never stored on a row that persists past settlement (a `purchasesale` erases the `sales` row it settles, so a completed sale's taker marketplace lives only in the `lognewsale`/settlement trace, never in table state). Concretely: `announcesale` takes `maker_marketplace`, `purchasesale` takes `taker_marketplace`; `announceauct` takes `maker_marketplace`, `auctionbid` takes `taker_marketplace` (and, unlike a sale, an `auctions` row keeps `taker_marketplace`, set from the winning bidder, until the auction is claimed or cancelled); `createbuyo` takes `maker_marketplace`, `acceptbuyo` takes `taker_marketplace`; and the template-buyoffer pair `createtbuyo`/`fulfilltbuyo` follows the same maker/taker split. A marketplace only ever supplies one side of a trade per action; there is no action where the same call carries both a maker and a taker marketplace.

Source: `src/atomicmarket.cpp:744-750` (`announcesale`), `src/atomicmarket.cpp:896-901` (`purchasesale`), `src/atomicmarket.cpp:1027-1033` (`announceauct`), `src/atomicmarket.cpp:1183-1190` (`auctionbid` signature), `src/atomicmarket.cpp:1425-1432` (`createbuyo`), `src/atomicmarket.cpp:1533-1538` (`acceptbuyo`), `include/atomicmarket.hpp:281-314` (`createtbuyo`/`fulfilltbuyo` declarations)

## Marketplace fees collect into the balances table, not a direct transfer

Neither the maker nor the taker marketplace fee is pushed to the marketplace's creator as an inline token transfer. Both cuts are computed against the settlement quantity using the config's `maker_market_fee`/`taker_market_fee` rates and credited via `internal_add_balance` to the registered marketplace's `creator` account (looked up from the `marketplaces` table by the marketplace name stored on or passed into the settlement). The creator only receives the tokens once it calls `withdraw` itself; until then the accrued amount sits in that account's `balances` row. See `reference/atomicmarket/ram.md` for who pays the RAM for that row and what happens to it as balances are withdrawn.

Source: `src/atomicmarket.cpp:2577-2591` (maker/taker cut computation and crediting inside `internal_payout_sale`), `src/atomicmarket.cpp:472-481` (`withdraw`)
