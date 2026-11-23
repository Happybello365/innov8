import { Horizon, rpc, Networks } from '@stellar/stellar-sdk';
import { RpcFallbackPolicy, parseRpcProviderUrls } from '../lib/stellar/rpcFallback';
import { env } from './env';

export const USDC_ISSUER_MAINNET = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
// Testnet USDC issuer — override via USDC_ISSUER env var if a specific testnet asset is needed.
export const USDC_ISSUER_TESTNET =
  process.env.USDC_ISSUER ?? "GDDD3FRCH55BSYNKISYY242HQNIBOH35CQP42NSJABR62XK2JOV5MED6";

// Read network configuration from environment
const stellarNetwork = process.env.STELLAR_NETWORK || 'testnet';
const stellarRpcUrl = process.env.STELLAR_RPC_URL || '';

export const networkType = stellarNetwork as 'testnet' | 'mainnet';
const horizonUrl = networkType === 'testnet'
  ? 'https://horizon-testnet.stellar.org'
  : 'https://horizon.stellar.org';

export const horizonServer = new Horizon.Server(horizonUrl);

const defaultRpcUrl = networkType === 'testnet'
  ? 'https://soroban-testnet.stellar.org'
  : 'https://soroban-rpc.stellar.org';

const rpcUrl = env.STELLAR_RPC_URL || defaultRpcUrl;

if (!env.STELLAR_RPC_URL) {
  console.warn('STELLAR_RPC_URL not set, using default for', networkType);
}

export const sorobanRpcClient = new rpc.Server(rpcUrl);

/**
 * Health-based failover across STELLAR_RPC_URL + STELLAR_RPC_FALLBACK_URLS
 * (issue #465). Use `withSorobanRpcFallback(client => client.getLatestLedger())`
 * for read calls that should survive a single provider outage.
 */
export const sorobanRpcFallbackPolicy = new RpcFallbackPolicy(
  parseRpcProviderUrls(rpcUrl, env.STELLAR_RPC_FALLBACK_URLS),
  {
    failureThreshold: env.STELLAR_RPC_FAILURE_THRESHOLD,
    cooldownMs: env.STELLAR_RPC_COOLDOWN_MS,
  },
);

const rpcClients = new Map<string, rpc.Server>([[rpcUrl, sorobanRpcClient]]);

export function withSorobanRpcFallback<T>(fn: (client: rpc.Server) => Promise<T>): Promise<T> {
  return sorobanRpcFallbackPolicy.execute((url) => {
    let client = rpcClients.get(url);
    if (!client) {
      client = new rpc.Server(url);
      rpcClients.set(url, client);
    }
    return fn(client);
  });
}

export const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE
  ?? (networkType === 'testnet' ? Networks.TESTNET : Networks.PUBLIC);
