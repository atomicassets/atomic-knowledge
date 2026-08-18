import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { API_HOST, DEFAULT_COLLECTION, formatRow, readSales, summarizeSale } from '../src/sales.js';

// Captured from GET /atomicmarket/v1/sales?collection_name=alien.worlds&state=1
// on https://wax.api.atomicassets.io, the route getSales calls, and trimmed to
// the fields these propositions read. The shape and the integer amount belong
// to the API, so they are captured from the API rather than written to match
// the code.
const row = JSON.parse(await readFile(new URL('./sale-row.fixture.json', import.meta.url), 'utf8'));

/**
 * Answers whether the API host accepts a connection. Only a connect-class
 * failure counts as offline: an HTTP error is the API answering, and a test
 * that skipped on that would hide the drift these starters run to catch. The
 * SDK replaces the cause of a failed fetch with a 500, so the probe is a bare
 * fetch rather than an SDK call.
 */
async function online() {
  try {
    await fetch(`${API_HOST}/health`);

    return true;
  } catch {
    return false;
  }
}

test('a live read returns listed sales carrying a price, a seller, and an asset', async (t) => {
  if (!(await online())) {
    t.skip(`${API_HOST} refused a connection, so this proposition needs a network`);

    return;
  }

  const rows = await readSales(DEFAULT_COLLECTION, 3);

  assert.ok(rows.length > 0, `${DEFAULT_COLLECTION} lists continuously, so the first page is never empty`);

  for (const summary of rows) {
    assert.match(summary.saleId, /^\d+$/);
    assert.match(summary.price, /^\d+(\.\d+)? [A-Z]{1,7}$/);
    assert.match(summary.seller, /^[a-z1-5.]{1,12}$/);
    assert.match(summary.assetId, /^\d+$/);
  }
});

test('a summary renders the price at the token precision and names the seller and the asset', () => {
  assert.deepEqual(summarizeSale(row), {
    saleId: '173901315',
    price: '82.99554999 WAX',
    seller: 'luckynfts.gm',
    assetId: '1099515375551',
    assetName: 'Widow Maker',
  });
});

test('a price below one whole token keeps its leading zeros', () => {
  const summary = summarizeSale({ ...row, price: { ...row.price, amount: '5' } });

  assert.equal(summary.price, '0.00000005 WAX');
});

test('a legacy bundle row names its first asset', () => {
  const second = { ...row.assets[0], asset_id: '1099515375552', name: 'Second Asset' };
  const summary = summarizeSale({ ...row, assets: [...row.assets, second] });

  assert.equal(summary.assetId, '1099515375551');
});

test('a control character in a seller name cannot rewrite the printed row', () => {
  const line = formatRow(summarizeSale({ ...row, seller: 'seller\u001b[2K.wam' }));

  assert.equal(line.includes('\u001b'), false);
});
