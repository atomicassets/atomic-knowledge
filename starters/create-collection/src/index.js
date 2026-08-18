#!/usr/bin/env node
/**
 * Signs `createcol` on WAX testnet for a throwaway collection named after the
 * signing account, then reads the collection back through the testnet API.
 *
 * Usage: WAX_TESTNET_ACTOR=... WAX_TESTNET_PRIVATE_KEY=... node src/index.js
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { buildCreateCollection, deriveCollectionName, readCollection } from './collection.js';
import { missingCredentials, skipMessage } from './credentials.js';
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
  const collectionName = deriveCollectionName(actor);
  const action = buildCreateCollection(actor, collectionName);

  console.log(`Signing createcol for ${collectionName} as ${actor}@active on WAX testnet.`);

  const session = openSession(process.env);
  const result = await session.transact({
    action: { ...action, authorization: [session.permissionLevel] },
  });

  console.log(`The chain accepted transaction ${transactionId(result)}.`);

  for (let attempt = 1; attempt <= INDEX_ATTEMPTS; attempt += 1) {
    const collection = await readCollection(collectionName);

    if (collection !== null) {
      console.log(`The API now serves ${collection.collection_name}, authored by ${collection.author}.`);

      return;
    }

    await sleep(INDEX_DELAY_MS);
  }

  throw new Error(
    `the chain accepted the transaction and the API had not served ${collectionName} ` +
      `after ${(INDEX_ATTEMPTS * INDEX_DELAY_MS) / 1000} seconds`,
  );
}

main().catch((error) => {
  console.error(`createcol failed: ${error.message}`);
  process.exitCode = 1;
});
