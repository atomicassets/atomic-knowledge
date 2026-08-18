/**
 * The two variables every signing starter reads, and the message it prints
 * when either is absent.
 *
 * These two spellings are the contract. The starters, their READMEs, and the
 * workflow environment that runs them use `WAX_TESTNET_ACTOR` and
 * `WAX_TESTNET_PRIVATE_KEY` and no other spelling, so a half-configured
 * environment is never read as a configured one.
 *
 * Each signing starter carries its own copy of this file rather than sharing
 * one. A starter is meant to be cloned as a single directory and run, so a
 * shared module would be a dependency a reader cannot see. The three copies
 * are identical; keep them that way.
 */
export const CREDENTIALS = ['WAX_TESTNET_ACTOR', 'WAX_TESTNET_PRIVATE_KEY'];

/**
 * The credential names that are absent or blank, in the order above. A
 * variable set to whitespace counts as absent: an empty secret in a
 * continuous-integration environment arrives as an empty string, and treating
 * it as a value produces a signing failure that names nothing useful.
 *
 * @param {Record<string, string>} env process environment to read
 * @returns {string[]}
 */
export function missingCredentials(env) {
  return CREDENTIALS.filter((name) => (env[name] ?? '').trim() === '');
}

/**
 * The line printed on the skip path. It names the variables that are missing
 * and says what did not happen, so a reader who cloned without keys gets a
 * green run and a legible reason.
 *
 * @param {string[]} missing names from missingCredentials
 * @returns {string}
 */
export function skipMessage(missing) {
  const verb = missing.length === 1 ? 'is' : 'are';

  return `${missing.join(' and ')} ${verb} not set, so this starter signed nothing. Set both to run it against WAX testnet.`;
}
