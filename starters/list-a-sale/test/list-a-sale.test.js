import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import { CREDENTIALS } from '../src/credentials.js';
import { assertPlainListing, buildListing, readQuantity } from '../src/listing.js';

const run = promisify(execFile);
const entrypoint = new URL('../src/index.js', import.meta.url).pathname;

const ASSET = '2199024342156';

/**
 * Runs the command with the two credentials removed from its environment,
 * whatever the ambient environment holds. A run inside the signing arm of
 * continuous integration has both variables set, and a skip-path proposition
 * that read them would list instead of proving the skip.
 *
 * @param {Record<string, string>} overrides variables to add back
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runWithout(overrides = {}) {
  const env = { ...process.env };

  for (const name of CREDENTIALS) {
    delete env[name];
  }

  return run(process.execPath, [entrypoint], { env: { ...env, ...overrides } });
}

test('the command exits zero and names both variables when neither is set', async () => {
  // execFile rejects on a non-zero exit, so reaching the assertion is the
  // exit-zero half of the proposition.
  const { stdout } = await runWithout();

  assert.match(stdout, /WAX_TESTNET_ACTOR and WAX_TESTNET_PRIVATE_KEY are not set/);
  assert.match(stdout, /signed nothing/);
});

test('the command names only the variable that is missing', async () => {
  const { stdout } = await runWithout({ WAX_TESTNET_ACTOR: 'mycreator11' });

  assert.match(stdout, /^WAX_TESTNET_PRIVATE_KEY is not set/);
  assert.equal(stdout.includes('WAX_TESTNET_ACTOR is not set'), false);
});

test('the listing is announcesale on atomicmarket, then createoffer on atomicassets', () => {
  // The order is the contract's, not this starter's: announcing alone lists
  // nothing and offering alone dangles.
  const actions = buildListing('mycreator11', [ASSET]);

  assert.deepEqual(
    actions.map((action) => [action.account, action.name]),
    [
      ['atomicmarket', 'announcesale'],
      ['atomicassets', 'createoffer'],
    ],
  );
});

test('the offer carries the memo sale and asks the market contract for nothing back', () => {
  const [, createoffer] = buildListing('mycreator11', [ASSET]);

  assert.deepEqual(createoffer.data, {
    sender: 'mycreator11',
    recipient: 'atomicmarket',
    sender_asset_ids: [ASSET],
    recipient_asset_ids: [],
    memo: 'sale',
  });
});

test('the announcement carries the seller, the asset, the price, and the seeded marketplace', () => {
  const [announcesale] = buildListing('mycreator11', [ASSET], '12.50000000 WAX');

  assert.deepEqual(announcesale.data, {
    seller: 'mycreator11',
    asset_ids: [ASSET],
    listing_price: '12.50000000 WAX',
    settlement_symbol: '8,WAX',
    maker_marketplace: '',
  });
});

test('a listing naming more than one asset is refused before an action exists', () => {
  // The composer builds a bundle without complaint, because asset counts are
  // chain state it is not handed. V2 announcesale then rejects the transaction.
  assert.throws(
    () => buildListing('mycreator11', [ASSET, '2199024342157']),
    /a sale lists exactly one asset and this one names 2/,
  );
  assert.throws(() => buildListing('mycreator11', []), /a sale lists exactly one asset and this one names 0/);
});

test('a price and a settlement symbol naming different symbols are refused', () => {
  assert.throws(
    () => assertPlainListing([ASSET], '1.00 USD', '8,WAX'),
    /name different symbols/,
  );
  assert.throws(
    () => assertPlainListing([ASSET], '1.00 WAX', '8,WAX'),
    /name different symbols/,
  );
});

test('a listing price that is not a chain quantity is refused', () => {
  assert.throws(() => assertPlainListing([ASSET], '1 WAX token', '8,WAX'), /is not a chain quantity/);
  assert.throws(() => assertPlainListing([ASSET], '1.00000000wax', '8,WAX'), /is not a chain quantity/);
});

test('a quantity is read at the precision it is written, zero decimals included', () => {
  assert.deepEqual(readQuantity('1.00000000 WAX'), { precision: 8, code: 'WAX' });
  assert.deepEqual(readQuantity('100 KARMA'), { precision: 0, code: 'KARMA' });
  assert.equal(readQuantity('1.0 wax'), null);
});
