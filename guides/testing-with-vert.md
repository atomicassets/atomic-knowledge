---
scope: Testing Antelope contracts in-process with @atomichub/vert, including AtomicAssets/AtomicMarket integrations
depends-on: [reference/atomicassets/actions.md]
key-modules: ["@atomichub/vert 2.2.0 (commit a8a4160): src/antelope/blockchain.ts, src/antelope/vm.ts, src/antelope/table.ts, examples/"]
---

# Testing Antelope contracts with VeRT

VeRT runs a compiled Antelope contract's WebAssembly in-process under any JavaScript test runner, with no `nodeos`, no Docker, and no chain connection. It emulates the parts of the Antelope state machine a contract touches at runtime: action dispatch, the multi-index table store with secondary indexes, inline actions, notifications, permissions, and the crypto and print host functions. A test loads a `.wasm` and its `.abi`, calls actions the same way a transaction would, and reads the resulting tables, all synchronously in one process.

This suits fast, deterministic unit and integration tests of contract logic: fee math, guard conditions, table state transitions, and the notification and inline-action wiring between contracts such as AtomicAssets and AtomicMarket. It does not replace testnet validation. VeRT does not model CPU/NET/RAM billing, real signature verification, block production, or deferred transactions, and its permission checks are a simplified subset (see "Authorization model"). Run the suite for logic coverage on every change; validate resource use, ordering, and end-to-end behavior against a real chain (jungle4 or wax-testnet) before deploying.

`@atomichub/vert` is a fork of `@waxio/vert` that adds a per-chain host-function gate so a suite links only the host functions the target chain provides. Line citations below are against `@atomichub/vert` 2.2.0 at commit `a8a4160`.

Source: `@atomichub/vert package.json` (name, version 2.2.0, description), `@atomichub/vert README.md`

## What a test looks like

Install the library as a dev dependency:

```shell
npm install --save-dev @atomichub/vert
```

A test instantiates a `Blockchain`, loads the contract onto an account, calls an action, and asserts on a table row. This is the `eosio.token` suite that ships with the library, reading the `stat` singleton after `create`:

```ts
import fs from "fs";
import { Asset, Name } from "@wharfkit/antelope";
import { Blockchain, nameToBigInt, symbolCodeToBigInt, antelopeAssert } from "@atomichub/vert";
import { expect } from "chai";

const blockchain = new Blockchain();
const eosioToken = blockchain.createAccount({
  name: Name.from("eosio.token"),
  wasm: fs.readFileSync("contracts/eosio.token/eosio.token.wasm"),
  abi: fs.readFileSync("contracts/eosio.token/eosio.token.abi", "utf8"),
});
blockchain.createAccount("alice");

beforeEach(() => {
  blockchain.resetTables();
});

it("create", async () => {
  await eosioToken.actions.create(["alice", "1000.000 TKN"]).send();
  const symcode = symbolCodeToBigInt(Asset.SymbolCode.from("TKN"));
  expect(eosioToken.tables.stat(symcode).getTableRow(symcode)).to.deep.equal({
    supply: "0.000 TKN",
    max_supply: "1000.000 TKN",
    issuer: "alice",
  });
});
```

Action arguments are passed positionally in an array matching the ABI field order, then `.send(authorization)`. With no argument, `.send()` authorizes as the contract account's own `active` permission; a bare string like `.send("alice")` is expanded to `alice@active`. A failed action throws, and the thrown message for a contract `check(false, ...)` is `eosio_assert: <message>`, which the exported `antelopeAssert` helper builds for you.

Source: `@atomichub/vert src/antelope/tests/blockchain.spec.ts` (executed: `eos-vm > eosio.token`), `@atomichub/vert src/antelope/account.ts:124-153` (`.send()` authorization defaulting), `@atomichub/vert src/antelope/errors.ts:1` (`antelopeAssert`)

### Loading a contract, and when its actions are ready

`createAccount` with `wasm`/`abi` read synchronously through `fs.readFileSync` wires the account's `actions` and `tables` in the constructor, so they are callable immediately. `blockchain.createContract(name, folder)` is the shorthand the README shows: it reads `folder.wasm` and `folder.abi` (both must share the base name) and enables inline actions by default. Because `createContract` reads those files as promises, the account's `actions` and `tables` are wired only after that load resolves on a later tick, not in the same tick as the call:

```ts
const c = blockchain.createContract("mycontract", "build/mycontract");
typeof c.actions.myaction; // "undefined" in the same tick
await new Promise((r) => setTimeout(r, 0));
typeof c.actions.myaction; // "function"
```

Inside an `async` test body you are already past that tick, so `createContract` at the top of a spec and actions called inside `it(...)` blocks work as written. If you need the actions synchronously in the same tick, construct with `createAccount` and `fs.readFileSync` buffers instead.

Every `.send()` and `.read()` re-instantiates each account's VM and awaits it before dispatch, so an action always runs against a freshly built VM and you do not normally call `recreateVm()` yourself. Call `await account.recreateVm()` only when you need a VM instance ready outside a transaction, such as poking `account.vm.imports.env.*` directly; it re-instantiates an already-loaded contract's WebAssembly and does not perform the async `.wasm`/`.abi` load.

Source: `@atomichub/vert src/antelope/blockchain.ts:264-272` (`createContract`), `@atomichub/vert src/antelope/account.ts:55-91` (async `setContract`, `recreateVm`), `@atomichub/vert src/antelope/blockchain.ts:300-312` (`resetVm` recreates and awaits every account's VM per transaction). Load-timing behavior confirmed by executing both patterns against the bundled `foo` contract.

## The per-chain host-function gate

Antelope chains do not all expose the same host functions. A contract that imports a host function the target chain lacks is rejected by that chain at `setcode`, so a harness that offered it anyway would pass a suite the chain would never run. VeRT withholds chain-specific host functions unless you name the chain that provides them.

`new Blockchain()` emulates generic Antelope and exposes no chain-specific host functions. `new Blockchain({ chain: "wax" })` adds the ones unique to WAX:

```ts
const generic = new Blockchain();                 // no verify_rsa_sha256_sig
const wax = new Blockchain({ chain: "wax" });      // adds verify_rsa_sha256_sig
```

The only WAX-specific function today is `verify_rsa_sha256_sig`, which WAX provides and EOS, Jungle4, and Vaulta do not. Under a generic (or unrecognized) chain, `verify_rsa_sha256_sig` is deleted from the import object, so a contract importing it fails to instantiate exactly as `setcode` would reject it off WAX. Test a WAX contract that uses RSA against `{ chain: "wax" }`, and test everything else against the default. Shared host functions such as `recover_key` survive the gate on every chain.

The map of chain to its extra host functions is `CHAIN_SPECIFIC_HOST_FUNCTIONS`, exported from the library; add an entry there to model a new chain-specific function.

Source: `@atomichub/vert src/antelope/blockchain.ts:21-29` (`CHAIN_SPECIFIC_HOST_FUNCTIONS`, `ALL_CHAIN_SPECIFIC_HOST_FUNCTIONS`), `@atomichub/vert src/antelope/blockchain.ts:75-77` (`enabledChainHostFunctions`), `@atomichub/vert src/antelope/vm.ts:1477-1485` (withholding by `delete imports.env[fn]`), `@atomichub/vert src/antelope/tests/vm.spec.ts:211-231` (executed: `chain-specific host functions`)

## Time control

The blockchain clock starts at epoch 0 (`TimePoint.fromMilliseconds(0)`), not wall-clock now, so `current_time_point()` reads 0 in a fresh harness. `setTime` moves the clock to an absolute point; `addTime` advances it by a duration (and `addBlocks` advances by 500ms per block). Use these to test time-gated logic such as auction expiry or listing windows without waiting. The bundled `timer` contract, whose action prints `current_time_point().time_since_epoch().count()`, reads 0, then 500000, then 1000000 microseconds as the clock is set forward:

```ts
import { TimePoint } from "@wharfkit/antelope";

await time.actions.exec([timeName]).send();
expect(time.bc.console).to.equal("0");

blockchain.setTime(TimePoint.fromMilliseconds(500));
await time.actions.exec([timeName]).send();
expect(time.bc.console).to.equal("500000");
```

Anything a contract writes with `print` accumulates on `blockchain.console` (aliased as `contract.bc.console`) for the duration of one transaction and is cleared at the start of the next.

Source: `@atomichub/vert src/antelope/blockchain.ts:67` (epoch-0 genesis), `@atomichub/vert src/antelope/blockchain.ts:277-295` (`setTime`, `addTime`, `subtractTime`, `addBlocks`), `@atomichub/vert examples/timer/timer.spec.ts` (executed end-to-end)

## Authorization model

VeRT's permission checks are a deliberate simplification of a real chain's, and in two respects they are stricter, so an action that a live chain would authorize can fail here.

- **Single-name `require_auth` accepts only `active` or `owner`.** `require_auth(name)` is satisfied only if the authorization list carries `name` with permission exactly `active` or `owner`. There is no permission hierarchy and no linkauth resolution, so authorizing with a custom permission (`alice@mycustom`) does not satisfy `require_auth(alice)` even when a live chain would through a linked permission. `has_auth` follows the same rule.
- **`require_auth2` is an exact match.** `require_auth2(name, permission)` is satisfied only by that exact actor-and-permission pair in the authorization list.

A permission named in an action's authorization must already exist on the account, or the action throws `Account <actor> has no permission <perm>` before the WebAssembly runs. Accounts are created with `owner` and `active` only; to authorize with any other permission, add it first with `account.setPermissions(...)`. A `check(false, ...)` that fails on missing authority throws `missing required authority <name>`.

```ts
// alice has only owner and active, so this throws before the contract runs:
await token.actions.create(["alice", "1000 TKN"]).send("alice@custom");
// Error: Account alice has no permission custom
```

Inline actions carry their own authorization and are checked against `eosio.code`: an inline action is permitted when the sending contract holds the `eosio.code` authority on the invoked permission, or the sender is a privileged account. Notifications, by contrast, run with an empty authorization list, so a notification handler cannot itself pass a `require_auth` for any account.

Source: `@atomichub/vert src/antelope/vm.ts:131-147` (`require_auth`), `@atomichub/vert src/antelope/vm.ts:166-181` (`require_auth2`), `@atomichub/vert src/antelope/vm.ts:1697-1723` (permission-exists check and inline `eosio.code` check in `apply`), `@atomichub/vert src/antelope/account.ts:50,93-95` (default `owner`/`active`, `setPermissions`), `@atomichub/vert src/antelope/vm.ts:248-256` (notification context built with `authorization: []`). Permission-exists throw and default permissions confirmed by execution; the `missing required authority` message is exercised by `@atomichub/vert examples/foo/foo.spec.ts` and `src/antelope/tests/priv.spec.ts`.

## Multi-contract setups: inline actions and notifications

Load each contract onto its own account on the same `Blockchain` and they interact as on chain. `send_inline` dispatches an inline action to another loaded contract, and `require_recipient` delivers a notification to another contract that has a matching `[[eosio::on_notify]]` handler. Both are what an AtomicMarket sale relies on: `purchasesale` sends an inline `acceptoffer` to AtomicAssets, and AtomicAssets' `lognewoffer` notifies AtomicMarket (see `guides/offers.md`). VeRT runs that whole cascade in-process, appending each inline action and notification to the action-trace queue in execution order.

The privileged-inline path is exercised by the bundled suite: a contract flagged `privileged: true` at creation can send an inline action without holding `eosio.code`, while a non-privileged sender is held to the `eosio.code` check.

```ts
const privContract = blockchain.createAccount({
  name: Name.from("auth.require"),
  wasm: fs.readFileSync("contracts/auth.require/auth.require.wasm"),
  abi: fs.readFileSync("contracts/auth.require/auth.require.abi", "utf8"),
  privileged: true,
});
await privContract.actions.inlinetest(["user", "auth.require"]).send("notuser@active");
```

An action that returns a value (or inlines an action that does) resolves `.send()` to an array of the deserialized return values in execution order; `.read()` returns a single value for read-only calls.

For an AtomicAssets integration test the library ships a `createDummyNfts` helper that stands up a full collection through top-level actions, `init`, `admincoledit`, `createcol`, `createschema`, `createtempl`, then `mintasset` per account, so your test starts from real minted assets rather than injected rows:

```ts
export const createDummyNfts = async (
  atomicassetsContract: Account, author: Account, mintToEach: number, accountsToMintTo: Account[]
) => { /* ... */ }
```

Source: `@atomichub/vert src/antelope/vm.ts:261-293` (`send_inline`), `@atomichub/vert src/antelope/vm.ts:215-259` (`require_recipient`), `@atomichub/vert src/antelope/blockchain.ts:79-130` (action-trace queue over inline actions and notifications), `@atomichub/vert src/antelope/tests/priv.spec.ts` (executed: privileged inline), `@atomichub/vert src/antelope/tests/return-values.spec.ts` (executed: `.send()` return arrays and `.read()`), `@atomichub/vert src/helpers/createDummyNfts.ts:10-68`

## Known limits, and how to design around them

These are not defects to work around blindly; they are boundaries of the emulation. Design tests so the contract itself drives state, and they stop mattering.

### Transaction-context host functions do not work in notification or inline subcontexts

`transaction_size` and `read_transaction` (and anything built on them) serialize the current context's transaction. VeRT populates that transaction only on the top-level action context; the contexts it builds for notifications and inline actions carry no transaction, so calling either host function inside a notification handler or an inline action throws rather than returning a size. At the top level they work: a top-level action reading `transaction_size()` returns a real byte count.

```ts
await txn.actions.top([]).send();        // prints a real size, e.g. 50
await txn.actions.ping(["receiver"]).send(); // receiver's on_notify calls transaction_size() -> throws
```

Design around it by asserting transaction-shape logic through a top-level action. If a contract's notification handler genuinely depends on `read_transaction`, that path needs testnet coverage instead.

Source: `@atomichub/vert src/antelope/vm.ts:1210-1226` (`read_transaction`, `transaction_size` serialize `context.transaction`), `@atomichub/vert src/antelope/vm.ts:248-256` and `:282-290` (notification and inline contexts built without a `transaction`). Confirmed by execution: a top-level read returned 50; the same call in an `on_notify` handler threw.

### setRow writes only the primary row; secondary indexes exist only for rows the contract emplaces

`contract.tables.<name>(scope).set(primaryKey, payer, data)` injects a primary row directly into the store. It writes the primary row only and does not populate any secondary index. So a table's secondary indexes hold entries only for rows the contract itself emplaced in-WASM (through `emplace`), not for rows you inject with `set`. Reading an injected row by primary key works; but a contract `modify` of a `set`-injected row whose table has a secondary index aborts, because the modify walks a secondary-index entry that was never created (the observed abort is a dereference of an end iterator).

```ts
// Injected primary row reads back fine:
sec.tables.items(scope).set(pk, Name.from("sec"), { owner: "bob", value: 5 });
sec.tables.items(scope).getTableRow(pk); // { owner: "bob", value: 5 }

// But a contract modify of that injected row aborts on the missing secondary index:
await sec.actions.upd(["bob", 7]).send(); // throws
```

Design around it by driving rows through top-level actions wherever the test will later mutate them: emplace via the contract's own action (or a helper like `createDummyNfts`) so the secondary index is built, and reserve `set` for read-only fixtures and rows the test never modifies. Seeding read-only fixtures with `set` is exactly what the bundled `fixtures` example does.

Source: `@atomichub/vert src/antelope/table.ts:454-474` (`TableView.set` writes the primary `KeyValueObject` only, no secondary-index write), `@atomichub/vert examples/fixtures/fixtures.spec.ts` (executed: `set` then `getTableRow`). The modify-abort was confirmed by executing a contract with a secondary index against a `set`-injected row.

## Correct and avoid

```text
// correct
new Blockchain()                       // generic Antelope; withholds chain-specific host fns
new Blockchain({ chain: "wax" })       // only when the contract imports verify_rsa_sha256_sig
emplace rows through top-level actions when the test will later modify them
seed read-only fixtures with tables.<name>(scope).set(...)
assert transaction_size / read_transaction through a top-level action
reset state with blockchain.resetTables() in beforeEach
treat a thrown action as the failure signal; match on "eosio_assert: <msg>"

// avoid
new Blockchain({ chain: "wax" }) for a non-WAX contract  // masks a real setcode rejection
tables.<name>(scope).set(...) for a row a contract action will later modify  // modify aborts
calling transaction_size / read_transaction from a notification or inline handler  // throws
authorizing with a custom permission and expecting require_auth(name) to pass  // needs active/owner
calling actions in the same synchronous tick as createContract  // actions wire on a later tick
treating a green VeRT run as deploy-ready  // it does not model RAM/CPU/NET, signatures, or ordering
```

## See also

- `guides/notification-integration.md`: the AtomicAssets notification wiring these multi-contract tests exercise.
- `guides/offers.md`: the inline-`acceptoffer` and `lognewoffer`-notification cascade a sale test drives through VeRT.
- `reference/atomicassets/actions.md` and `reference/atomicassets/notifications.md`: the action parameters and notify targets to assert against.
- `reference/wharfkit.md`: `@wharfkit/antelope` id serialization and typed table-read behavior, shared by the values you pass VeRT actions.
