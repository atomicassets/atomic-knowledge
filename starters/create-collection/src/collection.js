/**
 * Derives a throwaway collection name from the signing account and builds the
 * `createcol` action for it. Neither function needs a session, so both are
 * callable, and testable, without a key.
 */
import { randomBytes } from 'node:crypto';

import { ActionBuilder, createAttributeMap, explorerApiForNetwork } from '@atomichub/atomicassets';

/** The AtomicAssets contract account. It carries this name on every chain. */
export const ATOMICASSETS = 'atomicassets';

/**
 * The characters an Antelope name may hold, minus the dot. A dot in a
 * collection name hands the naming check to the account matching the suffix,
 * which would need a second signer, so the derived name below carries none.
 */
const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz12345';

/**
 * Builds a 12-character collection name: six characters carried over from the
 * actor so a reader can tell whose it is, and six from entropy so a second run
 * does not collide with the first.
 *
 * Twelve characters with no dot is the third path of the contract's naming
 * check, the one that needs no co-signer. The first path still applies: a name
 * that happens to be a registered account needs that account to co-sign, and
 * the chain rejects the transaction naming the missing authority.
 *
 * @param {string} actor account the collection is derived from
 * @param {Uint8Array} entropy at least six bytes
 * @returns {string}
 */
export function deriveCollectionName(actor, entropy = randomBytes(6)) {
  if (entropy.length < 6) {
    throw new Error(`entropy holds ${entropy.length} bytes, and a derived name needs six`);
  }

  const carried = [...actor]
    .filter((character) => NAME_CHARACTERS.includes(character))
    .slice(0, 6)
    .join('')
    .padEnd(6, 'a');

  // The modulo bias across 31 characters is irrelevant here: the tail exists so
  // two runs of a throwaway starter do not collide, not to be unguessable.
  const tail = [...entropy]
    .slice(0, 6)
    .map((byte) => NAME_CHARACTERS[byte % NAME_CHARACTERS.length])
    .join('');

  return `${carried}${tail}`;
}

/**
 * The `createcol` action, authorization left off. `ActionBuilder` is
 * synchronous and holds no session: it returns one `{ account, name, data }`
 * object, and the caller attaches the authorization its session carries.
 *
 * `market_fee` is checked as a finite number before the action exists, because
 * a `NaN` has no JSON form and would reach the signer as `null`.
 *
 * @param {string} actor collection author, also the only authorized account
 * @param {string} collectionName name from deriveCollectionName
 * @param {number} marketFee share of a sale the collection takes, 0 to 0.15
 * @returns {{account: string, name: string, data: object}}
 */
export function buildCreateCollection(actor, collectionName, marketFee = 0) {
  const data = createAttributeMap({ name: 'Starter collection' }, { name: 'string' });

  return new ActionBuilder(ATOMICASSETS).createcol(actor, collectionName, true, [actor], [], marketFee, data);
}

/**
 * Reads the collection back through the testnet API. A committed transaction
 * and an indexed row are two facts, so this answers null until the indexer has
 * caught up, and the caller decides how long to wait.
 *
 * @param {string} collectionName name to read
 * @param {object} api explorer client, overridable so a test can point elsewhere
 * @returns {Promise<object>} the collection row, or null while it is not indexed
 */
export async function readCollection(collectionName, api = explorerApiForNetwork('wax-testnet')) {
  try {
    return await api.getCollection(collectionName);
  } catch (error) {
    // The API answers a missing collection with an error rather than an empty
    // body. Anything that is not an API error is a real failure and is rethrown.
    if (error?.isApiError === true) {
      return null;
    }

    throw error;
  }
}
