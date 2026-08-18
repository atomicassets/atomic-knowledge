/**
 * Reads one account's AtomicAssets holdings from the hosted explorer API and
 * shapes each row for printing. The read and the shaping live here rather than
 * in the command so a test can drive the same functions the command runs.
 */
import { NETWORK_ENDPOINTS, explorerApiForNetwork } from '@atomichub/atomicassets';

/**
 * The account read when the command line names none. It authors the
 * alien.worlds collection and holds assets from several collections, so the
 * first page is never empty.
 */
export const DEFAULT_ACCOUNT = 'federation';

/** The host the WAX mainnet factory points at, exported so a test can probe it. */
export const API_HOST = NETWORK_ENDPOINTS.wax.api;

/**
 * @typedef {object} AssetSummary
 * @property {string} assetId
 * @property {string} name asset name, or null when the asset carries none
 * @property {string} collection
 * @property {{name: string, value: unknown}} attribute first attribute, or null
 */

/**
 * Renders a value for a terminal. Asset data is written by whoever minted the
 * asset, so a name or an attribute value can carry a control character, and a
 * terminal acts on what it is handed: an escape sequence moves the cursor,
 * recolours the line, or hides the text after it. Every value printed below
 * passes through here, so one row cannot rewrite the rows around it.
 *
 * @param {unknown} value
 * @param {number} limit longest rendered string, in code points
 * @returns {string}
 */
export function printable(value, limit = 48) {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  const flat = [...text]
    .map((character) => {
      const code = character.codePointAt(0);

      return code < 0x20 || code === 0x7f ? ' ' : character;
    })
    .join('');

  return [...flat].length > limit ? `${[...flat].slice(0, limit - 3).join('')}...` : flat;
}

/**
 * Picks the fields a reader wants off an API asset row. `data` is the merged
 * view the API builds from template and asset data, so the first entry is the
 * first attribute the asset actually resolves to.
 *
 * @param {object} asset one row from getAssets
 * @returns {AssetSummary}
 */
export function summarizeAsset(asset) {
  const entries = Object.entries(asset.data ?? {});
  const first = entries.length === 0 ? null : entries[0];

  return {
    assetId: asset.asset_id,
    name: asset.name ?? null,
    collection: asset.collection.collection_name,
    attribute: first === null ? null : { name: first[0], value: first[1] },
  };
}

/**
 * One printable line per asset.
 *
 * @param {AssetSummary} summary
 * @returns {string}
 */
export function formatRow(summary) {
  const attribute =
    summary.attribute === null
      ? 'no attributes'
      : `${printable(summary.attribute.name)}=${printable(summary.attribute.value)}`;

  return [
    summary.assetId.padStart(14),
    printable(summary.name ?? '(no name)').padEnd(32),
    printable(summary.collection).padEnd(14),
    attribute,
  ].join('  ');
}

/**
 * Reads a page of the assets an account holds on WAX mainnet. No key, no
 * account, and no registration: the hosted API answers an anonymous request.
 *
 * @param {string} account account name to read
 * @param {number} limit rows to ask for
 * @param {object} api explorer client, overridable so a test can point elsewhere
 * @returns {Promise<AssetSummary[]>}
 */
export async function readAssets(account, limit = 5, api = explorerApiForNetwork('wax')) {
  const assets = await api.getAssets({ owner: account }, 1, limit);

  return assets.map(summarizeAsset);
}
