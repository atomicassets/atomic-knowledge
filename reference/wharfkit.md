---
scope: "@wharfkit/antelope client library behavior for table reads, authority checks, and payer unwrapping"
depends-on: []
key-modules:
    - "@wharfkit/antelope"
---

# @wharfkit/antelope client behavior

Version-pinned facts below were verified against 1.1.1; re-check them on upgrade.

## Typed get_table_rows is not a drop-in for dynamic reads

@wharfkit/antelope's typed `client.v1.chain.get_table_rows` is not a transparent drop-in for dynamic, string-driven table reads. It infers `key_type` only when bounds are passed as typed instances (UInt64 → i64, UInt128 → i128, Checksum256 → sha256, Checksum160 → ripemd160); otherwise `key_type` defaults to `name`, so numeric bounds passed as plain strings or numbers are silently interpreted as account names and return wrong ranges. For tables with numeric primary keys, always pass `key_type: 'i64'` explicitly or use typed bounds.

```
// correct
client.v1.chain.get_table_rows({
    code, scope, table,
    lower_bound: UInt64.from(assetId),
    key_type: 'i64',
});

// avoid
client.v1.chain.get_table_rows({
    code, scope, table,
    lower_bound: assetId.toString(), // key_type inferred as 'name', wrong index
});
```

Typed endpoints such as `get_account` also strict-decode responses into structs, which is less forgiving than raw JSON access; for fully dynamic reads, the raw `client.call({ path, params })` escape hatch remains available. Migrating from eosjs is safe with respect to key material: both libraries produce identical modern string forms (`PUB_K1_`, `PVT_K1_`, `SIG_K1_`), so stored keys and signature comparisons carry over, but never convert to legacy `EOS`-prefixed forms. WharfKit's `PrivateKey.signMessage(bytes)` is defined as a signature over `sha256(message)`, matching the common eosjs-era message-signing convention.

## hasPermission does not recurse into account weights

`Authority.hasPermission` in @wharfkit/antelope (verified in 1.1.1) checks a public key only against the authority's direct `keys[]` entries; its own source carries an `@attention` note that indirect permissions via `accounts[]` weights are not considered. This matters on WAX: Cloud Wallet `.wam` accounts commonly delegate their active permission to a managing account (e.g. `managed.wax`), so verifying a recovered key with `hasPermission` alone rejects every such account. Off-chain verifiers need a recursive authority walk: fetch the account, accumulate weight from direct key matches, then recurse into each `accounts[]` entry and add its weight when the child authorizes the key, short-circuiting once the threshold is met. Bound the walk with a small depth cap (real delegations rarely exceed depth 2) and cycle detection keyed on (account, permission), removing the visited entry when a branch unwinds, or sibling branches that legitimately converge on the same downstream account are wrongly counted as zero weight. Also walk a permission's parent (e.g. `owner` for `active`) on the same account, since the chain accepts a parent-permission key wherever the child would suffice. Re-verify the no-recursion behavior on any library upgrade.

## show_payer rows are unwrapped into ram_payers

With `show_payer: true`, the raw `/v1/chain/get_table_rows` endpoint wraps each row as `{ data: <row>, payer: <account> }`. The typed `@wharfkit/antelope` client (`client.v1.chain.get_table_rows`, verified on 1.1.1) unwraps that envelope: it returns the rows flat and moves the payers into a separate `ram_payers` array on the response, index-aligned with `rows`. Code ported from eosjs that expects `row.data` / `row.payer` on each element therefore gets `undefined` on every row (a failure mode that unit tests can miss entirely if they mock the raw nodeos shape the typed client never returns). Either read the payer from `response.ram_payers[i]`, or call `/v1/chain/get_table_rows` directly with `json: true, show_payer: true` to keep the `{data, payer}` row shape; in both cases, stub the actual transport in tests rather than mocking an assumed row shape.
