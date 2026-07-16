---
scope: atomicassets-api realtime surface - Socket.IO namespaces, events, room subscription, connection shape, and the absence of socket auth or app-layer limits
depends-on: []
key-modules:
    - "atomicassets-api (main, f6419858): src/api/server.ts, src/api/utils.ts, src/api/notification.ts, src/api/namespaces/*/routes/*.ts"
---

# atomicassets-api realtime (Socket.IO)

## Transport, path, and connection URL shape

The API attaches a Socket.IO server to the same HTTP server that serves the REST endpoints, so realtime and REST share one host and port. The server is constructed with `transports: ['websocket']`, `allowEIO3: true`, and `cors: {origin: '*'}`, so clients connect over the WebSocket transport only (HTTP long-polling is disabled) and both Engine.IO v3 and v4 clients are accepted from any origin. The Engine.IO path is the Socket.IO default `/socket.io`; realtime channels are Socket.IO namespaces, not URL routes. A client selects a channel by connecting to the namespace whose name matches the REST path plus the resource, for example `wss://wax.api.atomicassets.io/atomicmarket/v1/sales`. Use a Socket.IO v4 client (the server is `socket.io ^4.8.3`); pin the client to the server's major and force the WebSocket transport, because the default transport list starts with polling, which this server does not serve.

Source: `atomicassets-api (main, f6419858) src/api/server.ts` (`SocketServer`, `new Server(..., {transports: ['websocket'], allowEIO3: true, cors: {origin: '*'}})`), `package.json` (`socket.io`), `src/api/utils.ts` (`createSocketApiNamespace` maps namespace name to `<namespace path>/v1/<resource>`); live probe of `wss://wax.api.atomicassets.io` connecting to five namespaces over the WebSocket transport (all handshakes succeeded)

## Namespace and event catalog

Each namespace name is the configured namespace path (`/atomicassets`, `/atomicmarket`, `/atomictools` on the reference deployment) followed by the resource path. Namespace paths are operator config (`namespaces[].path`), so a non-default deployment can serve them under other prefixes. Every event payload is a plain object carrying the triggering `transaction`, `block`, and `trace`, the affected entity id, and the fully formatted entity row (the same shape the matching REST endpoint returns), except `fork`, whose payload is only `{block_num}`.

| Namespace | Event | Fired on (action trace) | Room |
| --- | --- | --- | --- |
| `/atomicassets/v1/assets` | `new_asset` | `logmint` | none (whole namespace) |
| `/atomicassets/v1/assets` | `burn` | `logburnasset` | none |
| `/atomicassets/v1/assets` | `back` | `logbackasset` | none, gated on `socket_features.asset_update` |
| `/atomicassets/v1/assets` | `update` | `logsetdata` | none, gated on `socket_features.asset_update` |
| `/atomicassets/v1/offers` | `create` | `lognewoffer` | none |
| `/atomicassets/v1/offers` | `new_transfer` | `logtransfer` | none |
| `/atomicmarket/v1/sales` | `new_sale` | `lognewsale` | `new_sales` |
| `/atomicmarket/v1/sales` | `purchased_sale` | `purchasesale` | `purchased_sales` |
| `/atomicmarket/v1/auctions` | `new_auction` | `lognewauct` | `new_auctions` |
| `/atomicmarket/v1/auctions` | `new_bid` | `auctionbid` | `new_bids` |
| `/atomicmarket/v1/buyoffers` | `new_buyoffer` | `lognewbuyo` | `new_buyoffers` |

Every listed namespace also emits `fork` (payload `{block_num}`) to the whole namespace when the connected reader rolls back a microfork, so a consumer holding optimistic state can invalidate everything at or after that block. The `back` and `update` asset events are emitted only when the atomicassets namespace is configured with `socket_features.asset_update: true`; the reference config ships it `false`, so a default deployment broadcasts `new_asset`, `burn`, and `fork` on the assets namespace and nothing else. The `atomictools` namespace registers no socket handler, so it exposes no realtime events even though its REST namespace exists.

Source: `atomicassets-api (main, f6419858) src/api/namespaces/atomicassets/routes/assets.ts` (`new_asset`/`burn`/`back`/`update`/`fork`, `asset_update` gate), `.../atomicassets/routes/offers.ts` (`create`), `.../atomicassets/routes/transfers.ts` (`new_transfer`), `.../atomicmarket/routes/sales.ts` (`new_sale`/`purchased_sale`), `.../atomicmarket/routes/auctions.ts` (`new_auction`/`new_bid`), `.../atomicmarket/routes/buyoffers.ts` (`new_buyoffer`), `.../atomicmarket/index.ts` (`socket()` wires sales/auctions/buyoffers), `.../atomictools/index.ts` (empty `socket()`), `config/server.config.example.json` (`socket_features.asset_update: false`)

## What triggers a broadcast

Socket events are not driven by the API's own database writes. The filler's notifier publishes each batch of matching action traces and table deltas to a Redis pub/sub channel named `eosio-contract-api:<chain>:<reader>:api`; the API subscribes to that channel through `ApiNotificationReceiver`, and each socket route registered an `onData(<channel>, ...)` listener that queries the affected rows and emits the socket event. A deployment therefore broadcasts realtime events only when its API process shares Redis with a running filler whose reader is configured to publish notifications; an API pointed at a database with no live notifier serves REST normally but stays silent on every namespace. Connecting to a namespace succeeds regardless, because the handshake is independent of whether any notifier is publishing.

Source: `atomicassets-api (main, f6419858) src/api/notification.ts` (`ApiNotificationReceiver`, channel `eosio-contract-api:<chain>:<reader>:api`), `src/api/namespaces/*/index.ts` (`socket()` constructs the receiver from `args.connected_reader` and registers the per-resource `onData` listeners); live probe held five namespaces open for 30 and 50 second windows and observed no events, consistent with connectivity being independent of notifier traffic

## Market namespaces gate events behind opt-in rooms; asset and offer namespaces do not

The three atomicmarket namespaces broadcast their entity events only to Socket.IO rooms, and a fresh connection joins none of them. A client opts in by emitting a `subscribe` event whose payload sets each wanted room to a truthy value; the same handler leaves any room whose flag is absent or falsy, so `subscribe` is the full membership list on every call, not an additive toggle. The room names are `new_sales` and `purchased_sales` on `/atomicmarket/v1/sales`, `new_auctions` and `new_bids` on `/atomicmarket/v1/auctions`, and `new_buyoffers` on `/atomicmarket/v1/buyoffers`. Without a `subscribe` the market namespaces deliver only `fork`, which is broadcast namespace-wide. The `/atomicassets/v1/assets` and `/atomicassets/v1/offers` namespaces use no rooms: every subscriber receives every event the moment it connects, with no `subscribe` step.

Source: `atomicassets-api (main, f6419858) src/api/namespaces/atomicmarket/routes/sales.ts`, `.../auctions.ts`, `.../buyoffers.ts` (each `namespace.on('connection', ...)` with a `subscribe` handler over a fixed `availableRooms` list; entity events use `namespace.in('<room>').emit(...)` while `fork` uses `namespace.emit(...)`), `.../atomicassets/routes/assets.ts` and `.../offers.ts` (no connection handler, all events via `namespace.emit(...)`)

## Transfers ride the offers namespace

There is no `/v1/transfers` Socket.IO namespace. The transfers socket handler registers on `<namespace path>/v1/offers`, the same namespace the offers handler uses, so `logtransfer` broadcasts arrive as the `new_transfer` event on `/atomicassets/v1/offers` alongside the offer `create` event. A consumer that wants transfer events must connect to the offers namespace and listen for `new_transfer`; connecting to a `/v1/transfers` namespace name yields a valid but permanently silent connection.

Source: `atomicassets-api (main, f6419858) src/api/namespaces/atomicassets/routes/transfers.ts` (`createSocketApiNamespace(this.server, this.core.path + '/v1/offers')`), `.../offers.ts` (same namespace path)

## Template buyoffers emit no socket events at this commit

`reference/api.md` records that template-buyoffer socket notifications fire only for new offers, never for cancellation or fulfillment. The source is consistent with and narrower than that: the `templateBuyofferSockets` handler emits `new_template_buyoffer` only on `lognewtbuyo` and has no cancel or fulfill branch, but at this commit that handler is defined and never called. The atomicmarket namespace's `socket()` wires only the sales, auction, and buyoffer handlers, so `/atomicmarket/v1/template_buyoffers` accepts connections and its `new_template_buyoffers` room exists in the dead code, yet no template-buyoffer event is broadcast. Track template-buyoffer state changes by polling `/atomicmarket/v1/template_buyoffers` rather than over the socket. Re-check this when the notifier wiring changes, since it is a one-line registration away from going live.

Source: `atomicassets-api (main, f6419858) src/api/namespaces/atomicmarket/routes/template-buyoffers.ts` (`templateBuyofferSockets` defined, emits only on `lognewtbuyo`), `src/api/namespaces/atomicmarket/index.ts` (`socket()` calls `salesSockets`, `auctionSockets`, `buyofferSockets` only; no reference to `templateBuyofferSockets` anywhere in the tree)

## Socket connections carry no app-layer auth or rate limit

The Socket.IO server registers no connection or handshake middleware, so namespace connections are unauthenticated and uncapped by the application: any client may open any namespace and, on the market namespaces, `subscribe` to any room. The express-rate-limit middleware documented in `reference/api.md` is mounted on the REST namespace paths and never sees the WebSocket upgrade, which Socket.IO intercepts on the HTTP server ahead of express, so REST rate limiting does not bound socket connections or event volume. Any connection ceiling a consumer hits in practice comes from a fronting proxy or CDN, not the API. Treat the reference deployment's actual socket exposure as operator- and edge-specific, not a software guarantee.

Source: `atomicassets-api (main, f6419858) src/api/server.ts` (`SocketServer` constructs `new Server(...)` with no `io.use(...)` and no per-namespace auth; the express `limiter` is mounted per REST namespace path in `src/api/namespaces/*/index.ts`, not on the Socket.IO server)

## Consumption example

The snippet below is the exact client used to validate the surface against the hosted WAX deployment. It connects to the busy assets namespace and to the sales namespace, opts into both sales rooms, logs every event, and disconnects. It requires a Socket.IO v4 client (`npm install socket.io-client@4`) and forces the WebSocket transport.

```js
const { io } = require('socket.io-client');

const HOST = 'https://wax.api.atomicassets.io';

// Asset and offer namespaces need no subscribe: every event arrives on connect.
const assets = io(HOST + '/atomicassets/v1/assets', { transports: ['websocket'] });
assets.on('connect', () => console.log('assets connected', assets.id));
assets.on('new_asset', (e) => console.log('mint', e.asset_id, 'block', e.block.block_num));
assets.on('burn', (e) => console.log('burn', e.asset_id));
assets.on('fork', (e) => console.log('fork at', e.block_num));

// Market namespaces gate entity events behind rooms; subscribe on connect.
// Each subscribe call is the full room list, not an additive toggle.
const sales = io(HOST + '/atomicmarket/v1/sales', { transports: ['websocket'] });
sales.on('connect', () => {
    console.log('sales connected', sales.id);
    sales.emit('subscribe', { new_sales: true, purchased_sales: true });
});
sales.on('new_sale', (e) => console.log('new sale', e.sale_id));
sales.on('purchased_sale', (e) => console.log('purchased', e.sale_id));
```

Source: live run against `wss://wax.api.atomicassets.io` with `socket.io-client 4.8.3`; every namespace handshake succeeded, confirming the namespace names and the WebSocket-only transport
