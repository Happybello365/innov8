import * as SecureStore from 'expo-secure-store';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { getNetworkPassphrase } from './signingPreview';

/**
 * Remembers an in-progress wallet signing step across the app switch to an
 * external wallet and back (#514), so the screen can restore the exact step
 * instead of showing a blank form.
 *
 * Only the transaction hash is stored, never the XDR or any key material.
 * Entries expire after `WALLET_RETURN_TTL_MS` and are discarded when corrupt.
 */

export const WALLET_RETURN_TTL_MS = 15 * 60 * 1000;
const STORAGE_KEY = 'innov8_pending_wallet_action';

export interface PendingWalletAction {
  /** Stable name of the step, e.g. `sign-contract-tx`. */
  action: string;
  /** Hex hash of the unsigned transaction the user was signing. */
  txHash: string;
  savedAt: number;
}

export interface WalletReturnStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
}

export const secureWalletReturnStorage: WalletReturnStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

/** Hex hash of an unsigned XDR; used to match a restored step to the same transaction. */
export function transactionHashHex(unsignedXdr: string): string {
  const tx = TransactionBuilder.fromXDR(unsignedXdr, getNetworkPassphrase());
  if ('innerTransaction' in tx) {
    throw new Error('Fee-bump transactions are not supported for wallet return');
  }
  return tx.hash().toString('hex');
}

function isPendingWalletAction(value: unknown): value is PendingWalletAction {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.action === 'string' &&
    v.action.length > 0 &&
    typeof v.txHash === 'string' &&
    /^[0-9a-f]{64}$/.test(v.txHash) &&
    typeof v.savedAt === 'number' &&
    Number.isFinite(v.savedAt)
  );
}

export async function savePendingWalletAction(
  action: { action: string; txHash: string },
  now: number = Date.now(),
  storage: WalletReturnStorage = secureWalletReturnStorage,
): Promise<void> {
  const entry: PendingWalletAction = { action: action.action, txHash: action.txHash, savedAt: now };
  await storage.setItem(STORAGE_KEY, JSON.stringify(entry));
}

/**
 * Returns the saved step if it is still fresh and well-formed. Expired or
 * corrupt entries are removed so they cannot resurface later.
 */
export async function loadPendingWalletAction(
  now: number = Date.now(),
  storage: WalletReturnStorage = secureWalletReturnStorage,
): Promise<PendingWalletAction | null> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!isPendingWalletAction(parsed) || now - parsed.savedAt > WALLET_RETURN_TTL_MS) {
    await storage.deleteItem(STORAGE_KEY);
    return null;
  }
  return parsed;
}

export async function clearPendingWalletAction(
  storage: WalletReturnStorage = secureWalletReturnStorage,
): Promise<void> {
  await storage.deleteItem(STORAGE_KEY);
}

/** True when the saved step belongs to this action and transaction. */
export function matchesPendingWalletAction(
  pending: PendingWalletAction | null,
  action: string,
  txHash: string,
): boolean {
  return pending !== null && pending.action === action && pending.txHash === txHash;
}
