import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import { CREDENTIALS } from '../src/credentials.js';
import { buildMint, deriveSchemaName, SCHEMA_FORMAT, TEMPLATELESS } from '../src/mint.js';

const run = promisify(execFile);
const entrypoint = new URL('../src/index.js', import.meta.url).pathname;

/**
 * Runs the command with the two credentials removed from its environment,
 * whatever the ambient environment holds. A run inside the signing arm of
 * continuous integration has both variables set, and a skip-path proposition
 * that read them would mint instead of proving the skip.
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
  const { stdout } = await runWithout({ WAX_TESTNET_PRIVATE_KEY: 'PVT_K1_placeholder' });

  assert.match(stdout, /^WAX_TESTNET_ACTOR is not set/);
  assert.equal(stdout.includes('WAX_TESTNET_PRIVATE_KEY is not set'), false);
});

test('a derived schema name is twelve characters of the name alphabet', () => {
  const name = deriveSchemaName();

  assert.equal(name.length, 12);
  assert.match(name, /^starter[a-z1-5]{5}$/);
});

test('two derivations differ, so a second run writes its own schema', () => {
  assert.notEqual(deriveSchemaName(), deriveSchemaName());
});

test('a derivation refuses entropy too short to fill the tail', () => {
  assert.throws(
    () => deriveSchemaName(Uint8Array.from([1, 2])),
    /entropy holds 2 bytes, and a derived schema name needs five/,
  );
});

test('the mint is createschema then mintasset, both on atomicassets', () => {
  const actions = buildMint('mycreator11', 'mycollectn1', 'starteraaaaa');

  assert.deepEqual(
    actions.map((action) => [action.account, action.name]),
    [
      ['atomicassets', 'createschema'],
      ['atomicassets', 'mintasset'],
    ],
  );
});

test('the schema format carries the name and string line the contract requires', () => {
  // createschema aborts on a format that omits it, so this line is a contract
  // requirement rather than a field this starter happens to want.
  assert.deepEqual(SCHEMA_FORMAT[0], { name: 'name', type: 'string' });

  const [createschema] = buildMint('mycreator11', 'mycollectn1', 'starteraaaaa');

  assert.deepEqual(createschema.data, {
    authorized_creator: 'mycreator11',
    collection_name: 'mycollectn1',
    schema_name: 'starteraaaaa',
    schema_format: SCHEMA_FORMAT,
  });
});

test('the mint is templateless, backs no tokens, and bills the minter', () => {
  const [, mintasset] = buildMint('mycreator11', 'mycollectn1', 'starteraaaaa');

  assert.equal(mintasset.data.template_id, TEMPLATELESS);
  assert.deepEqual(mintasset.data.tokens_to_back, []);
  assert.equal(mintasset.data.authorized_minter, 'mycreator11');
  assert.equal(mintasset.data.new_asset_owner, 'mycreator11');
});

test('the immutable data is the attribute map the contract stores', () => {
  const [, mintasset] = buildMint('mycreator11', 'mycollectn1', 'starteraaaaa', {
    name: 'Starter asset',
    img: 'QmYm1FG7LxhF3mFUaVmVEVqRztEmByVbHwL6ZWXwVY2dvb',
    power: 7,
  });

  assert.deepEqual(mintasset.data.immutable_data, [
    { key: 'name', value: ['string', 'Starter asset'] },
    { key: 'img', value: ['string', 'QmYm1FG7LxhF3mFUaVmVEVqRztEmByVbHwL6ZWXwVY2dvb'] },
    { key: 'power', value: ['uint32', 7] },
  ]);
  assert.deepEqual(mintasset.data.mutable_data, []);
});

test('an attribute the schema does not type fails before an action exists', () => {
  assert.throws(
    () => buildMint('mycreator11', 'mycollectn1', 'starteraaaaa', { rarity: 'Abundant' }),
    /no type given for field 'rarity'/,
  );
});

test('a template id that is not an int32 fails before an action exists', () => {
  // A string-to-number conversion that produced a NaN would otherwise reach the
  // signer as null, because JSON has no form for it.
  assert.throws(
    () => buildMint('mycreator11', 'mycollectn1', 'starteraaaaa', undefined, Number.NaN),
    /template_id NaN is not an int32/,
  );
});
