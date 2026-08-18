---
scope: "Construct the WharfKit session every write snippet signs through: the install lines, the chain ids, the actor and permission pair, and which network runs V2"
depends-on: [reference/wharfkit.md, reference/atomicassets/v2-upgrade.md, guides/querying-the-api.md]
key-modules:
    - "@wharfkit/session (1.6.1): src/index.ts, src/session.ts, src/transact.ts"
    - "@wharfkit/common (1.5.0): src/common/chains.ts"
    - "@wharfkit/wallet-plugin-privatekey (1.1.0): src/index.ts"
---

# Build a session and sign

Every write snippet in this repository opens against a `session` and never builds one. This page builds it: the packages to install, the chain the session points at, and the account and permission it signs as. The flows stay in the guide that owns each one, and each of those links back here.

## Reads need no key, no account, and no registration

Reading AtomicAssets and AtomicMarket state takes no credential. The hosted API answers an anonymous request, and so does a chain table read against a public node. There is no API key to obtain, no account to create, and no registration step: a key signs a transaction, and nothing on the read path asks for one. See [Query the API and chain tables](querying-the-api.md) for that surface. Everything below is for the write path.

Source: live anonymous reads, `GET https://wax.api.atomicassets.io/atomicassets/v1/assets?limit=1` (HTTP 200 with rows, no credential sent) and `POST https://wax.greymass.com/v1/chain/get_table_rows` for `atomicassets` `collections` (rows returned, no credential sent)

## Install the signing library

```
npm install @wharfkit/session
```

A script that signs from a private key it holds itself adds the private-key signing plugin:

```
npm install @wharfkit/wallet-plugin-privatekey
```

Two packages are enough because `@wharfkit/session` re-exports `@wharfkit/antelope`, `@wharfkit/abicache`, `@wharfkit/common`, and `@wharfkit/signing-request` from its own entry point, so `Chains`, `PrivateKey`, `Name`, and the other Antelope types arrive with the one import and cannot drift to a second copy. The plugin declares `@wharfkit/session` as a peer dependency and has no runtime dependency of its own beyond `tslib`. A browser integration signs through a plugin for the signer the reader already has rather than this one, and that plugin implements the same `WalletPlugin` interface, so the flows in the guides are unchanged either way: they only call `session.transact()`.

Source: `@wharfkit/session (1.6.1) src/index.ts:1-12` (the four re-exports and the default `SessionKit` export), `package.json` (the four `@wharfkit` dependencies); `@wharfkit/wallet-plugin-privatekey (1.1.0) package.json` (the `@wharfkit/session` peer dependency, `tslib` the only runtime dependency), `src/index.ts:23` (the class implements `WalletPlugin`)

## Construct the session

```ts
import { Chains, Session } from '@wharfkit/session'
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey'

const actor = process.env.WAX_TESTNET_ACTOR
const privateKey = process.env.WAX_TESTNET_PRIVATE_KEY
if (actor === undefined || privateKey === undefined) {
  throw new Error('Set WAX_TESTNET_ACTOR and WAX_TESTNET_PRIVATE_KEY.')
}

const session = new Session({
  actor,
  permission: 'active',
  chain: Chains.WAXTestnet,
  walletPlugin: new WalletPluginPrivateKey(privateKey),
})
```

`chain` and `walletPlugin` are required, and the identity arrives either as `actor` plus `permission` or as a single `permissionLevel`. With neither form present the constructor throws `Either a permissionLevel or actor/permission must be provided when creating a new Session.` before any network call. `session.actor` and `session.permission` are read off `session.permissionLevel`, which is the value the snippets in the guides pass as `authorization: [session.permissionLevel]`, so the session is the single place the signing identity is written down.

`session.transact()` accepts one `action`, an `actions` array, a whole `transaction`, or a signing request, which is why some guides show `{ action: ... }` and others `{ actions: [...] }` for the same session.

The private-key plugin takes the key itself as its one constructor argument, holds it in memory unencrypted, and signs the transaction digest for the chain id the session carries. That shape belongs in a script or a continuous-integration job: read the key from the environment, never from a committed file, and use a testnet key for anything a guide walks through.

Source: `@wharfkit/session (1.6.1) src/session.ts:51-57` (`SessionArgs`), `:125-138` (the required fields, the two identity branches, and the throw), `:192-201` (`actor` and `permission` read off `permissionLevel`), `:206-208` (the `APIClient` built from `chain.url`), `src/transact.ts:187-200` (`TransactArgs`); `@wharfkit/wallet-plugin-privatekey (1.1.0) src/index.ts:33-46` (the constructor), `:68-83` (`sign`, digest over `context.chain.id`)

## The account and permission shape

An Antelope signing identity is a pair written `actor@permission`: the account that signs and the named permission it signs with. Use `active` unless the account has a custom permission linked to the action, which is the case the pair exists to express. The constructor applies no default of its own: `actor` and `permission` are composed into `actor@permission` and parsed as a permission level, so omitting `permission` and passing no `permissionLevel` throws rather than assuming `active`. `permissionLevel: 'mycreator11@active'` is the same identity written as one string.

Source: `@wharfkit/session (1.6.1) src/session.ts:130-138` (the `permissionLevel` branch, the `actor` and `permission` branch composing the pair, and the throw when neither form is present)

## Chain ids

A chain definition is a chain id and a node URL. The id is what a signature commits to, so a wrong one produces a transaction the target chain rejects rather than a network error. `Chains` carries a ready definition per chain, and a deployment of your own goes in as a plain `{ id, url }` object instead.

| Chain | `Chains` constant | Chain id | Probed node |
| --- | --- | --- | --- |
| WAX mainnet | `Chains.WAX` | `1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4` | `https://wax.greymass.com` |
| WAX testnet | `Chains.WAXTestnet` | `f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12` | `https://waxtestnet.greymass.com` |
| Jungle4 testnet | `Chains.Jungle4` | `73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d` | `https://jungle4.api.eosnation.io` |
| Vaulta | `Chains.Vaulta` | `aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906` | `https://vaulta.api.atomicassets.io` |
| XPR Network | `Chains.XPR` | `384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0` | `https://xpr.api.atomicassets.io` |
| XPR Network testnet | `Chains.XPRTestnet` | `71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd` | `https://test.xpr.api.atomicassets.io` |

Two pairs of constants carry one id each, because each pair is one chain under two names: `Chains.Vaulta` and `Chains.EOS` both carry `aca376f2...`, and `Chains.XPR` and `Chains.Proton` both carry `384da888...`. Only the Vaulta pair differs at all, in the system token it names, which is a rebrand rather than a second chain; the XPR pair is identical field for field. A signature commits to the same id whichever constant the code reaches for.

These six are the chains the SDK network factories name (`wax`, `wax-testnet`, `vaulta`, `xpr`, `xpr-testnet`, `jungle4`); see [@atomichub/atomicassets SDK](../reference/sdk/atomicassets.md#network-factories-carry-atomichubs-public-hosts) ("Network factories carry AtomicHub's public hosts") for the host each key resolves to.

Source: live `GET /v1/chain/get_info` against each node in the table, each returning the `chain_id` on its row; the same six ids read from `@wharfkit/common (1.5.0) src/common/chains.ts:202-334` (`Chains`) and `:339-354` (`chainIdsToIndices`), which agree with the live reads

## WAX testnet is where V2 runs

WAX testnet runs the full V2 AtomicAssets and AtomicMarket contracts, WAX mainnet still runs V1, and jungle4 carries the V2 code with its tables unseeded, so a session that has to exercise V2 behavior points at `Chains.WAXTestnet`. See [AtomicAssets V2 upgrade](../reference/atomicassets/v2-upgrade.md#deployment-status) ("Deployment status") for the live reads behind that split and for why the contract's own `version` field does not settle it.

Source: `reference/atomicassets/v2-upgrade.md` ("Deployment status"), which cites the live `get_abi` and `get_table_rows` reads across the three chains
