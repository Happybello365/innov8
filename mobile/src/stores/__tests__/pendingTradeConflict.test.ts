/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
// Issue #521: when an offline trade draft conflicts with the server-authoritative
// state, the server's reason must be kept and surfaced, and the draft must not be
// silently dropped or replayed.
import { usePendingTradeStore } from '../pendingTradeStore';
import { offlineService } from '../../services/offline.service';
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

const row = (localId: string, status: 'pending' | 'failed', error: string | null = null) => ({
  local_id: localId,
  payload: JSON.stringify({ productName: 'Maize' }),
  status,
  error,
  created_at: Number(localId.replace(/\D/g, '')) || 1,
});

const serverConflict = (message: string) => ({
  response: { status: 409, data: { message } },
  message: 'Request failed with status code 409',
});

describe('offline trade draft conflicts (#521)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getAllAsync.mockResolvedValue([]);
    usePendingTradeStore.setState({ pendingTrades: [], isSyncing: false });
  });

  it('marks a draft failed with the server conflict reason instead of dropping it', async () => {
    mockDb.getAllAsync.mockResolvedValue([row('local-1', 'pending')]);
    (tradeApi.createTrade as jest.Mock).mockRejectedValueOnce(
      serverConflict('Trade already exists for this lot')
    );

    const result = await offlineService.syncPendingTrades();

    expect(result.created).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      localId: 'local-1',
      status: 'failed',
      error: 'Trade already exists for this lot',
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      ['Trade already exists for this lot', 'local-1']
    );
  });

  it('falls back to the generic error message when the server gives no reason', async () => {
    mockDb.getAllAsync.mockResolvedValue([row('local-2', 'pending')]);
    (tradeApi.createTrade as jest.Mock).mockRejectedValueOnce({
      response: { status: 409, data: {} },
      message: 'Request failed with status code 409',
    });

    const result = await offlineService.syncPendingTrades();

    expect(result.failed[0].error).toBe('Request failed with status code 409');
  });

  it('does not replay drafts already marked failed on the next sync', async () => {
    mockDb.getAllAsync.mockResolvedValue([row('local-3', 'failed', 'Conflict')]);

    const result = await offlineService.syncPendingTrades();

    expect(tradeApi.createTrade).not.toHaveBeenCalled();
    expect(result).toEqual({ created: [], failed: [] });
  });

  it('keeps a conflicting draft visible in the store after sync', async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([row('local-4', 'pending')]) // inside syncPendingTrades
      .mockResolvedValueOnce([row('local-4', 'failed', 'Price changed on server')]); // store reload
    (tradeApi.createTrade as jest.Mock).mockRejectedValueOnce(
      serverConflict('Price changed on server')
    );

    await usePendingTradeStore.getState().sync();

    const [draft] = usePendingTradeStore.getState().pendingTrades;
    expect(draft).toMatchObject({ localId: 'local-4', status: 'failed', error: 'Price changed on server' });
  });

  it('re-queues a failed draft for retry and clears its previous error', async () => {
    await usePendingTradeStore.getState().retry('local-5');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending', error = NULL"),
      ['local-5']
    );
  });

  it('removes a draft only when the user dismisses it', async () => {
    usePendingTradeStore.setState({
      pendingTrades: [
        { localId: 'local-6', payload: { productName: 'Maize' } as any, status: 'failed', error: 'x', createdAt: 6 },
        { localId: 'local-7', payload: { productName: 'Rice' } as any, status: 'pending', createdAt: 7 },
      ],
    });

    await usePendingTradeStore.getState().dismiss('local-6');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM pending_trades WHERE local_id = ?',
      ['local-6']
    );
    expect(usePendingTradeStore.getState().pendingTrades.map((p) => p.localId)).toEqual(['local-7']);
  });
});
