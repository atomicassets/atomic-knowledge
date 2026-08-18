import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import { buildCreateCollection, deriveCollectionName } from '../src/collection.js';
import { CREDENTIALS, missingCredentials, skipMessage } from '../src/credentials.js';

const run = promisify(execFile);
const entrypoint = new URL('../src/index.js', import.meta.url).pathname;

/**
 * Runs the command with the two credentials removed from its environment,
 * whatever the ambient environment holds. A run inside the signing arm of
 * continuous integration has both variables set, and a skip-path proposition
 * that read them would sign instead of proving the skip.
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
  const { stdout } = await runWithout({ WAX_TESTNET_ACTOR: 'starterdemo1' });

  assert.match(stdout, /^WAX_TESTNET_PRIVATE_KEY is not set/);
  assert.equal(stdout.includes('WAX_TESTNET_ACTOR is not set'), false);
});

test('a variable set to whitespace counts as absent', () => {
  assert.deepEqual(missingCredentials({ WAX_TESTNET_ACTOR: '   ', WAX_TESTNET_PRIVATE_KEY: 'PVT_K1_xxx' }), [
    'WAX_TESTNET_ACTOR',
  ]);
  assert.deepEqual(
    missingCredentials({ WAX_TESTNET_ACTOR: 'starterdemo1', WAX_TESTNET_PRIVATE_KEY: 'PVT_K1_xxx' }),
    [],
  );
});

test('the skip message agrees in number with the variables it names', () => {
  assert.equal(
    skipMessage(['WAX_TESTNET_PRIVATE_KEY']),
    'WAX_TESTNET_PRIVATE_KEY is not set, so this starter signed nothing. Set both to run it against WAX testnet.',
  );
  assert.equal(
    skipMessage(CREDENTIALS),
    'WAX_TESTNET_ACTOR and WAX_TESTNET_PRIVATE_KEY are not set, so this starter signed nothing. '
      + 'Set both to run it against WAX testnet.',
  );
});

test('a derived name is twelve characters of the name alphabet and carries no dot', () => {
  const name = deriveCollectionName('starterdemo1');

  assert.equal(name.length, 12);
  assert.match(name, /^[a-z1-5]{12}$/);
});

test('a derived name carries the actor and pads one shorter than six characters', () => {
  const entropy = Uint8Array.from([0, 0, 0, 0, 0, 0]);

  assert.equal(deriveCollectionName('starter.wam', entropy), 'starteaaaaaa');
  assert.equal(deriveCollectionName('ab', entropy), 'abaaaaaaaaaa');
});

test('two derivations from one actor differ, so a second run does not collide', () => {
  const first = deriveCollectionName('starterdemo1');
  const second = deriveCollectionName('starterdemo1');

  assert.notEqual(first, second);
  assert.equal(first.slice(0, 6), second.slice(0, 6));
});

test('a derivation refuses entropy too short to fill the tail', () => {
  assert.throws(
    () => deriveCollectionName('starterdemo1', Uint8Array.from([1, 2, 3])),
    /entropy holds 3 bytes, and a derived name needs six/,
  );
});

test('the action is createcol on atomicassets, authorizing the author and charging no market fee', () => {
  const action = buildCreateCollection('starterdemo1', 'starterdemoa');

  assert.deepEqual(action, {
    account: 'atomicassets',
    name: 'createcol',
    data: {
      author: 'starterdemo1',
      collection_name: 'starterdemoa',
      allow_notify: true,
      authorized_accounts: ['starterdemo1'],
      notify_accounts: [],
      market_fee: 0,
      data: [{ key: 'name', value: ['string', 'Starter collection'] }],
    },
  });
});

test('a market fee that is not a finite number fails before an action exists', () => {
  // NaN has no JSON form, so an unguarded one reaches the signer as null and
  // the mistake is gone before the chain can name it.
  assert.throws(
    () => buildCreateCollection('starterdemo1', 'starterdemoa', Number.NaN),
    /market_fee NaN is not a finite number/,
  );
});
