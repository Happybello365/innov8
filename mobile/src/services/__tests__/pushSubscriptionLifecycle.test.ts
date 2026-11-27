/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  setupNotificationListeners,
  storePushTokenOnBackend,
} from '../notification.service';

/**
 * Push subscription lifecycle across login, logout and role changes (issue #518).
 *
 * The app has no topic model. Its subscription surface is the notification
 * listener pair plus the push-token sync to the backend, so these tests check
 * that listeners reconcile cleanly on teardown and re-subscribe, and that the
 * backend sync always uses the session token that is current at call time.
 */

jest.mock('expo-notifications', () => {
  const listeners = new Map<string, Set<(arg: any) => void>>();

  const addListener = (event: string, cb: (arg: any) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
    return { remove: jest.fn(() => listeners.get(event)!.delete(cb)) };
  };

  return {
    setNotificationHandler: jest.fn(),
    addNotificationResponseReceivedListener: jest.fn((cb) => addListener('response', cb)),
    addNotificationReceivedListener: jest.fn((cb) => addListener('received', cb)),
    AndroidImportance: { MAX: 5 },
    _emit: (event: string, arg: any) => {
      listeners.get(event)?.forEach((cb) => cb(arg));
    },
    _count: (event: string) => listeners.get(event)?.size ?? 0,
    _reset: () => listeners.clear(),
  };
});

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import * as Notifications from 'expo-notifications';

const tap = (tradeId: string) => ({
  notification: { request: { content: { data: { type: 'trade', tradeId } } } },
});

describe('push listener lifecycle (issue #518)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications as any)._reset();
  });

  it('delivers each tap to exactly one subscriber after a teardown and re-subscribe', () => {
    const first = jest.fn();
    const cleanup = setupNotificationListeners(first);
    cleanup();

    const second = jest.fn();
    setupNotificationListeners(second);

    (Notifications as any)._emit('response', tap('T-1'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ type: 'trade', tradeId: 'T-1' });
  });

  it('does not stack listeners when subscribed, torn down and subscribed again', () => {
    const cleanup = setupNotificationListeners(jest.fn());
    cleanup();
    setupNotificationListeners(jest.fn());

    expect((Notifications as any)._count('response')).toBe(1);
  });

  it('tolerates calling the cleanup more than once (repeated logout)', () => {
    const cleanup = setupNotificationListeners(jest.fn());

    expect(() => {
      cleanup();
      cleanup();
    }).not.toThrow();
    expect((Notifications as any)._count('response')).toBe(0);
  });

  it('stops delivering taps to a torn-down subscriber while a new one stays active', () => {
    const oldSub = jest.fn();
    const newSub = jest.fn();
    const cleanupOld = setupNotificationListeners(oldSub);
    setupNotificationListeners(newSub);

    cleanupOld();
    (Notifications as any)._emit('response', tap('T-2'));

    expect(oldSub).not.toHaveBeenCalled();
    expect(newSub).toHaveBeenCalledTimes(1);
  });
});

describe('push token sync on session change (issue #518)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = fetchMock;
  });

  it('sends the session token that is current at call time', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await storePushTokenOnBackend('ExponentPushToken[a]', 'token-user');
    await storePushTokenOnBackend('ExponentPushToken[a]', 'token-admin');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-user');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer token-admin');
  });

  it('reports failure when the backend rejects a revoked session (401)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await expect(storePushTokenOnBackend('ExponentPushToken[a]', 'stale')).resolves.toBe(false);
  });

  it('posts the push token to the user push-token endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await storePushTokenOnBackend('ExponentPushToken[a]', 'tok');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.amana.io/user/push-token');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      pushToken: 'ExponentPushToken[a]',
    });
  });
});
