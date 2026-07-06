# AtomicAssets backing tokens

Validated behavior of the `atomicassets` contract's fungible-token backing mechanism: the deposit-then-spend pattern, where backed value is stored, how it was recovered, and the RAM-payer consequence of backing an asset. Baseline is the V2 contract, tag `v2.0.0-rc4` of `atomicassets-contract` (the release pinned for both testnets); the single most material V2 change is that backing is now deprecated, covered below.

## Depositing tokens before backing

The contract never treats an arbitrary incoming token transfer as a backing instruction. `announcedepo` creates (or extends) an owner's `balances` row with a zero-value placeholder for one whitelisted symbol, paid for by the announcing account. A subsequent token transfer to the contract carrying memo `"deposit"` is only accepted if a placeholder for that exact symbol already exists in `balances`; it is credited by adding the transferred amount to that entry. Any other memo, or a token contract/symbol pair not in the `config` singleton's `supported_tokens` list (populated only by the contract-authority action `addconftoken`), makes the incoming transfer fail. The two-step shape exists so the depositor, not the contract, pays for the RAM of their own `balances` row.

Source: src/atomicassets.cpp lines 990-1032 (announcedepo), 1402-1442 (receive_token_transfer), 56-69 (addconftoken); include/atomicassets.hpp line 240 (on_notify declaration), lines 445-451 (balances_s)

## The balances table is a general-purpose deposit ledger

`balances_s` is one row per owner holding a vector of `asset` quantities, one entry per announced symbol, with no link to any specific NFT. `withdraw` spends directly out of this pool back to the owner's wallet through the token contract recorded in `supported_tokens`. Historically `backasset` spent out of the same pool to attach value to an asset. The table itself is not backing-specific; it is whatever pre-funded balance any contract action needs.

Source: include/atomicassets.hpp lines 445-451 (balances_s); src/atomicassets.cpp lines 1040-1070 (withdraw), 1768-1801 (internal_decrease_balance)

## How backing worked: burnable-only, and the RAM payer moves

Before V2 deprecated it, backing an asset (`backasset`, or `tokens_to_back` on `mintasset`) required the asset's template to have `burnable` set to true; only burnable assets could ever be backed. The payer's deposited balance was decreased by the backed amount, and the amount was added to the asset's `backed_tokens` vector, accumulating by symbol if the asset was already backed. Critically, the payer became the new `ram_payer` for the asset's entire row, not just an incremental charge for the added value, so backing an asset made the backer liable for that asset's whole RAM footprint from that point on. Backing the same asset repeatedly, by different payers, reassigned the RAM payer each time.

Source (V1): atomicassets-contract src/atomicassets.cpp lines 1329-1372 (internal_back_asset), 767-776 (backasset), 605-616 (mintasset backing loop)

## Backed amounts live on the asset row, not the balances table

Once attached, backing showed up as the `backed_tokens` vector on the asset's own `assets` row, the same row that holds owner, template, and serialized data, not in `balances` (which only ever holds undeposited value). A single asset could carry multiple backed symbols at once; the vector accumulates rather than overwrites. There is no dedicated endpoint for a backed total; a reader gets it by reading the asset row's `backed_tokens` field directly.

Source: include/atomicassets.hpp lines 409-421 (assets_s)

## Recovery only via burnasset

The only action that ever removes value from `backed_tokens` is `burnasset`, and only as a side effect of destroying the asset. If `backed_tokens` is non-empty, `burnasset` moves the full vector into the owner's `balances` row (creating one if none exists, merging into existing per-symbol amounts otherwise), then erases the asset. There is no action to unback an asset while it stays alive and no partial-withdraw path; only the current `asset_owner`, who must sign `burnasset`, can trigger it. This action's shape is unchanged between V1 and the current V2 source.

Source: src/atomicassets.cpp lines 1096-1177 (burnasset)

## Changed in V2: native backing is deprecated

The current V2 contract source disables new backing outright. `backasset` unconditionally aborts with "Native backing has been deprecated on the AtomicAssets Contract," and `mintasset`'s `tokens_to_back` parameter is only accepted if empty, aborting with the same message otherwise. `announcedepo`, the deposit-transfer flow, and `withdraw` are untouched, so the deposit ledger still works as a generic pre-funded balance; it simply can never be spent into an asset's `backed_tokens` again. `burnasset`'s recovery path is untouched and stays live: any asset that was backed before the deprecation still releases its `backed_tokens` to the owner's balance when burned. `logbackasset` remains declared in the V2 ABI as an empty stub, kept only for backwards ABI compatibility; nothing invokes it once backing is disabled, so a contract watching for it will not see one again on a chain running this V2 build.

Source: src/atomicassets.cpp lines 786-787 (mintasset abort), 1085-1086 (backasset abort), 1550-1556 (logbackasset stub)

## Live-chain caveat

A live `get_abi` read against WAX mainnet's `atomicassets` account, taken 2026-07-06, returns a 35-action ABI matching the V1 action set, where `backasset` is a live, non-deprecated action. The deprecation described above is a fact about the V2 contract source; confirm which contract build a target chain is running before treating "backing is disabled" as universally true.

Source: live chain read, `POST https://wax.greymass.com/v1/chain/get_abi {"account_name":"atomicassets"}`, checked 2026-07-06
