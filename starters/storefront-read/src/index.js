#!/usr/bin/env node
/**
 * Prints the live sales of one collection on WAX mainnet: sale id, price,
 * seller, and the listed asset.
 *
 * Usage: node src/index.js [collection]
 */
import { DEFAULT_COLLECTION, formatRow, readSales } from './sales.js';

const collection = process.argv[2] ?? DEFAULT_COLLECTION;

async function main() {
  const rows = await readSales(collection);

  if (rows.length === 0) {
    console.log(`${collection} has no listed sales.`);

    return;
  }

  console.log(`${rows.length} of the sales listed for ${collection} on WAX mainnet:`);

  for (const row of rows) {
    console.log(formatRow(row));
  }
}

main().catch((error) => {
  // The read is the whole starter, so a failure exits non-zero rather than
  // printing an empty list that reads like a collection nobody is selling.
  console.error(`Reading the sales of ${collection} failed: ${error.message}`);
  process.exitCode = 1;
});
