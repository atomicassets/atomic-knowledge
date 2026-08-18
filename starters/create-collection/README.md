# Create a collection on WAX testnet

Signs `createcol` for a throwaway collection named after the signing account, then reads the collection back through the testnet API. This is the first write in the ladder: `mint-asset` mints into a collection this starter made, and `list-a-sale` lists what that minted.

## The environment contract

Two variables, and no other spelling of them:

| Variable | Holds |
| --- | --- |
| `WAX_TESTNET_ACTOR` | the account that signs, pays the RAM, and authors the collection |
| `WAX_TESTNET_PRIVATE_KEY` | that account's `active` key, in WIF or `PVT_K1_` form |

When either is absent or blank the starter prints which one it wanted, signs nothing, and exits zero. A clone with no keys therefore runs green and says why, and so does the read-only arm of this repository's own checks.

```
$ node src/index.js
WAX_TESTNET_PRIVATE_KEY is not set, so this starter signed nothing. Set both to run it against WAX testnet.
```

## Run it

```
npm install
WAX_TESTNET_ACTOR=mycreator11 WAX_TESTNET_PRIVATE_KEY=yourkey node src/index.js
```

A run that signs prints the collection it chose, the transaction the chain accepted, and the row the API serves once the indexer catches up:

```
Signing createcol for mycreaqm3wtb as mycreator11@active on WAX testnet.
The chain accepted transaction 6f0c...e21a.
The API now serves mycreaqm3wtb, authored by mycreator11.
```

## What it signs

`ActionBuilder` from `@atomichub/atomicassets` is synchronous and holds no session. `createcol` returns one `{ account, name, data }` object, and the command attaches the authorization its session carries, so building an action and signing one stay separate steps. The session itself is a WharfKit `Session` on `Chains.WAXTestnet` with the private-key plugin holding the key in memory, which is the shape for a script and never for a browser. WAX testnet is the chain because that is where the V2 contracts run.

The collection name is twelve characters: six carried over from the actor so a reader can tell whose it is, and six from `randomBytes` so a second run does not collide with the first. Twelve characters with no dot is the naming path that needs no co-signer. A name that happens to be a registered account still needs that account to sign, and the chain says so.

`market_fee` is `0` and passes through `ActionBuilder`'s finite-number check before an action exists. A `NaN` there would reach the signer as `null`, because JSON has no form for it, and the mistake would be invisible by the time the chain saw it.

A committed transaction and an indexed row are two facts. The command polls the testnet API for thirty seconds and fails if the row never arrives, rather than reporting a success the reader cannot see.

## The tests

```
npm test
```

Ten propositions run under `node --test`, none of them signing and none needing a key. Two spawn the command with both variables stripped from its environment and assert it exits zero naming the missing one, which is the same path a reader without keys takes. The rest cover the blank-value rule, the message's singular and plural forms, the derived name's shape and its per-run entropy, the entropy floor, the composed `createcol` action field by field, and the market-fee guard.

The two spawning propositions delete the variables from the child's environment rather than reading the ambient one, so they prove the skip path even when a run does hold keys.

## Residual risk

The key this starter reads signs on a chain with no value, the account holds no mainnet authority, and the collection is disposable, so the worst case is junk written into a throwaway collection. Use a testnet account created for this and nothing else, and never a key that also exists on mainnet.

The key reaches the process through the environment and is held in memory unencrypted by the private-key plugin. Keep it out of the shell history and out of any committed file. In this repository's checks the two values live in a GitHub Actions environment and the signing arm never runs for a pull request, which is the guard that matters: a repository secret with no fork guard is the configuration that leaks, not the chain the key signs on.

## License

MIT, see LICENSE.
