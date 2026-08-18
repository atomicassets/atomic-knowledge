/**
 * Reads one collection's live sales from the hosted AtomicMarket API and
 * shapes each row for printing. The read and the shaping live here rather than
 * in the command so a test can drive the same functions the command runs.
 */
import { NETWORK_ENDPOINTS, SaleState, formatQuantity, marketApiForNetwork } from '@atomichub/atomicmarket';

/** The collection read when the command line names none. It lists continuously. */
export const DEFAULT_COLLECTION = 'alien.worlds';

/** The host the WAX mainnet factory points at, exported so a test can probe it. */
export const API_HOST = NETWORK_ENDPOINTS.wax.api;

/**
 * @typedef {object} SaleSummary
 * @property {string} saleId
 * @property {string} price rendered quantity, for example "82.99554999 WAX"
 * @property {string} seller
 * @property {string} assetId the listed asset, or null when the row lists none
 * @property {string} assetName
 */

/**
 * Renders a value for a terminal. Asset and collection data is written by
 * whoever minted the asset, so a name can carry a control character, and a
 * terminal acts on what it is handed: an escape sequence moves the cursor,
 * recolours the line, or hides the text after it.
 *
 * @param {unknown} value
 * @param {number} limit longest rendered string, in code points
 * @returns {string}
 */
export function printable(value, limit = 32) {
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
 * Picks the fields a storefront shows off an API sale row. `price.amount` is
 * an integer in the token's smallest unit, so the SDK's own `formatQuantity`
 * renders it rather than a division here: the precision belongs to the token,
 * and a price rendered at the wrong one is a wrong price nothing downstream
 * can catch.
 *
 * AtomicMarket v2 lists one asset per sale. A row carrying several is a legacy
 * bundle from v1, and this summary names the first of them.
 *
 * @param {object} sale one row from getSales
 * @returns {SaleSummary}
 */
export function summarizeSale(sale) {
  const asset = sale.assets.length === 0 ? null : sale.assets[0];

  return {
    saleId: sale.sale_id,
    price: formatQuantity(BigInt(sale.price.amount), sale.price.token_precision, sale.price.token_symbol),
    seller: sale.seller,
    assetId: asset === null ? null : asset.asset_id,
    assetName: asset === null ? null : (asset.name ?? null),
  };
}

/**
 * One printable line per sale.
 *
 * @param {SaleSummary} summary
 * @returns {string}
 */
export function formatRow(summary) {
  return [
    summary.saleId.padStart(10),
    summary.price.padStart(22),
    printable(summary.seller).padEnd(13),
    (summary.assetId ?? '(no asset)').padStart(14),
    printable(summary.assetName ?? '(no name)'),
  ].join('  ');
}

/**
 * Reads the listed sales of one collection on WAX mainnet, newest first. No
 * key, no account, and no registration: the hosted API answers an anonymous
 * request. `SaleState.Listed` is the state filter that leaves out the sold,
 * cancelled, and invalid rows a storefront must not offer.
 *
 * @param {string} collection collection name to read
 * @param {number} limit rows to ask for
 * @param {object} api market client, overridable so a test can point elsewhere
 * @returns {Promise<SaleSummary[]>}
 */
export async function readSales(collection, limit = 5, api = marketApiForNetwork('wax')) {
  const sales = await api.getSales(
    { collection_name: collection, state: SaleState.Listed, sort: 'created', order: 'desc' },
    1,
    limit,
  );

  return sales.map(summarizeSale);
}
