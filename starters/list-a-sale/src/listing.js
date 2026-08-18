/**
 * Composes the listing pair AtomicMarket needs and reads the result back.
 * Nothing here needs a session, so all of it is callable, and testable,
 * without a key.
 */
import { explorerApiForNetwork } from '@atomichub/atomicassets';
import { MarketActionBuilder, marketApiForNetwork, SaleState } from '@atomichub/atomicmarket';

/** The two contract accounts. They carry these names on every chain. */
export const ATOMICASSETS = 'atomicassets';
export const ATOMICMARKET = 'atomicmarket';

/**
 * What the listing asks when the command line names no price. The symbol code
 * and the precision both matter: a quantity written at another precision is
 * another price, and nothing downstream catches it.
 */
export const DEFAULT_LISTING_PRICE = '1.00000000 WAX';

/**
 * The settlement symbol in the precision-and-code notation the action's field
 * takes. This starter lists a plain sale, so it names the same symbol as the
 * price above. A listing whose two symbols differ is a Delphi sale, which
 * settles an oracle conversion of the listing price rather than the price
 * itself.
 */
export const SETTLEMENT_SYMBOL = '8,WAX';

/**
 * The empty string is the contract's seeded default marketplace and is always
 * valid. Any other value has to be a marketplace already registered on chain,
 * and the chain rejects the transaction when it is not.
 */
export const MAKER_MARKETPLACE = '';

/**
 * Splits a chain quantity into its amount and its symbol code, or answers null
 * when the string is not one. Antelope writes a quantity as an amount at a
 * fixed precision, a space, and the code.
 *
 * @param {string} quantity for example "1.00000000 WAX"
 * @returns {{precision: number, code: string}} or null
 */
export function readQuantity(quantity) {
  const match = /^(\d+)(?:\.(\d+))?[ ]([A-Z]{1,7})$/.exec(quantity);

  if (match === null) {
    return null;
  }

  return { precision: match[2] === undefined ? 0 : match[2].length, code: match[3] };
}

/**
 * Refuses the two listings the composer will happily build and the chain will
 * refuse or misprice.
 *
 * `announceSaleActions` checks nothing about symbols or asset counts, by
 * design: both are chain state it is not handed. That leaves the caller to
 * hold the line, and these are the two places a starter can hold it without
 * reading the chain.
 *
 * @param {string[]} assetIds assets to list
 * @param {string} listingPrice quantity the sale asks
 * @param {string} settlementSymbol precision and code the sale settles in
 * @returns {void}
 */
export function assertPlainListing(assetIds, listingPrice, settlementSymbol) {
  if (assetIds.length !== 1) {
    throw new Error(
      `a sale lists exactly one asset and this one names ${assetIds.length}: ` +
        'AtomicMarket V2 removed bundle listings, so announce one sale per asset instead',
    );
  }

  const price = readQuantity(listingPrice);

  if (price === null) {
    throw new Error(`listing_price "${listingPrice}" is not a chain quantity, for example "1.00000000 WAX"`);
  }

  if (settlementSymbol !== `${price.precision},${price.code}`) {
    throw new Error(
      `listing_price "${listingPrice}" and settlement_symbol "${settlementSymbol}" name different symbols: ` +
        'a plain sale settles the price it lists, and a listing whose two symbols differ is a Delphi sale',
    );
  }
}

/**
 * The listing pair, in the order the contract needs it. `announcesale` writes
 * the row and moves nothing; the AtomicAssets `createoffer` with memo `sale` is
 * what activates it. Announcing alone lists nothing and offering alone dangles,
 * so the two belong in one transaction, and the composer is what keeps the
 * order and the memo literal out of the caller's hands.
 *
 * @param {string} seller account listing the asset
 * @param {string[]} assetIds assets to list, exactly one on V2
 * @param {string} listingPrice quantity the sale asks
 * @param {string} settlementSymbol precision and code the sale settles in
 * @returns {Array<{account: string, name: string, data: object}>}
 */
export function buildListing(
  seller,
  assetIds,
  listingPrice = DEFAULT_LISTING_PRICE,
  settlementSymbol = SETTLEMENT_SYMBOL,
) {
  assertPlainListing(assetIds, listingPrice, settlementSymbol);

  return new MarketActionBuilder(ATOMICMARKET).announceSaleActions({
    seller,
    asset_ids: assetIds,
    listing_price: listingPrice,
    settlement_symbol: settlementSymbol,
    maker_marketplace: MAKER_MARKETPLACE,
    assets_contract: ATOMICASSETS,
  });
}

/**
 * The newest asset this account owns on WAX testnet, or null when it owns
 * none. This is how the command finds something to list when the command line
 * names no asset.
 *
 * @param {string} actor owner to read
 * @param {object} api explorer client, overridable so a test can point elsewhere
 * @returns {Promise<string>} asset id, or null
 */
export async function newestAsset(actor, api = explorerApiForNetwork('wax-testnet')) {
  const assets = await api.getAssets({ owner: actor, sort: 'minted', order: 'desc' }, 1, 1);

  return assets.length === 0 ? null : assets[0].asset_id;
}

/**
 * Reads back the sale this run listed. A committed transaction and an indexed
 * row are two facts, so this answers null until the indexer has caught up, and
 * the caller decides how long to wait.
 *
 * @param {string} seller account that listed
 * @param {string} assetId asset that was listed
 * @param {object} api market client, overridable so a test can point elsewhere
 * @returns {Promise<object>} the sale row, or null while it is not indexed
 */
export async function readSale(seller, assetId, api = marketApiForNetwork('wax-testnet')) {
  const sales = await api.getSales({ seller, asset_id: assetId, state: SaleState.Listed }, 1, 1);

  return sales.length === 0 ? null : sales[0];
}
