# List a sale on WAX testnet

Signs the AtomicMarket listing pair for one asset the signing account owns, then reads the sale back through the testnet API. Run the `mint-asset` starter first if the account owns nothing to list.

## The environment contract

Two variables, and no other spelling of them:

| Variable | Holds |
| --- | --- |
| `WAX_TESTNET_ACTOR` | the account that signs and sells |
| `WAX_TESTNET_PRIVATE_KEY` | that account's `active` key, in WIF or `PVT_K1_` form |

When either is absent or blank the starter prints which one it wanted, signs nothing, and exits zero. A clone with no keys therefore runs green and says why, and so does the read-only arm of this repository's own checks.

```
$ node src/index.js
WAX_TESTNET_ACTOR and WAX_TESTNET_PRIVATE_KEY are not set, so this starter signed nothing. Set both to run it against WAX testnet.
```

## Run it

```
npm install
WAX_TESTNET_ACTOR=mycreator11 WAX_TESTNET_PRIVATE_KEY=yourkey node src/index.js
WAX_TESTNET_ACTOR=mycreator11 WAX_TESTNET_PRIVATE_KEY=yourkey node src/index.js 2199024342156 "12.50000000 WAX"
```

With no arguments the asset is the newest one the API reports this account owning, and the price is `1.00000000 WAX`. A run that signs prints what it chose, the transaction the chain accepted, and the row the API serves once the indexer catches up:

```
Listing asset 2199024342156 at 1.00000000 WAX as mycreator11@active on WAX testnet.
The chain accepted transaction 90da...4b16.
The API now serves sale 3491027, offer 8812340, asking 1.00000000 WAX.
```

## What it signs

`MarketActionBuilder.announceSaleActions` from `@atomichub/atomicmarket` emits the whole listing flow rather than one action at a time: `announcesale` on `atomicmarket`, then a `createoffer` on `atomicassets` carrying the memo `sale`. The order and that memo literal are the contract's requirements, and the composer is what keeps them out of the caller's hands. Assembling the pair by hand is how a listing ends up announced but inactive, or offered but dangling.

`announcesale` moves nothing. The sale is a lazy-accept escrow: the asset stays in the seller's account until a buyer calls `purchasesale`, which accepts the offer and transfers the asset in the same transaction. That is why the offer is what activates the row, and why both actions go in one transaction.

The composer checks nothing about the listing, by design: asset counts, symbol support, and marketplace registration are all chain state it is not handed. This starter holds the two lines it can hold without reading the chain. It refuses a listing naming other than exactly one asset, because AtomicMarket V2 removed bundle listings and asks for one sale per asset. And it refuses a listing price whose symbol does not match `settlement_symbol`, because a listing whose two symbols differ is a Delphi sale, which settles an oracle conversion of the price rather than the price itself. Both refusals happen before any action exists.

`maker_marketplace` is the empty string, the contract's seeded default, which is always valid. Any other value has to name a marketplace already registered on chain.

A committed transaction and an indexed row are two facts. The command polls the testnet API for thirty seconds and fails if the row never arrives, rather than reporting a success the reader cannot see.

## The tests

```
npm test
```

Nine propositions run under `node --test`, none of them signing and none needing a key. Two spawn the command with both variables stripped from its environment and assert it exits zero naming the missing one, which is the same path a reader without keys takes. Three pin what the composer emits: the two actions and their order, the offer's memo and its empty return side, and the announcement's fields. The last four cover the bundle refusal, the two symbol refusals, and the quantity reader behind them.

The composed order and memo are asserted against values the tests never set, so an upgrade of `@atomichub/atomicmarket` that changed either would redden here rather than on chain.

The two spawning propositions delete the variables from the child's environment rather than reading the ambient one, so they prove the skip path even when a run does hold keys.

## Residual risk

The key this starter reads signs on a chain with no value, the account holds no mainnet authority, and the asset it lists is disposable, so the worst case is a junk listing on a testnet marketplace. Use a testnet account created for this and nothing else, and never a key that also exists on mainnet.

The key reaches the process through the environment and is held in memory unencrypted by the private-key plugin. Keep it out of the shell history and out of any committed file. In this repository's checks the two values live in a GitHub Actions environment and the signing arm never runs for a pull request, which is the guard that matters: a repository secret with no fork guard is the configuration that leaks, not the chain the key signs on.

A listing this starter leaves behind stays live until it is bought or cancelled, and the offer behind it holds the seller's RAM for as long as it stands. `cancelsale` closes both.

## License

MIT, see LICENSE.
