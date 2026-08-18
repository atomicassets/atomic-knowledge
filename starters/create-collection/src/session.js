/**
 * Builds the WharfKit session the action below signs through. The key is read
 * from the environment and held in memory by the private-key plugin, which is
 * the shape for a script or a continuous-integration job and never for a
 * browser.
 *
 * Each signing starter carries its own copy of this file rather than sharing
 * one. A starter is meant to be cloned as a single directory and run, so a
 * shared module would be a dependency a reader cannot see. The three copies
 * are identical; keep them that way.
 */
import { Chains, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';

/**
 * WAX testnet is where the V2 contracts run, so it is the chain every starter
 * here signs against. The chain id is what a signature commits to: a session
 * pointed at the wrong chain produces a transaction the target rejects rather
 * than a network error.
 *
 * @param {Record<string, string>} env process environment holding the credentials
 * @returns {Session}
 */
export function openSession(env) {
  return new Session({
    actor: env.WAX_TESTNET_ACTOR,
    permission: 'active',
    chain: Chains.WAXTestnet,
    walletPlugin: new WalletPluginPrivateKey(env.WAX_TESTNET_PRIVATE_KEY),
  });
}
