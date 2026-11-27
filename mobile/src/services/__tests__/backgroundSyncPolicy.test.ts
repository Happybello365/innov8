/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
// Issue #520: background sync must stop scheduling work when the network
// policy forbids it. These tests pin the existing gating behaviour.
import { offlineService } from '../offline.service';
import { usePendingTradeStore } from '../../stores/pendingTradeStore';
import { tradeApi } from '../../api/trade';

const mockDb = {
  execAsync: jest.fn(async () => undefined),
  runAsync: jest.fn(async () => undefined),
  getAllAsync: jest.fn(async () => [] as any[]),
  getFirstAsync: jest.fn(async () => null),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => {
    await cb();
  }),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockDb),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('../../api/trade', () => ({
  tradeApi: {
    listTrades: jest.fn(),
    createTrade: jest.fn(),
  },
}));

const pendingRow = (localId: string, createdAt: number) => ({
  local_id: localId,
  payload: JSON.stringify({ productName: 'Maize' }),
  status: 'pending',
  error: null,
  created_at: createdAt,
});

describe('background sync power/network policy (#520)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getAllAsync.mockResolvedValue([]);
    usePendingTradeStore.setState({ pendingTrades: [], isSyncing: false });
  });

  it('does not call the trades API while the device is offline', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { data: JSON.stringify({ id: 't1', status: 'OPEN' }) },
    ]);

    const trades = await offlineService.syncTrades(false);

    expect(tradeApi.listTrades).not.toHaveBeenCalled();
    expect(trades).toEqual([{ id: 't1', status: 'OPEN' }]);
  });

  it('falls back to cached trades when an online sync fails', async () => {
    (tradeApi.listTrades as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));
    mockDb.getAllAsync.mockResolvedValueOnce([
      { data: JSON.stringify({ id: 'cached', status: 'OPEN' }) },
    ]);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const trades = await offlineService.syncTrades(true);

    expect(tradeApi.listTrades).toHaveBeenCalledTimes(1);
    expect(trades).toEqual([{ id: 'cached', status: 'OPEN' }]);
    errorSpy.mockRestore();
  });

  it('stops replaying the queue at the first network error', async () => {
    // getPendingTrades returns newest first; sync replays oldest first.
    mockDb.getAllAsync.mockResolvedValue([pendingRow('local-new', 2), pendingRow('local-old', 1)]);
    (tradeApi.createTrade as jest.Mock).mockRejectedValue({ message: 'Network Error' });

    const result = await offlineService.syncPendingTrades();

    expect(tradeApi.createTrade).toHaveBeenCalledTimes(1);
    expect(result.created).toEqual([]);
    expect(result.failed).toEqual([]);
    // Network errors keep the row pending: no status update is written.
    const statusWrites = mockDb.runAsync.mock.calls.filter(([sql]) =>
      String(sql).includes("status = 'failed'")
    );
    expect(statusWrites).toHaveLength(0);
  });

  it('refuses to start a second sync while one is already running', async () => {
    usePendingTradeStore.setState({ isSyncing: true });
    const syncSpy = jest.spyOn(offlineService, 'syncPendingTrades');

    const result = await usePendingTradeStore.getState().sync();

    expect(result).toBeNull();
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('clears the sync lock even when the replay throws', async () => {
    const syncSpy = jest
      .spyOn(offlineService, 'syncPendingTrades')
      .mockRejectedValueOnce(new Error('db locked'));

    await expect(usePendingTradeStore.getState().sync()).rejects.toThrow('db locked');

    expect(usePendingTradeStore.getState().isSyncing).toBe(false);
    syncSpy.mockRestore();
  });
});
