import { create } from 'zustand';

export type QueuedActionStatus = 'pending' | 'succeeded' | 'failed';

export interface QueuedAction {
  id: string;
  label: string;
  status: QueuedActionStatus;
  error?: string;
  attempts: number;
}

type Executor = () => Promise<unknown>;

// Executors are closures, so they live outside the serialisable store state.
const executors = new Map<string, Executor>();
let nextId = 0;

interface OfflineQueueState {
  actions: QueuedAction[];
  /** Queue an action made while offline. Returns its id. */
  enqueue: (label: string, run: Executor) => string;
  /** Run a single action, updating only that item's status. */
  retry: (id: string) => Promise<void>;
  /** Run every pending or failed action (e.g. on reconnect). */
  flush: () => Promise<void>;
  /** Drop succeeded actions from the list. */
  clearSucceeded: () => void;
  reset: () => void;
}

export const useOfflineQueueStore = create<OfflineQueueState>((set, get) => {
  const patch = (id: string, changes: Partial<QueuedAction>) =>
    set((state) => ({
      actions: state.actions.map((a) => (a.id === id ? { ...a, ...changes } : a)),
    }));

  return {
    actions: [],

    enqueue: (label, run) => {
      const id = `q-${Date.now()}-${nextId++}`;
      executors.set(id, run);
      set((state) => ({
        actions: [...state.actions, { id, label, status: 'pending', attempts: 0 }],
      }));
      return id;
    },

    retry: async (id) => {
      const action = get().actions.find((a) => a.id === id);
      const run = executors.get(id);
      if (!action || !run || action.status === 'succeeded') return;

      patch(id, { status: 'pending', error: undefined, attempts: action.attempts + 1 });
      try {
        await run();
        patch(id, { status: 'succeeded' });
        executors.delete(id);
      } catch (err: unknown) {
        patch(id, { status: 'failed', error: (err as Error)?.message ?? 'Unknown error' });
      }
    },

    flush: async () => {
      const ids = get()
        .actions.filter((a) => a.status !== 'succeeded')
        .map((a) => a.id);
      for (const id of ids) {
        await get().retry(id);
      }
    },

    clearSucceeded: () =>
      set((state) => ({ actions: state.actions.filter((a) => a.status !== 'succeeded') })),

    reset: () => {
      executors.clear();
      set({ actions: [] });
    },
  };
});
