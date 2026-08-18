import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { API_HOST, DEFAULT_ACCOUNT, formatRow, printable, readAssets, summarizeAsset } from '../src/assets.js';

// Captured from GET https://wax.api.atomicassets.io/atomicassets/v1/assets/1099925383114
// and trimmed to the fields these propositions read. The shape belongs to the
// API, so it is captured from the API rather than written to match the code.
const row = JSON.parse(await readFile(new URL('./asset-row.fixture.json', import.meta.url), 'utf8'));

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

test('a live read returns rows carrying an asset id, a collection, and an attribute', async (t) => {
  if (!(await online())) {
    t.skip(`${API_HOST} refused a connection, so this proposition needs a network`);

    return;
  }

  const rows = await readAssets(DEFAULT_ACCOUNT, 3);

  assert.ok(rows.length > 0, `${DEFAULT_ACCOUNT} holds assets, so the first page is never empty`);

  for (const summary of rows) {
    assert.match(summary.assetId, /^\d+$/);
    assert.match(summary.collection, /^[a-z1-5.]{1,12}$/);
    assert.ok(summary.attribute === null || typeof summary.attribute.name === 'string');
  }
});

test('a summary carries the asset id, the name, the collection, and the first attribute', () => {
  assert.deepEqual(summarizeAsset(row), {
    assetId: '1099925383114',
    name: 'Standard Shovel',
    collection: 'alien.worlds',
    attribute: { name: 'img', value: 'QmYm1FG7LxhF3mFUaVmVEVqRztEmByVbHwL6ZWXwVY2dvb' },
  });
});

test('an asset that resolves no attributes summarizes to a null attribute', () => {
  const summary = summarizeAsset({ ...row, data: {} });

  assert.equal(summary.attribute, null);
  assert.equal(formatRow(summary).endsWith('no attributes'), true);
});

test('a control character in asset data cannot rewrite the printed row', () => {
  const summary = summarizeAsset({ ...row, name: 'Shovel\u001b[2Krewritten\nsecond line' });
  const line = formatRow(summary);

  assert.equal(line.includes('\u001b'), false);
  assert.equal(line.includes('\n'), false);
  assert.equal(printable('abc'), 'abc');
});

test('a printed value is cut to the column width', () => {
  assert.equal(printable('x'.repeat(60), 10), `${'x'.repeat(7)}...`);
});
