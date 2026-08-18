#!/usr/bin/env node
/**
 * Signs the AtomicMarket listing pair on WAX testnet, announcing a sale for one
 * asset and offering that asset to the market contract, then reads the sale
 * back through the testnet API.
 *
 * Usage: WAX_TESTNET_ACTOR=... WAX_TESTNET_PRIVATE_KEY=... node src/index.js [asset_id] [price]
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { missingCredentials, skipMessage } from './credentials.js';
import { buildListing, DEFAULT_LISTING_PRICE, newestAsset, readSale } from './listing.js';
import { openSession } from './session.js';

/** Bounds the wait for the indexer. A commit and an indexed row are two facts. */
const INDEX_ATTEMPTS = 15;
const INDEX_DELAY_MS = 2000;

/** The id the node returned, or the one the session resolved before broadcast. */
function transactionId(result) {
  const broadcast = result.response?.transaction_id;

  if (typeof broadcast === 'string') {
    return broadcast;
  }

  const resolved = result.resolved?.transaction?.id;

  return resolved === undefined ? '(none returned)' : String(resolved);
}

async function main() {
  const missing = missingCredentials(process.env);

  if (missing.length > 0) {
    console.log(skipMessage(missing));

    return;
  }

  const actor = process.env.WAX_TESTNET_ACTOR.trim();
  const assetId = process.argv[2] ?? (await newestAsset(actor));
  const listingPrice = process.argv[3] ?? DEFAULT_LISTING_PRICE;

  if (assetId === null) {
    throw new Error(
      `${actor} owns no asset on WAX testnet. Run the mint-asset starter first, ` +
        'or name an asset id on the command line.',
    );
  }

  const actions = buildListing(actor, [assetId], listingPrice);

  console.log(`Listing asset ${assetId} at ${listingPrice} as ${actor}@active on WAX testnet.`);

  const session = openSession(process.env);
  const result = await session.transact({
    actions: actions.map((action) => ({ ...action, authorization: [session.permissionLevel] })),
  });

  console.log(`The chain accepted transaction ${transactionId(result)}.`);

  for (let attempt = 1; attempt <= INDEX_ATTEMPTS; attempt += 1) {
    const sale = await readSale(actor, assetId);

    if (sale !== null) {
      console.log(`The API now serves sale ${sale.sale_id}, offer ${sale.offer_id}, asking ${listingPrice}.`);

      return;
    }

    await sleep(INDEX_DELAY_MS);
  }

  throw new Error(
    `the chain accepted the transaction and the API had not served a listed sale for asset ${assetId} ` +
      `after ${(INDEX_ATTEMPTS * INDEX_DELAY_MS) / 1000} seconds`,
  );
}

main().catch((error) => {
  console.error(`The listing failed: ${error.message}`);
  process.exitCode = 1;
});
