---
scope: AtomicMarket's internal balances ledger - depositing, what consumes a balance, withdrawing, RAM, and supported tokens
depends-on: [reference/atomicmarket/actions.md, reference/atomicmarket/ram.md]
key-modules: ["atomicmarket-contract (v2.0.0-rc2): src/atomicmarket.cpp", "atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp"]
---

# Balances and deposits

How AtomicMarket's internal token balance system works: depositing, what consumes a deposited balance, withdrawing, RAM, and which tokens are accepted. Baseline is AtomicMarket V2 (`atomicmarket-contract`); the balance mechanics below are unchanged from V1 unless noted.

AtomicMarket never moves tokens directly between wallets during a sale, auction, or buyoffer settlement; every payout is routed through the internal `balances` ledger first. But the payout is not uniform. The seller's settlement cut (and, for a buyoffer, the recipient's cut) is credited to their balance and then immediately auto-withdrawn to their wallet in the same settlement, via `internal_withdraw_tokens` on the shared `internal_payout_sale` path that `purchasesale`, auction claim, `acceptbuyo`, and `fulfilltbuyo` all reach. Everything else stays parked in `balances` pending a manual `withdraw`: marketplace (maker and taker) fees, the collection fee, royalty splits, and bonus fees are each credited to their recipient's row and sit there until that recipient withdraws.

## Depositing tokens

A deposit is a normal token transfer to the `atomicmarket` account with the memo `deposit`, exactly. `receive_token_transfer` (the `*::transfer` notification handler) checks the memo case-sensitively and rejects anything else with `"invalid memo"`. No other memo is treated as a deposit, and there is no separate `deposit` action to call. It also validates the incoming token against the config's supported-token list by both the sending contract and the symbol together (see "Supported tokens" below); a token with a matching symbol from an unrecognized contract is rejected even if another supported contract issues that same symbol.

The first deposit for an owner and symbol creates the `balances` row; a later deposit of the same symbol increments the existing entry in place; a deposit of a different (already-supported) symbol appends a new entry to that owner's `quantities` vector.

```json
{
  "from": "buyeraccount",
  "to": "atomicmarket",
  "quantity": "10.00000000 WAX",
  "memo": "deposit"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "eosio.token",
      name: "transfer",
      authorization: [session.permissionLevel],
      data: {
        from: "buyeraccount",
        to: "atomicmarket",
        quantity: "10.00000000 WAX",
        memo: "deposit",
      },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:1870-1882` (`receive_token_transfer`), `atomicmarket-contract include/atomicmarket.hpp:349-354`, `atomicmarket-contract src/atomicmarket.cpp:2993-3026` (`internal_add_balance`)

## What consumes deposited balance

These actions deduct from the caller's deposited balance rather than accepting a token transfer inline, because the balance must already be escrowed before the contract can commit to a trade:

- **`createbuyo`** / **`createtbuyo`**: the offered `price` is deducted from the buyer's balance at creation time, before any counterparty has acted. See `guides/buyoffers.md`.
- **`auctionbid`**: the `bid` amount is deducted from the bidder's balance when the bid is placed. If the bid outbids an existing bidder, that bidder's previous bid is credited back to their balance (not transferred to their wallet); they must `withdraw` it themselves.
- **`purchasesale`**: the settlement price (which can differ from the listed price for stable-priced sales, via `calc_settlement_price`) is deducted from the buyer's balance at purchase time.

Declining, cancelling, or being outbid always credits the balance back rather than transferring tokens out. Every one of these paths goes through the same `internal_add_balance` / `internal_decrease_balance` pair that deposits and withdrawals use.

Source: `atomicmarket-contract src/atomicmarket.cpp:947-950` (`purchasesale` balance deduction), `atomicmarket-contract src/atomicmarket.cpp:1242-1252` (`auctionbid` refund and deduction), `atomicmarket-contract src/atomicmarket.cpp:1450` (`createbuyo` deduction), `atomicmarket-contract src/atomicmarket.cpp:1667` (`createtbuyo` deduction)

## Withdrawing tokens

`withdraw(owner, token_to_withdraw)` requires the owner's authorization. It deducts from the `balances` row (erasing the row if that was the only remaining entry, otherwise removing just that symbol's entry or reducing its amount) and sends a `transfer` from `atomicmarket` back to the owner for the withdrawn quantity, with the memo `"AtomicMarket Withdrawal"`. The paying token contract is resolved purely from the withdrawal symbol via the supported-tokens list. This is safe because `addconftoken` refuses to register a second contract for a symbol that's already supported, so the symbol-to-contract mapping is always unambiguous.

```json
{
  "owner": "buyeraccount",
  "token_to_withdraw": "10.00000000 WAX"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "withdraw",
      authorization: [session.permissionLevel],
      data: {
        owner: "buyeraccount",
        token_to_withdraw: "10.00000000 WAX",
      },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:472-481` (`withdraw`), `atomicmarket-contract include/atomicmarket.hpp:133-136`, `atomicmarket-contract src/atomicmarket.cpp:2522-2545` (`internal_withdraw_tokens`), `atomicmarket-contract src/atomicmarket.cpp:3034-3070` (`internal_decrease_balance`), `atomicmarket-contract src/atomicmarket.cpp:2359-2372` (`require_get_supported_token_contract`)

## RAM for balance rows

Opening a new `balances` row always pays RAM from the `atomicmarket` contract account itself, so depositing for the first time costs the depositor no RAM, and the contract's own stake grows with the number of distinct depositors it has held a balance for. See `reference/atomicmarket/ram.md` ("The contract pays RAM for every balances row") for the full payer mechanics.

Source: `atomicmarket-contract src/atomicmarket.cpp:2993-3026` (`internal_add_balance`), `atomicmarket-contract include/atomicmarket.hpp:519-526` (`balances_s` table and typedef)

## Supported tokens

There is no separate `tokenconfigs` table. Supported tokens live as a `vector<TOKEN>` field (`supported_tokens`, each entry a `{token_contract, token_symbol}` pair) inside the `config` singleton, scoped to the contract itself. A live read against WAX mainnet confirms the shape (production is currently on AtomicMarket V1; this part of `config` is unchanged in V2):

```json
{
  "version": "1.3.3",
  "supported_tokens": [
    { "token_contract": "eosio.token", "token_symbol": "8,WAX" }
  ]
}
```

`addconftoken(token_contract, token_symbol)` requires the **contract's own** authorization (`require_auth(get_self())`), not a marketplace's and not a collection author's, and rejects adding a second entry for a symbol that's already supported, which is what keeps `require_get_supported_token_contract`'s symbol-only lookup (used by `withdraw`) unambiguous. Deposits, by contrast, are matched on contract and symbol together (`is_token_supported`), which is what rejects a same-symbol token arriving from an unrecognized contract.

```json
{
  "token_contract": "eosio.token",
  "token_symbol": "8,WAX"
}
```

```typescript
await session.transact({
  actions: [
    {
      account: "atomicmarket",
      name: "addconftoken",
      authorization: [{ actor: "atomicmarket", permission: "active" }],
      data: {
        token_contract: "eosio.token",
        token_symbol: "8,WAX",
      },
    },
  ],
});
```

Source: `atomicmarket-contract src/atomicmarket.cpp:97-112` (`addconftoken`), `atomicmarket-contract include/atomicmarket.hpp:638-653` (`config_s` singleton, which carries `supported_tokens`), `atomicmarket-contract include/atomicmarket.hpp:454-457` (the `TOKEN` struct itself), `atomicmarket-contract src/atomicmarket.cpp:2399-2428` (`is_token_supported`, `is_symbol_supported`)
