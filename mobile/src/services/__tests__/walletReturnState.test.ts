import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  WALLET_RETURN_TTL_MS,
  clearPendingWalletAction,
  loadPendingWalletAction,
  matchesPendingWalletAction,
  savePendingWalletAction,
  transactionHashHex,
  type WalletReturnStorage,
} from '../walletReturnState';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: WalletReturnStorage = {
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    deleteItem: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  return { storage, data };
}

const HASH = 'a'.repeat(64);
const NOW = 1_700_000_000_000;

describe('savePendingWalletAction / loadPendingWalletAction', () => {
  it('restores the saved step while it is still fresh', async () => {
    const { storage } = memoryStorage();
    await savePendingWalletAction({ action: 'sign-contract-tx', txHash: HASH }, NOW, storage);

    const restored = await loadPendingWalletAction(NOW + 1000, storage);

    expect(restored).toEqual({ action: 'sign-contract-tx', txHash: HASH, savedAt: NOW });
  });

  it('stores only the action, hash and timestamp (no XDR)', async () => {
    const { storage, data } = memoryStorage();
    await savePendingWalletAction({ action: 'sign-contract-tx', txHash: HASH }, NOW, storage);

    const stored = JSON.parse([...data.values()][0]);
    expect(Object.keys(stored).sort()).toEqual(['action', 'savedAt', 'txHash']);
  });

  it('discards an entry older than the TTL and removes it from storage', async () => {
    const { storage, data } = memoryStorage();
    await savePendingWalletAction({ action: 'sign-contract-tx', txHash: HASH }, NOW, storage);

    const restored = await loadPendingWalletAction(NOW + WALLET_RETURN_TTL_MS + 1, storage);

    expect(restored).toBeNull();
    expect(data.size).toBe(0);
  });

  it('still restores an entry exactly at the TTL boundary', async () => {
    const { storage } = memoryStorage();
    await savePendingWalletAction({ action: 'sign-contract-tx', txHash: HASH }, NOW, storage);

    await expect(loadPendingWalletAction(NOW + WALLET_RETURN_TTL_MS, storage)).resolves.not.toBeNull();
  });

  it.each([
    ['invalid JSON', 'not-json{'],
    ['missing fields', JSON.stringify({ action: 'sign-contract-tx' })],
    ['malformed hash', JSON.stringify({ action: 'sign-contract-tx', txHash: 'xyz', savedAt: NOW })],
    ['empty action', JSON.stringify({ action: '', txHash: HASH, savedAt: NOW })],
    ['non-numeric timestamp', JSON.stringify({ action: 'sign-contract-tx', txHash: HASH, savedAt: 'now' })],
  ])('discards corrupt entries (%s)', async (_label, raw) => {
    const { storage, data } = memoryStorage({ innov8_pending_wallet_action: raw });

    await expect(loadPendingWalletAction(NOW, storage)).resolves.toBeNull();
    expect(data.size).toBe(0);
  });

  it('returns null when nothing was saved', async () => {
    const { storage } = memoryStorage();
    await expect(loadPendingWalletAction(NOW, storage)).resolves.toBeNull();
  });
});

describe('clearPendingWalletAction', () => {
  it('removes the saved step', async () => {
    const { storage, data } = memoryStorage();
    await savePendingWalletAction({ action: 'sign-contract-tx', txHash: HASH }, NOW, storage);

    await clearPendingWalletAction(storage);

    expect(data.size).toBe(0);
    await expect(loadPendingWalletAction(NOW, storage)).resolves.toBeNull();
  });
});

describe('matchesPendingWalletAction', () => {
  const pending = { action: 'sign-contract-tx', txHash: HASH, savedAt: NOW };

  it('matches only the same action and the same transaction', () => {
    expect(matchesPendingWalletAction(pending, 'sign-contract-tx', HASH)).toBe(true);
    expect(matchesPendingWalletAction(pending, 'sign-contract-tx', 'b'.repeat(64))).toBe(false);
    expect(matchesPendingWalletAction(pending, 'other-step', HASH)).toBe(false);
    expect(matchesPendingWalletAction(null, 'sign-contract-tx', HASH)).toBe(false);
  });
});

describe('transactionHashHex', () => {
  it('returns a stable 64-character hex hash for the same unsigned transaction', () => {
    const source = Keypair.random();
    const xdr = new TransactionBuilder(new Account(source.publicKey(), '1'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }),
      )
      .setTimeout(30)
      .build()
      .toXDR();

    const first = transactionHashHex(xdr);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(transactionHashHex(xdr)).toBe(first);
  });

  it('throws for XDR it cannot decode', () => {
    expect(() => transactionHashHex('garbage')).toThrow();
  });
});
