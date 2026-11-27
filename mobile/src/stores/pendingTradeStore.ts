import { create } from 'zustand';

import {
  offlineService,
  type CreateTradePayload,
  type PendingTrade,
  type PendingTradeSyncResult,
} from '../services/offline.service';

/**
 * Trades created while offline (issue #268). Kept apart from `tradeStore`
 * so the online trade flow doesn't take a dependency on SQLite.
 */
interface PendingTradeState {
  pendingTrades: PendingTrade[];
  isSyncing: boolean;
  load: () => Promise<void>;
  queue: (payload: CreateTradePayload) => Promise<PendingTrade>;
  /** Replays queued creations. Returns null if a sync is already running. */
  sync: () => Promise<PendingTradeSyncResult | null>;
  retry: (localId: string) => Promise<void>;
  dismiss: (localId: string) => Promise<void>;
}

export const usePendingTradeStore = create<PendingTradeState>((set, get) => ({
  pendingTrades: [],
  isSyncing: false,

  load: async () => {
    set({ pendingTrades: await offlineService.getPendingTrades() });
  },

  queue: async (payload) => {
    const entry = await offlineService.queueTradeCreation(payload);
    set({ pendingTrades: [entry, ...get().pendingTrades] });
    return entry;
  },

  sync: async () => {
    if (get().isSyncing) return null;
    set({ isSyncing: true });
    try {
      return await offlineService.syncPendingTrades();
    } finally {
      set({ isSyncing: false, pendingTrades: await offlineService.getPendingTrades() });
    }
  },

  retry: async (localId) => {
    await offlineService.retryPendingTrade(localId);
    await get().load();
  },

  dismiss: async (localId) => {
    await offlineService.removePendingTrade(localId);
    set({ pendingTrades: get().pendingTrades.filter((p) => p.localId !== localId) });
  },
}));
