# Mint an asset on WAX testnet

Signs `createschema` and `mintasset` in one transaction, minting one templateless asset into a collection the signing account already authors, then reads the asset back through the testnet API. Run the `create-collection` starter first if the account authors none.

## The environment contract

Two variables, and no other spelling of them:

| Variable | Holds |
| --- | --- |
| `WAX_TESTNET_ACTOR` | the account that signs, pays the RAM, and receives the asset |
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
WAX_TESTNET_ACTOR=mycreator11 WAX_TESTNET_PRIVATE_KEY=yourkey node src/index.js mycollectn1
```

With no argument the collection is the newest one the API reports for this author. Naming one on the command line skips that read. A run that signs prints what it chose, the transaction the chain accepted, and the row the API serves once the indexer catches up:

```
Signing createschema and mintasset for mycollectn1/starterq3m4w as mycreator11@active on WAX testnet.
The chain accepted transaction 4b91...c07d.
The API now serves asset 2199024342156, named Starter asset, owned by mycreator11.
```

## What it signs

`ActionBuilder` from `@atomichub/atomicassets` is synchronous and holds no session. Each method returns one `{ account, name, data }` object, and the command attaches the authorization its session carries, so building actions and signing them stay separate steps. Both actions go in one transaction: a schema with nothing minted against it is a half step nobody wants, and Antelope commits a transaction whole or not at all.

The schema format carries a line named `name` typed `string`. That is not a field this starter happens to want: `createschema` aborts on any format that omits it. The other two lines, an `image` and a `uint32`, are there to show a non-string type beside it. `createAttributeMap` turns a plain object plus that same per-field type lookup into the attribute map the action carries, so no schema fetch is needed to build one.

The schema name is fresh per run: a fixed prefix and five characters from `randomBytes`. `createschema` refuses a name the collection already carries, so a fixed name would sign once and fail on every run after it. It also makes the read-back exact, since the collection and schema pair then names one asset.

`template_id` is `-1`, the contract's "no template" sentinel, which is what lets the asset carry its own immutable data with no `createtempl` step. `tokens_to_back` is empty because native backing is gone in V2 and a non-empty vector aborts the mint. `authorized_minter` is the actor rather than `new_asset_owner`, because the minter pays the RAM for the new row even though the row lives in the owner's scope: a minter without enough RAM staked blocks its own mint however well resourced the recipient is.

A committed transaction and an indexed row are two facts. The command polls the testnet API for thirty seconds and fails if the row never arrives, rather than reporting a success the reader cannot see.

## The tests

```
npm test
```

Eleven propositions run under `node --test`, none of them signing and none needing a key. Two spawn the command with both variables stripped from its environment and assert it exits zero naming the missing one, which is the same path a reader without keys takes. The rest cover the derived schema name's shape, its per-run entropy and its entropy floor, the composed action pair and its order, the mandatory format line, the templateless and unbacked mint, the attribute map, and the two guards that fail before an action exists.

The two spawning propositions delete the variables from the child's environment rather than reading the ambient one, so they prove the skip path even when a run does hold keys.

## Residual risk

The key this starter reads signs on a chain with no value, the account holds no mainnet authority, and the collection is disposable, so the worst case is junk minted into a throwaway collection. Use a testnet account created for this and nothing else, and never a key that also exists on mainnet.

The key reaches the process through the environment and is held in memory unencrypted by the private-key plugin. Keep it out of the shell history and out of any committed file. In this repository's checks the two values live in a GitHub Actions environment and the signing arm never runs for a pull request, which is the guard that matters: a repository secret with no fork guard is the configuration that leaks, not the chain the key signs on.

Every run costs the signing account RAM, for the schema once and for each asset after it. Nothing here reclaims it. `burnasset` releases an asset's RAM; a schema is append-only and its row stays.

## License

MIT, see LICENSE.
