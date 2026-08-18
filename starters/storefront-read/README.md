# Read a collection's live sales

Prints the sale id, the price, the seller, and the listed asset for the sales one collection has open on WAX mainnet. It signs nothing and needs no key, no account, and no registration: the hosted API answers an anonymous request.

## Run it

```
npm install
node src/index.js
node src/index.js somecollectn
```

With no argument the read is against alien.worlds, which lists continuously. Output is one line per sale:

```
5 of the sales listed for alien.worlds on WAX mainnet:
 173903111         78.00000000 WAX  sj.3a.c.wam     1099512475721  Kite Axe
```

## What it reads

`marketApiForNetwork('wax')` from `@atomichub/atomicmarket` builds a client against `https://wax.api.atomicassets.io`, and `getSales` reads the collection's rows newest first. The state filter is `SaleState.Listed`, which leaves out the sold, cancelled, and invalid rows a storefront must not offer.

`price.amount` is an integer in the token's smallest unit, and `price.token_precision` says where the point goes. The SDK's own `formatQuantity` renders the pair, because a price rendered at a precision nobody chose is a wrong price with nothing downstream to catch it. AtomicMarket v2 lists one asset per sale; a row carrying several is a legacy v1 bundle, and this starter names the first of them.

A failed read exits non-zero and names the collection. An empty list means nothing is listed, which is a different answer from a failure and is printed as one.

## The tests

```
npm test
```

Five propositions run under `node --test`. One reads the live endpoint and asserts the shape of what comes back; it skips itself when the host refuses a connection, so a run without a network reports a skip rather than a failure. An HTTP error is not a skip: the API answering with an error is the drift these starters exist to catch. The other four run offline against a row captured from the API, covering the rendered price, a price below one whole token, a legacy bundle, and the control-character guard.

## Residual risk

This starter signs nothing and holds no key, so there is no credential to leak. What remains is that it prints data it did not write: seller names, asset names, and collection names come from the chain, and they reach a terminal that acts on control characters. `printable()` is the bound on that, and it is a rendering guard rather than a validator, so treat the values as untrusted anywhere else you take them. The prices are another such value: a storefront that renders one at a precision it chose itself shows a wrong price, which is why `formatQuantity` renders the pair the API serves. The starter also reads a public endpoint over the network, which can be slow, rate limited, or down, and a failed read is reported rather than retried.

## License

MIT, see LICENSE.
