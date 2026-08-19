---
scope: The one path from an empty WAX testnet account to a minted asset, through faucet, session, collection, schema, and template, with a read proving each step
depends-on: [guides/signing.md, guides/asset-lifecycle.md, reference/atomicassets/structure.md, reference/sdk/atomicassets.md]
key-modules:
    - "atomicassets-sdk (v2.1.1, 5c70c62): src/Actions/Generator.ts"
    - "atomicassets-contract (v2.0.0): src/atomicassets.cpp"
---

# Mint your first asset on testnet

One path from nothing to an asset you own on WAX testnet. Seven steps, each with a read that proves the step worked before the next one starts. Nothing here costs money and nothing here touches a mainnet.

Every step is written out. Where a value could be anything, this page picks one, so there is no choice to make and no branch to get wrong. The [starters](starters.md) are the same code as directories you can clone.

You need Node 22 or newer and `curl`. You do not need an API key: reading AtomicAssets state takes no credential, no account, and no registration, which is why every checkpoint below is a plain `curl` (see [Build a session and sign](../guides/signing.md#reads-need-no-key-no-account-and-no-registration), "Reads need no key, no account, and no registration").

## Step 1: create a WAX testnet account

Pick a name of exactly 12 characters using only `a` to `z` and `1` to `5`. This page uses `firstmint111`. Substitute yours everywhere it appears.

Twelve characters is not a style preference. The faucet rejects any other length and any character outside that set, with `{"msg": "failed, unsupported account name '<name>'"}` and HTTP 400.

Step 4 then reuses this name as the collection name. `createcol` accepts a collection name that is already a registered account, and that account's own authorization is then required as well, which is the signature you already have. It also means the collection name cannot collide with anyone else's, because the account name could not.

The WAX Sweden guild runs a public faucet that creates a testnet account and returns its keys. It allows one account per 24 hours per caller.

```
curl 'https://faucet.waxsweden.org/create_account?firstmint111'
```

The response carries the account name and two key pairs, `active_key` and `owner_key`, each with a public and a private half. Step 3 signs with the `active` permission, so the private half of `active_key` is the one it needs. Save both somewhere outside the repository you are working in, because the faucet hands them back once and cannot recover them later. The same call buys the new account 8192 bytes of RAM, which is more than everything below writes. Faucet usage is documented at `https://waxsweden.org/create-testnet-account/`.

### Checkpoint

The account exists on chain:

```
curl -X POST https://waxtestnet.greymass.com/v1/chain/get_account \
  -d '{"account_name":"firstmint111"}'
```

HTTP 200 and a body opening with `"account_name":"firstmint111"`. An HTTP 400 carrying `"code":3060002` means the account does not exist yet, so the faucet call did not land; see [Chain RPC behavior](../reference/chain.md) for why retrying that response never helps.

## Step 2: fund the account with testnet tokens

Creating the account did not fund it. The same faucet issues testnet WAX on a separate call, 500 per call and up to 1000 per 24 hours. One call is enough for this tutorial.

```
curl 'https://faucet.waxsweden.org/get_token?firstmint111'
```

A successful call answers `{"msg": "succeeded"}`.

### Checkpoint

Re-read the account and look for the balance:

```
curl -X POST https://waxtestnet.greymass.com/v1/chain/get_account \
  -d '{"account_name":"firstmint111"}'
```

The body now carries a `core_liquid_balance` field reading `"500.00000000 WAX"`. It carries `ram_quota` and `ram_usage` too. Every row you write in steps 4 through 7 is billed to this account: the minter pays for an asset's row, not the recipient, so this account's RAM is what the mint spends. The four rows come to under 1000 bytes against the 8192 the faucet bought, so nothing here needs more RAM. See [Create a collection and mint assets](../guides/asset-lifecycle.md#mint-an-asset-mintasset) ("Mint an asset: mintasset") for the RAM payer rule on each action.

## Step 3: install the packages and build the session

Make a directory, install three packages, and write the session once. Everything after this imports it.

```
mkdir first-collection && cd first-collection
npm init -y
npm install @atomichub/atomicassets@2.1.1 @wharfkit/session @wharfkit/wallet-plugin-privatekey
```

Put your account name and private key in the environment rather than in the file:

```
export WAX_TESTNET_ACTOR=firstmint111
export WAX_TESTNET_PRIVATE_KEY=<the private key the faucet returned>
```

`session.mjs`:

```js
import { Chains, Session } from '@wharfkit/session'
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey'

export const session = new Session({
  actor: process.env.WAX_TESTNET_ACTOR,
  permission: 'active',
  chain: Chains.WAXTestnet,
  walletPlugin: new WalletPluginPrivateKey(process.env.WAX_TESTNET_PRIVATE_KEY),
})
```

`Chains.WAXTestnet` is the chain WAX testnet runs V2 on. [Build a session and sign](../guides/signing.md) explains every field, the chain ids behind each constant, and how a browser signer drops into the same shape.

### Checkpoint

```
node -e "import('./session.mjs').then(m => console.log(String(m.session.permissionLevel)))"
```

It prints `firstmint111@active`. If it throws `Either a permissionLevel or actor/permission must be provided when creating a new Session.` then `WAX_TESTNET_ACTOR` is unset in the shell that ran the command. Nothing has touched the network yet: this checkpoint is local.

## Step 4: create the collection

A collection is the top level of the data model. It owns the authorization list that decides who may create schemas, templates, and assets under it.

`collection.mjs`:

```js
import { ActionBuilder } from '@atomichub/atomicassets'
import { session } from './session.mjs'

const builder = new ActionBuilder('atomicassets')

const action = builder.createcol(
  session.actor.toString(), // author
  session.actor.toString(), // collection_name, the same 12 characters
  true,                     // allow_notify
  [session.actor.toString()], // authorized_accounts
  [],                       // notify_accounts
  0.05,                     // market_fee, 5 percent
  [{ key: 'name', value: ['string', 'First Mint'] }],
)

const result = await session.transact({ action: { ...action, authorization: [session.permissionLevel] } })
console.log(result.response.transaction_id)
```

```
node collection.mjs
```

The call prints the transaction id the node accepted. The builder returns one `{account, name, data}` object and signs nothing; `session.transact` is what signs and broadcasts it, and the id comes back on `result.response`. The other three steps end the same way.

### Checkpoint

Read the collection straight off the chain:

```
curl -X POST https://waxtestnet.greymass.com/v1/chain/get_table_rows \
  -d '{"code":"atomicassets","scope":"atomicassets","table":"collections","json":true,"limit":1,"lower_bound":"firstmint111","upper_bound":"firstmint111"}'
```

One row comes back, carrying `"author":"firstmint111"`, `"authorized_accounts":["firstmint111"]`, and `"market_fee":"0.05000000000000000"`.

An empty `rows` array here usually means the read reached a node that has not applied the block yet, so run it again before you conclude anything. Every chain checkpoint below behaves the same way. If it is still empty on the second read, the transaction did not land.

The hosted indexer shows the same collection a moment later, with its attribute data already decoded:

```
curl 'https://test.wax.api.atomicassets.io/atomicassets/v1/collections/firstmint111'
```

That answers HTTP 200 with `"name":"First Mint"`. It answers HTTP 416 and `Collection not found` while the indexer is still behind the chain, which is why the chain read above is the checkpoint and this one is the confirmation.

## Step 5: create the schema

A schema is the ordered list of attribute names and types that every template and asset in the collection serializes against. Every schema must carry a `name` line of type `string`, so that line is first below.

`schema.mjs`:

```js
import { ActionBuilder } from '@atomichub/atomicassets'
import { session } from './session.mjs'

const builder = new ActionBuilder('atomicassets')

const action = builder.createschema(
  session.actor.toString(), // authorized_creator
  session.actor.toString(), // collection_name
  'cards',                  // schema_name
  [
    { name: 'name', type: 'string' },
    { name: 'img', type: 'image' },
    { name: 'power', type: 'uint32' },
  ],
)

const result = await session.transact({ action: { ...action, authorization: [session.permissionLevel] } })
console.log(result.response.transaction_id)
```

```
node schema.mjs
```

### Checkpoint

Schemas are scoped to their collection, so the scope is the collection name:

```
curl -X POST https://waxtestnet.greymass.com/v1/chain/get_table_rows \
  -d '{"code":"atomicassets","scope":"firstmint111","table":"schemas","json":true,"limit":1}'
```

One row comes back reading `"schema_name":"cards"` with the three format lines in the order you sent them. That order is load-bearing: attribute values are stored by position in this vector, and a schema can only ever be appended to. See [AtomicAssets data model structure](../reference/atomicassets/structure.md#schemas) ("Schemas").

## Step 6: create the template

A template holds the data every asset minted from it shares, so that data is stored and paid for once instead of once per asset. It also fixes whether those assets can be transferred and burned.

`template.mjs`:

```js
import { ActionBuilder, createAttributeMap } from '@atomichub/atomicassets'
import { session } from './session.mjs'

const builder = new ActionBuilder('atomicassets')

const immutable = createAttributeMap(
  { name: 'First Card', power: 10 },
  { name: 'string', power: 'uint32' },
)

const action = builder.createtempl(
  session.actor.toString(), // authorized_creator
  session.actor.toString(), // collection_name
  'cards',                  // schema_name
  true,                     // transferable
  true,                     // burnable
  10,                       // max_supply
  immutable,
)

const result = await session.transact({ action: { ...action, authorization: [session.permissionLevel] } })
console.log(result.response.transaction_id)
```

```
node template.mjs
```

`createAttributeMap` turns plain values into the `{key, value}` pairs the contract expects, picking the ABI variant for each declared type. It throws before any transaction is built if a field has no type or an unrecognized one.

### Checkpoint

The action does not hand the new template id back to the caller, so read it. Templates are scoped to the collection, and the newest row is the last one:

```
curl -X POST https://waxtestnet.greymass.com/v1/chain/get_table_rows \
  -d '{"code":"atomicassets","scope":"firstmint111","table":"templates","json":true,"limit":1,"reverse":true}'
```

The row carries `"schema_name":"cards"`, `"max_supply":10`, `"issued_supply":0`, and a `template_id`. Copy that number. Step 7 needs it.

## Step 7: mint the asset

`mint.mjs`, with the template id from step 6 in place of `123456`:

```js
import { ActionBuilder, createAttributeMap } from '@atomichub/atomicassets'
import { session } from './session.mjs'

const builder = new ActionBuilder('atomicassets')

const mutable = createAttributeMap({ power: 12 }, { power: 'uint32' })

const action = builder.mintasset(
  session.actor.toString(), // authorized_minter
  session.actor.toString(), // collection_name
  'cards',                  // schema_name
  123456,                   // template_id from step 6
  session.actor.toString(), // new_asset_owner, this account
  [],                       // immutable_data
  mutable,                  // mutable_data
  [],                       // tokens_to_back
)

const result = await session.transact({ action: { ...action, authorization: [session.permissionLevel] } })
console.log(result.response.transaction_id)
```

```
node mint.mjs
```

`tokens_to_back` is `[]` and stays `[]`. Native token backing is deprecated on V2, and a non-empty value aborts the mint.

### Checkpoint

Assets are scoped to their owner, so the scope is your account:

```
curl -X POST https://waxtestnet.greymass.com/v1/chain/get_table_rows \
  -d '{"code":"atomicassets","scope":"firstmint111","table":"assets","json":true,"limit":1,"reverse":true}'
```

One row comes back with an `asset_id` at or above 1099511627776, your `template_id`, `"ram_payer":"firstmint111"`, and a two-byte `mutable_serialized_data` array. The asset counter runs contract-wide and starts at 2^40, which is that number. Those two bytes are the `power` value packed against the schema format from step 5.

The hosted indexer unpacks it for you:

```
curl 'https://test.wax.api.atomicassets.io/atomicassets/v1/assets?owner=firstmint111&limit=1'
```

HTTP 200. The response carries `"mutable_data":{"power":12}`, the value you just minted, and a merged `"data"` object reading `{"power": 10, "name": "First Card"}`.

The 12 loses that collision on purpose. A template's immutable value for a key wins over the asset's own value for the same key, so the merged view shows the template's 10 while the asset's layer stays readable in its own field. That is the data precedence rule, and it is why the two fields disagree without either being wrong. Collections normally avoid the collision by keeping shared attributes on the template and per-asset attributes off it; this step sets `power` in both so you can see which one the merge keeps.

You own an asset. Reading the template's `issued_supply` again now returns 1.

## Next

- [Attribute data precedence](../reference/atomicassets/data-precedence.md) settles which layer a value came from when a template and an asset both declare it.
- [Create a collection and mint assets](../guides/asset-lifecycle.md) is the same flow as a reference for every action, including editing mutable data, transferring, and burning.
- [Working with sales](../guides/sales.md) lists the asset you just minted.
- [Starters](starters.md) has this code as directories you can clone and run.

## Appendix: what a first run hits

Every message below is the contract's or the client's own text. The page in the last column is where that behavior is documented and cited.

| What you see | What it means | Where it is documented |
| --- | --- | --- |
| HTTP 400 with `"code":3060002` on `get_account` | The account does not exist. The faucet call in step 1 did not land, or the name is misspelled. Retrying the read changes nothing. | [Chain RPC behavior](../reference/chain.md) |
| `{"msg": "failed, unsupported account name '...'"}` from the faucet | The name is not exactly 12 characters of `a` to `z` and `1` to `5`. | This page, step 1 |
| An empty `rows` array from `get_table_rows` right after a step | The read reached a node that has not applied the block yet. Run it again. Only a second empty answer means the transaction did not land. | [Chain RPC behavior](../reference/chain.md) |
| `Either a permissionLevel or actor/permission must be provided when creating a new Session.` | `WAX_TESTNET_ACTOR` is unset in this shell, so `actor` arrived as `undefined`. | [Build a session and sign](../guides/signing.md#construct-the-session) |
| `A collection with this name already exists` | Step 4 already succeeded, or the name is not the account you created. Skip to step 5. | [Create a collection and mint assets](../guides/asset-lifecycle.md#create-a-collection-createcol) |
| `The market_fee must be between 0 and 0.150000` | `market_fee` is outside 0 to 0.15. Step 4 uses 0.05. | [Create a collection and mint assets](../guides/asset-lifecycle.md#create-a-collection-createcol) |
| `Missing authorization for this collection` | The signing account is neither the collection's author nor on its `authorized_accounts` list. In this tutorial those are all one account, so this means step 4 ran under a different name. | [AtomicAssets data model structure](../reference/atomicassets/structure.md#authorization-and-the-24-account-cap) |
| `A format line with {"name": "name" and "type": "string"} needs to be defined for every schema` | The `schema_format` in step 5 lost its first line. | [Create a collection and mint assets](../guides/asset-lifecycle.md#create-a-schema-createschema) |
| `The template's maxsupply has already been reached` | This template has minted its 10. Create another template, or raise the cap on a new one. | [Create a collection and mint assets](../guides/asset-lifecycle.md#create-a-template-createtempl) |
| `Native backing has been deprecated on the AtomicAssets Contract` | `tokens_to_back` is not empty. It has to be `[]`. | [Backing tokens](../reference/atomicassets/backing-tokens.md) |
| A `SerializationError` naming a field, before any transaction is built | The builder's numeric guard rejected the value: a `template_id` that is not a whole int32, or a `max_supply` that is fractional or negative. A string that failed to parse arrives here as `NaN`. | [@atomichub/atomicassets SDK](../reference/sdk/atomicassets.md#numeric-parameters-are-checked-against-their-abi-type-and-throw) |
| `no type given for field 'x'` or `invalid type 'x' for field 'y'` | The second argument to `createAttributeMap` does not declare a type for every key in the first, or declares one the schema format does not use. | [@atomichub/atomicassets SDK](../reference/sdk/atomicassets.md) |
| HTTP 416 and `Collection not found` from the hosted API | The indexer has not caught up with the chain yet. The chain read is authoritative; wait and re-read. | [atomicassets-api HTTP API](../reference/api.md) |
| HTTP 429 and `{"success": false, "message": "Rate limit"}` | Too many reads against the hosted API from one address. The limit is per deployment and the response headers carry what is left. | [atomicassets-api HTTP API](../reference/api.md#rate-limits) |
