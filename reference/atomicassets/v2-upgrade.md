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

AtomicMarket shows the same pattern. A live `get_table_rows` read of the `atomicmarket` contract's `config` singleton (`code=atomicmarket`, `scope=atomicmarket`, `table=config`) against WAX mainnet, jungle4 testnet, and wax-testnet public RPC nodes currently returns `version: "1.3.3"` and the V1 default field set on all three, meaning `atomicmarket`'s V2-only royalty tables (`royaltyconf`, `royaltytemp`, `royaltyattr`) are not yet observable on any publicly reachable chain. Treat the V2-only `atomicmarket` tables as source-verified but not live-chain-verified; re-check the live `config.version` before relying on chain-observability claims.

Source: live chain read, `POST https://wax.greymass.com/v1/chain/get_table_rows {"code":"atomicmarket","scope":"atomicmarket","table":"config"}`
