/* eslint-disable no-undef */
import { useOfflineQueueStore } from './offlineQueueStore';

describe('offlineQueueStore', () => {
  beforeEach(() => {
    useOfflineQueueStore.getState().reset();
  });

  it('enqueues actions as pending', () => {
    useOfflineQueueStore.getState().enqueue('Confirm delivery', jest.fn());
    expect(useOfflineQueueStore.getState().actions).toEqual([
      expect.objectContaining({ label: 'Confirm delivery', status: 'pending', attempts: 0 }),
    ]);
  });

  it('marks each action succeeded or failed independently on flush', async () => {
    const ok = jest.fn().mockResolvedValue(undefined);
    const bad = jest.fn().mockRejectedValue(new Error('Network Error'));
    const { enqueue, flush } = useOfflineQueueStore.getState();
    const okId = enqueue('A', ok);
    const badId = enqueue('B', bad);

    await flush();

    const byId = Object.fromEntries(useOfflineQueueStore.getState().actions.map((a) => [a.id, a]));
    expect(byId[okId].status).toBe('succeeded');
    expect(byId[badId]).toEqual(expect.objectContaining({ status: 'failed', error: 'Network Error' }));
  });

  it('retries a single failed action without re-running the rest of the queue', async () => {
    const other = jest.fn().mockRejectedValue(new Error('still down'));
    const flaky = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(undefined);
    const { enqueue, flush, retry } = useOfflineQueueStore.getState();
    const otherId = enqueue('Other', other);
    const flakyId = enqueue('Flaky', flaky);

    await flush();
    expect(other).toHaveBeenCalledTimes(1);

    await retry(flakyId);

    const actions = useOfflineQueueStore.getState().actions;
    expect(actions.find((a) => a.id === flakyId)?.status).toBe('succeeded');
    expect(actions.find((a) => a.id === otherId)?.status).toBe('failed');
    expect(other).toHaveBeenCalledTimes(1);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it('does not re-run succeeded actions', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const id = useOfflineQueueStore.getState().enqueue('Once', run);
    await useOfflineQueueStore.getState().retry(id);
    await useOfflineQueueStore.getState().retry(id);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
