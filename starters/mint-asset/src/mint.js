/**
 * Derives a fresh schema name, builds the `createschema` and `mintasset` pair
 * that mints one templateless asset, and reads the result back. Nothing here
 * needs a session, so all of it is callable, and testable, without a key.
 */
import { randomBytes } from 'node:crypto';

import { ActionBuilder, createAttributeMap, explorerApiForNetwork } from '@atomichub/atomicassets';

/** The AtomicAssets contract account. It carries this name on every chain. */
export const ATOMICASSETS = 'atomicassets';

/**
 * The contract's "no template" sentinel. A templateless asset carries its own
 * immutable data instead of inheriting a template's, which is what lets this
 * starter mint without a `createtempl` step.
 */
export const TEMPLATELESS = -1;

/** The characters an Antelope name may hold, minus the dot. */
const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz12345';

/**
 * The schema this starter writes. The contract rejects any format that omits a
 * line named `name` typed `string`, so that line is not decoration: leave it
 * out and `createschema` aborts. The other two lines exist to show a
 * non-string type and an image reference alongside it.
 */
export const SCHEMA_FORMAT = [
  { name: 'name', type: 'string' },
  { name: 'img', type: 'image' },
  { name: 'power', type: 'uint32' },
];

/**
 * The same field types again, in the per-key shape `createAttributeMap` reads.
 * The format above is what the chain stores; this is what turns a plain object
 * into the attribute map an action carries, and no schema fetch is needed for
 * it.
 */
export const SCHEMA_TYPES = { name: 'string', img: 'image', power: 'uint32' };

/** What the minted asset holds when the command line names nothing else. */
export const DEFAULT_ATTRIBUTES = {
  name: 'Starter asset',
  img: 'QmYm1FG7LxhF3mFUaVmVEVqRztEmByVbHwL6ZWXwVY2dvb',
  power: 1,
};

/**
 * Builds a twelve-character schema name: a fixed prefix a reader recognises,
 * and five characters from entropy so every run writes its own schema.
 *
 * A fresh schema per run is what makes this starter repeatable. `createschema`
 * refuses a name the collection already carries, so a fixed name would sign
 * once and fail on every run after it.
 *
 * @param {Uint8Array} entropy at least five bytes
 * @returns {string}
 */
export function deriveSchemaName(entropy = randomBytes(5)) {
  if (entropy.length < 5) {
    throw new Error(`entropy holds ${entropy.length} bytes, and a derived schema name needs five`);
  }

  // The modulo bias across 31 characters is irrelevant here: the tail exists so
  // two runs of a throwaway starter do not collide, not to be unguessable.
  const tail = [...entropy]
    .slice(0, 5)
    .map((byte) => NAME_CHARACTERS[byte % NAME_CHARACTERS.length])
    .join('');

  return `starter${tail}`;
}

/**
 * The two actions, in the order the contract needs them. They go in one
 * transaction: a schema that exists with nothing minted against it is a half
 * step nobody wants, and Antelope commits a transaction whole or not at all.
 *
 * `authorized_minter` is the actor rather than `new_asset_owner`, because the
 * minter pays the RAM for the new row even though the row lives in the owner's
 * scope. `tokens_to_back` is empty: native backing is gone in V2, and a
 * non-empty vector aborts the mint.
 *
 * @param {string} actor collection author, minter, and recipient
 * @param {string} collectionName collection to mint into
 * @param {string} schemaName name from deriveSchemaName
 * @param {object} attributes values matching SCHEMA_TYPES
 * @param {number} templateId template to mint against, or TEMPLATELESS
 * @returns {Array<{account: string, name: string, data: object}>}
 */
export function buildMint(
  actor,
  collectionName,
  schemaName,
  attributes = DEFAULT_ATTRIBUTES,
  templateId = TEMPLATELESS,
) {
  const builder = new ActionBuilder(ATOMICASSETS);
  const immutableData = createAttributeMap(attributes, SCHEMA_TYPES);

  return [
    builder.createschema(actor, collectionName, schemaName, SCHEMA_FORMAT),
    builder.mintasset(actor, collectionName, schemaName, templateId, actor, immutableData, [], []),
  ];
}

/**
 * The newest collection the testnet API reports for this author, or null when
 * the account authors none. This is how the command finds somewhere to mint
 * when the command line names no collection.
 *
 * @param {string} actor author to read
 * @param {object} api explorer client, overridable so a test can point elsewhere
 * @returns {Promise<string>} collection name, or null
 */
export async function newestCollection(actor, api = explorerApiForNetwork('wax-testnet')) {
  const collections = await api.getCollections({ author: actor, sort: 'created', order: 'desc' }, 1, 1);

  return collections.length === 0 ? null : collections[0].collection_name;
}

/**
 * Reads back the asset this run minted. The schema name is fresh per run, so
 * the collection and schema pair names exactly one asset and no earlier one
 * can be mistaken for it.
 *
 * A committed transaction and an indexed row are two facts, so this answers
 * null until the indexer has caught up, and the caller decides how long to
 * wait.
 *
 * @param {string} collectionName collection minted into
 * @param {string} schemaName schema minted against
 * @param {string} owner account the asset was minted to
 * @param {object} api explorer client, overridable so a test can point elsewhere
 * @returns {Promise<object>} the asset row, or null while it is not indexed
 */
export async function readMintedAsset(collectionName, schemaName, owner, api = explorerApiForNetwork('wax-testnet')) {
  const assets = await api.getAssets({ owner, collection_name: collectionName, schema_name: schemaName }, 1, 1);

  return assets.length === 0 ? null : assets[0];
}
