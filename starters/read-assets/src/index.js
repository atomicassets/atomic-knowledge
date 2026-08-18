#!/usr/bin/env node
/**
 * Prints the assets one WAX mainnet account holds: asset id, name, collection,
 * and the first attribute the asset resolves to.
 *
 * Usage: node src/index.js [account]
 */
import { DEFAULT_ACCOUNT, formatRow, readAssets } from './assets.js';

const account = process.argv[2] ?? DEFAULT_ACCOUNT;

async function main() {
  const rows = await readAssets(account);

  if (rows.length === 0) {
    console.log(`${account} holds no assets.`);

    return;
  }

  console.log(`${rows.length} of the assets ${account} holds on WAX mainnet:`);

  for (const row of rows) {
    console.log(formatRow(row));
  }
}

main().catch((error) => {
  // The read is the whole starter, so a failure exits non-zero rather than
  // printing an empty list that reads like an account holding nothing.
  console.error(`Reading the assets of ${account} failed: ${error.message}`);
  process.exitCode = 1;
});
