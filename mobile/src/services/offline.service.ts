import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { AppState, AppStateStatus } from 'react-native';
import { tradeApi } from '../api/trade';
import type { Trade } from '../types/trade';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';

let db: SQLite.SQLiteDatabase | null = null;

export type CreateTradePayload = Parameters<typeof tradeApi.createTrade>[0];

/**
 * A trade created while offline (issue #268). `pending` rows are retried on
 * every sync; `failed` rows stay visible until the user dismisses them so a
 * rejected creation is never silently dropped.
 */
export interface PendingTrade {
  localId: string;
  payload: CreateTradePayload;
  status: 'pending' | 'failed';
  error?: string;
  createdAt: number;
}

export interface PendingTradeSyncResult {
  created: Array<{ localId: string; tradeId: string }>;
  failed: PendingTrade[];
}

const isNetworkError = (error: unknown): boolean => {
  const e = error as { response?: unknown; code?: string; message?: string };
  // Axios sets `response` whenever the server answered; no response means
  // we never reached it, so keep the row pending and retry later.
  return !e?.response;
};

const errorMessage = (error: unknown): string => {
  const e = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return e?.response?.data?.message ?? e?.response?.data?.error ?? e?.message ?? 'Trade creation failed';
};

export const initDb = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('amana_offline.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_trades (
        local_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  }
  return db;
};

export const offlineService = {
  // SecureStore helpers for auth tokens and small preferences
  async setSecureItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },

  async getSecureItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async deleteSecureItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },

  // SQLite caching helpers for trades
  async cacheTrades(trades: Trade[]): Promise<void> {
    const database = await initDb();
    const now = Date.now();
    
    // Using a transaction for batch inserts
    await database.withTransactionAsync(async () => {
      for (const trade of trades) {
        await database.runAsync(
          'INSERT OR REPLACE INTO trades (id, data, updated_at) VALUES (?, ?, ?)',
          [trade.id, JSON.stringify(trade), now]
        );
      }
    });
  },

  async getCachedTrades(): Promise<Trade[]> {
    const database = await initDb();
    const rows = await database.getAllAsync<{ data: string }>('SELECT data FROM trades ORDER BY updated_at DESC');
    return rows.map(r => JSON.parse(r.data));
  },

  async cacheTradeDetail(trade: Trade): Promise<void> {
    const database = await initDb();
    const now = Date.now();
    await database.runAsync(
      'INSERT OR REPLACE INTO trades (id, data, updated_at) VALUES (?, ?, ?)',
      [trade.id, JSON.stringify(trade), now]
    );
  },

  async getCachedTradeDetail(tradeId: string): Promise<Trade | null> {
    const database = await initDb();
    const row = await database.getFirstAsync<{ data: string }>('SELECT data FROM trades WHERE id = ?', [tradeId]);
    return row ? JSON.parse(row.data) : null;
  },

  async clearCache(): Promise<void> {
    const database = await initDb();
    await database.execAsync('DELETE FROM trades');
  },

  // Sync strategy: fetches fresh data if online, falls back to cache
  async syncTrades(isOnline: boolean): Promise<Trade[]> {
    if (isOnline) {
      try {
        const result = await tradeApi.listTrades();
        const trades = result.trades || [];
        await this.cacheTrades(trades);
        return trades;
      } catch (error) {
        console.error('Failed to sync trades with network, using cache fallback:', error);
        return this.getCachedTrades();
      }
    } else {
      return this.getCachedTrades();
    }
  },

  // Offline trade-creation queue (issue #268)
  async queueTradeCreation(payload: CreateTradePayload): Promise<PendingTrade> {
    const database = await initDb();
    const entry: PendingTrade = {
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      payload,
      status: 'pending',
      createdAt: Date.now(),
    };
    await database.runAsync(
      'INSERT INTO pending_trades (local_id, payload, status, error, created_at) VALUES (?, ?, ?, ?, ?)',
      [entry.localId, JSON.stringify(payload), entry.status, null, entry.createdAt]
    );
    return entry;
  },

  async getPendingTrades(): Promise<PendingTrade[]> {
    const database = await initDb();
    const rows = await database.getAllAsync<{
      local_id: string;
      payload: string;
      status: 'pending' | 'failed';
      error: string | null;
      created_at: number;
    }>('SELECT local_id, payload, status, error, created_at FROM pending_trades ORDER BY created_at DESC');
    return rows.map((r) => ({
      localId: r.local_id,
      payload: JSON.parse(r.payload),
      status: r.status,
      error: r.error ?? undefined,
      createdAt: r.created_at,
    }));
  },

  async removePendingTrade(localId: string): Promise<void> {
    const database = await initDb();
    await database.runAsync('DELETE FROM pending_trades WHERE local_id = ?', [localId]);
  },

  async retryPendingTrade(localId: string): Promise<void> {
    const database = await initDb();
    await database.runAsync(
      "UPDATE pending_trades SET status = 'pending', error = NULL WHERE local_id = ?",
      [localId]
    );
  },

  /**
   * Replays every `pending` row against the API. Successes are removed from
   * the queue; server rejections are marked `failed` with the reason; network
   * errors leave the row `pending` for the next sync.
   */
  async syncPendingTrades(): Promise<PendingTradeSyncResult> {
    const database = await initDb();
    const result: PendingTradeSyncResult = { created: [], failed: [] };
    const queued = (await this.getPendingTrades()).filter((p) => p.status === 'pending');
    for (const entry of queued.reverse()) {
      try {
        const created = await tradeApi.createTrade(entry.payload);
        await this.removePendingTrade(entry.localId);
        result.created.push({ localId: entry.localId, tradeId: created.tradeId });
      } catch (error) {
        if (isNetworkError(error)) break;
        const message = errorMessage(error);
        await database.runAsync(
          "UPDATE pending_trades SET status = 'failed', error = ? WHERE local_id = ?",
          [message, entry.localId]
        );
        result.failed.push({ ...entry, status: 'failed', error: message });
      }
    }
    return result;
  },

  // Offline action queue: per-action status lives in offlineQueueStore so the
  // UI can show pending/succeeded/failed and retry a single item.
  queueAction(label: string, run: () => Promise<unknown>): string {
    return useOfflineQueueStore.getState().enqueue(label, run);
  },

  retryQueuedAction(id: string): Promise<void> {
    return useOfflineQueueStore.getState().retry(id);
  },

  flushQueue(): Promise<void> {
    return useOfflineQueueStore.getState().flush();
  },

  // Set up listeners for app foregrounding to trigger auto-sync
  setupForegroundSync(onSyncComplete: (trades: Trade[]) => void, checkOnlineStatus: () => Promise<boolean>) {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const online = await checkOnlineStatus();
        const trades = await this.syncTrades(online);
        onSyncComplete(trades);
      }
    });
    return () => subscription.remove();
  }
};
