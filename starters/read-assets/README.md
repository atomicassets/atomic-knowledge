# Read the assets an account holds

Prints the asset id, the name, the collection, and the first attribute of the assets one WAX mainnet account holds. It signs nothing and needs no key, no account, and no registration: the hosted API answers an anonymous request.

## Run it

```
npm install
node src/index.js
node src/index.js someaccount
```

With no argument the read is against `federation`, the account that authors the alien.worlds collection. Output is one line per asset:

```
5 of the assets federation holds on WAX mainnet:
 1099925383114  Standard Shovel                   alien.worlds    img=QmYm1FG7Lx...
```

## What it reads

`explorerApiForNetwork('wax')` from `@atomichub/atomicassets` builds a client against `https://wax.api.atomicassets.io`, and `getAssets({ owner })` reads the first page of that account's holdings. The `data` field on each row is the merged view of template and asset data, so the first entry is the first attribute the asset actually resolves to.

Every value printed passes through `printable()` first. Asset data is written by whoever minted the asset, and a terminal acts on what it is handed, so an escape sequence in a name would otherwise rewrite the rows around it.

A failed read exits non-zero and names the account. An empty list means the account holds nothing, which is a different answer from a failure and is printed as one.

## The tests

```
npm test
```

Five propositions run under `node --test`. One reads the live endpoint and asserts the shape of what comes back; it skips itself when the host refuses a connection, so a run without a network reports a skip rather than a failure. An HTTP error is not a skip: the API answering with an error is the drift these starters exist to catch. The other four run offline against a row captured from the API, covering the attribute pick, an asset that resolves no attributes, the control-character guard, and the column cut.

## Residual risk

This starter signs nothing and holds no key, so there is no credential to leak. What remains is that it prints data it did not write: asset names and attribute values come from whoever minted the asset, and they reach a terminal that acts on control characters. `printable()` is the bound on that, and it is a rendering guard rather than a validator, so treat the values as untrusted anywhere else you take them. It also reads a public endpoint over the network, which can be slow, rate limited, or down, and a failed read is reported rather than retried.

## License

MIT, see LICENSE.
