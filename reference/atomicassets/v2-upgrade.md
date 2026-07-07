---
scope: What changed in the atomicassets V2 upgrade, the indexer/chain compatibility surface it creates, and live-chain deployment status
depends-on: []
key-modules: ["atomicassets-contract (v2.0.0-rc4): src/atomicassets.cpp, include/atomicassets.hpp"]
---

# AtomicAssets V2 upgrade and compatibility

What changed in the `atomicassets` contract's V2 upgrade, and the indexer/chain compatibility surface that follows from how the upgrade was shipped.

## V2 is an additive in-place upgrade

AtomicAssets V2 is a non-breaking, additive, in-place upgrade of the V1 contract. Every existing table and action keeps its layout (new capabilities live in new tables and actions), so a `setcode`/`setabi` preserves all on-chain state and requires no on-chain migration. The indexer/chain compatibility matrix follows from that: a V2 indexer against a V1 chain is safe (the new code paths stay dormant), a V1 indexer against a V2 chain is degraded but not fatal (it keeps indexing ownership, mints, transfers, and offers while ignoring the new actions and tables; verified empirically by running a stock legacy eosio-contract-api 1.3.x filler against a live V2 testnet chain with zero errors), and full V2 functionality requires the V2 indexer with its database migration applied. There is no flag day: operators can upgrade indexers on their own schedule. The V2 indexer has no exotic database requirement: PostgreSQL 14+ is recommended and existing PostgreSQL 13 installations work.

## Deployment status

WAX mainnet was still running V1 at the time of writing. A live `get_abi` read against `atomicassets` on `wax.greymass.com` (`POST /v1/chain/get_abi {"account_name":"atomicassets"}`, checked 2026-07-06) returns a 35-action ABI matching the V1 action list exactly, and a `get_table_rows` read of `tokenconfigs` on the same account reports `version: "1.2.3"`. None of the V2-only actions (`createauswap`, `setrampayer`, `setlastpayer`, `logrampayer`, `settempldata`, `logsetdatatl`, `setschematyp`) or tables (`authorswaps`, `schematypes`, `templates2`) are present or callable there yet, and `backasset` is still a live, non-deprecated action on that chain rather than the aborting stub V2 ships.

Re-check `tokenconfigs.version` (or `get_abi`) on any target chain before relying on V2-only behavior. `version` is only as accurate as the operator's last `setversion` call, so treat `get_abi`'s actual action/table list as the authoritative check when the two could disagree.

Source: live chain read, `POST https://wax.greymass.com/v1/chain/get_abi {"account_name":"atomicassets"}`, checked 2026-07-06

AtomicMarket follows the same additive pattern, but its V2 royalty tables are live on testnet. A `get_table_rows` read of the `royaltyconf` table (`code=atomicmarket`, `scope=atomicmarket`) succeeds on wax-testnet, where it is populated (`royaltycol11` among others carries a config), and on jungle4, where the table exists but is unseeded; on WAX mainnet the same read fails with `contract_table_query_exception` (code 3060003) because the V2 `setcode` has not been applied there. The full V2 royalty split is therefore live-chain-verified, not merely source-verified: a real wax-testnet sale settles founders, template, and attribute payouts that sum exactly to the collection fee (see `reference/atomicmarket/fees-and-royalties.md`).

`config.version` is not a reliable V2 signal. It reads `"1.3.3"` on all three chains, including the V2 testnet and jungle4 deployments, because no `setversion` has run since the V2 `setcode`. Use table presence as the authoritative check instead: a `royaltyconf` read that returns rows (even zero) means the V2 code is deployed, while one that errors with `contract_table_query_exception` means V1, exactly as `get_abi`'s action/table list is the authoritative check for `atomicassets` above.

Source: live `get_table_rows` reads of `atomicmarket` `config` and `royaltyconf` on WAX mainnet (`wax.greymass.com`, royaltyconf absent), jungle4 (`jungle4.api.eosnation.io`, table present and empty), and wax-testnet (table present and populated); V2 royalty settlement confirmed on wax-testnet
