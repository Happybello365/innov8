import { renderHook, act } from '@testing-library/react-native';
import { useDeepLink, __clearPendingDeepLink } from './useDeepLink';
import * as authStore from '../stores/authStore';

jest.mock('../stores/authStore', () => ({ useAuthStore: jest.fn() }));

const setAuth = (token: string | null) =>
  (authStore.useAuthStore as jest.Mock).mockReturnValue({ token });

describe('useDeepLink (auth-aware routing)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __clearPendingDeepLink();
  });

  it('navigates immediately when authenticated (warm start)', () => {
    setAuth('tok');
    const nav = { navigate: jest.fn() } as never;
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('https://amanavault.app/trades/T1', nav);
    });

    expect((nav as unknown as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('TradeDetail', {
      tradeId: 'T1',
    });
    expect(result.current.pendingDeepLink).toBeNull();
  });

  it('parks a link that needs auth while signed out, then resumes after login', () => {
    setAuth(null);
    const nav = { navigate: jest.fn() } as never;
    const { result, rerender } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('amanavault://trades/T-789', nav);
    });

    expect((nav as unknown as { navigate: jest.Mock }).navigate).not.toHaveBeenCalled();
    expect(result.current.pendingDeepLink).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-789' },
    });

    // user logs in
    setAuth('tok');
    rerender();

    act(() => {
      result.current.resumePendingDeepLink(nav);
    });

    expect((nav as unknown as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('TradeDetail', {
      tradeId: 'T-789',
    });
    expect(result.current.pendingDeepLink).toBeNull();
  });

  it('ignores malformed links without parking anything', () => {
    setAuth(null);
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('https://amanavault.app/garbage');
    });

    expect(result.current.pendingDeepLink).toBeNull();
  });

  it('drops links from hosts or schemes outside the allowlist (issue #534)', () => {
    setAuth('tok');
    const nav = { navigate: jest.fn() } as never;
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('https://evil.example/trades/T1', nav);
      result.current.handleUrl('http://amanavault.app/trades/T1', nav);
      result.current.handleUrl('otherapp://trades/T1', nav);
    });

    expect((nav as unknown as { navigate: jest.Mock }).navigate).not.toHaveBeenCalled();
    expect(result.current.pendingDeepLink).toBeNull();
  });

  it('does not park a disallowed link while signed out', () => {
    setAuth(null);
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('https://evil.example/trades/T1');
    });

    expect(result.current.pendingDeepLink).toBeNull();
  });
});

it('only queues an allowlisted absolute URL during navigator startup', () => {
  __clearPendingDeepLink();
  setAuth('tok');
  const navigate = jest.fn();
  const isReady = jest.fn().mockReturnValue(false);
  const nav = { navigate, isReady } as never;
  const { result } = renderHook(() => useDeepLink());

  act(() => {
    result.current.handleUrl('/trades/T1', nav);
    result.current.handleUrl('https://amanavault.app:443/trades/T1', nav);
  });
  expect(result.current.pendingDeepLink).toBeNull();

  act(() => result.current.handleUrl('https://www.amanavault.app/trades/T1', nav));
  expect(navigate).toHaveBeenCalledTimes(0);
  expect(result.current.pendingDeepLink?.screen).toBe('TradeDetail');

  isReady.mockReturnValue(true);
  act(() => result.current.resumePendingDeepLink(nav));
  expect(navigate).toHaveBeenCalledWith('TradeDetail', { tradeId: 'T1' });
});
