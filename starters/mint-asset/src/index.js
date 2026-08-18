#!/usr/bin/env node
/**
 * Signs `createschema` and `mintasset` in one transaction on WAX testnet, then
 * reads the minted asset back through the testnet API.
 *
 * Usage: WAX_TESTNET_ACTOR=... WAX_TESTNET_PRIVATE_KEY=... node src/index.js [collection]
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { missingCredentials, skipMessage } from './credentials.js';
import { buildMint, deriveSchemaName, newestCollection, readMintedAsset } from './mint.js';
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
  const collectionName = process.argv[2] ?? (await newestCollection(actor));

  if (collectionName === null) {
    throw new Error(
      `${actor} authors no collection on WAX testnet. Run the create-collection starter first, ` +
        'or name a collection on the command line.',
    );
  }

  const schemaName = deriveSchemaName();
  const actions = buildMint(actor, collectionName, schemaName);

  console.log(
    `Signing createschema and mintasset for ${collectionName}/${schemaName} as ${actor}@active on WAX testnet.`,
  );

  const session = openSession(process.env);
  const result = await session.transact({
    actions: actions.map((action) => ({ ...action, authorization: [session.permissionLevel] })),
  });

  console.log(`The chain accepted transaction ${transactionId(result)}.`);

  for (let attempt = 1; attempt <= INDEX_ATTEMPTS; attempt += 1) {
    const asset = await readMintedAsset(collectionName, schemaName, actor);

    if (asset !== null) {
      console.log(`The API now serves asset ${asset.asset_id}, named ${asset.name}, owned by ${asset.owner}.`);

      return;
    }

    await sleep(INDEX_DELAY_MS);
  }

  throw new Error(
    `the chain accepted the transaction and the API had not served an asset in ${collectionName}/${schemaName} ` +
      `after ${(INDEX_ATTEMPTS * INDEX_DELAY_MS) / 1000} seconds`,
  );
}

main().catch((error) => {
  console.error(`The mint failed: ${error.message}`);
  process.exitCode = 1;
});
