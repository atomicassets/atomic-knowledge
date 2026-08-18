---
scope: The five runnable starter directories in this repository, what each one does on WAX testnet, and which of them needs a signing key before it does anything
depends-on: [tutorials/first-collection.md, guides/signing.md]
key-modules: []
---

# Starters

Five directories you can clone whole and run. Each one is a `package.json`, a `src/`, its own README, and a test that runs the thing rather than asserting about it. They are MIT licensed, separately from the prose in the rest of this repository.

Two of them read and need nothing. Three of them sign on WAX testnet and read `WAX_TESTNET_ACTOR` and `WAX_TESTNET_PRIVATE_KEY` from the environment. With either of those unset, a signing starter exits zero and names the one it wanted, so a clone with no keys still runs green and tells you why it did nothing. [Mint your first asset on testnet](first-collection.md) walks the same ground step by step and shows you how to get an account and a key.

| Starter | Needs | What it does |
| --- | --- | --- |
| [read-assets](../starters/read-assets/) | no key | Reads assets, templates, and schemas from the hosted API and prints the decoded attributes of one asset. |
| [storefront-read](../starters/storefront-read/) | no key | Reads open sales and auctions for a collection and prints what a buyer would pay and what the seller would keep. |
| [create-collection](../starters/create-collection/) | testnet key | Creates a collection and a schema under your account, the first half of the tutorial. |
| [mint-asset](../starters/mint-asset/) | testnet key | Creates a template and mints an asset from it into your own account. |
| [list-a-sale](../starters/list-a-sale/) | testnet key | Announces a sale for an asset you own and escrows it through an AtomicAssets offer. |

Run one:

```
cd starters/read-assets
npm install
node --test
```

The two reading starters run anywhere. The three signing starters run against WAX testnet, which is where the V2 contracts are deployed, so nothing they do costs anything or touches a mainnet. Use a testnet key and only a testnet key: [Build a session and sign](../guides/signing.md#construct-the-session) covers where that key lives and why the environment is the only place it belongs.
