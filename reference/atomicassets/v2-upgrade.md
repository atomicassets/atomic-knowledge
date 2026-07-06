# AtomicAssets V2 upgrade and compatibility

Validated behavior of the `atomicassets` contract's V2 upgrade: what changed, and the indexer/chain compatibility surface that follows from how the upgrade was shipped.

## V2 is an additive in-place upgrade

AtomicAssets V2 is a non-breaking, additive, in-place upgrade of the V1 contract. Every existing table and action keeps its layout (new capabilities live in new tables and actions), so a `setcode`/`setabi` preserves all on-chain state and requires no on-chain migration. The indexer/chain compatibility matrix follows from that: a V2 indexer against a V1 chain is safe (the new code paths stay dormant), a V1 indexer against a V2 chain is degraded but not fatal (it keeps indexing ownership, mints, transfers, and offers while ignoring the new actions and tables; verified empirically by running a stock legacy eosio-contract-api 1.3.x filler against a live V2 testnet chain with zero errors), and full V2 functionality requires the V2 indexer with its database migration applied. There is no flag day: operators can upgrade indexers on their own schedule. The V2 indexer has no exotic database requirement: PostgreSQL 14+ is recommended and existing PostgreSQL 13 installations work.
