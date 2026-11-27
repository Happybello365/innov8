import { renderHook, act } from '@testing-library/react-native';
import { parseDeepLink } from '../../constants/links';
import { useDeepLink, __clearPendingDeepLink } from '../useDeepLink';
import * as authStore from '../../stores/authStore';

/**
 * Deep-link guard for recovery / inbound links (issue #517).
 *
 * Malformed, unknown, or placeholder-id links must be rejected before any
 * navigation or login-parking happens, and a rejected link must not disturb a
 * link that is already parked for after login.
 */

jest.mock('../../stores/authStore', () => ({ useAuthStore: jest.fn() }));

const setAuth = (token: string | null) =>
  (authStore.useAuthStore as jest.Mock).mockReturnValue({ token });

const makeNav = () => ({ navigate: jest.fn() });

describe('parseDeepLink guard (issue #517)', () => {
  it.each([
    ['placeholder "undefined" id (custom scheme)', 'amanavault://trades/undefined'],
    ['placeholder "null" id (universal link)', 'https://amanavault.app/trades/null'],
    ['placeholder id on the evidence route', '/evidence/undefined'],
    ['empty dispute id', 'amanavault://disputes/'],
    ['extra path segments after a trade id', 'https://amanavault.app/trades/T1/extra'],
    ['unknown custom-scheme host', 'evil://trades/T1'],
    ['unparseable absolute URL', 'https://'],
    ['non-string input', 42 as unknown as string],
  ])('rejects %s', (_label, input) => {
    expect(parseDeepLink(input as string)).toBeNull();
  });

  it('still accepts a well-formed custom-scheme trade link', () => {
    expect(parseDeepLink('amanavault://trades/T-1')).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-1' },
    });
  });
});

describe('useDeepLink guard (issue #517)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __clearPendingDeepLink();
  });

  it('does not navigate on a malformed link while authenticated', () => {
    setAuth('tok');
    const nav = makeNav();
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('amanavault://trades/undefined', nav as never);
    });

    expect(nav.navigate).not.toHaveBeenCalled();
    expect(result.current.pendingDeepLink).toBeNull();
  });

  it('keeps a parked link when a later malformed link arrives', () => {
    setAuth(null);
    const nav = makeNav();
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('amanavault://trades/T-9', nav as never);
    });
    const parked = result.current.pendingDeepLink;

    act(() => {
      result.current.handleUrl('amanavault://trades/null', nav as never);
    });

    expect(result.current.pendingDeepLink).toEqual(parked);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('does not replay a parked link while still signed out', () => {
    setAuth(null);
    const nav = makeNav();
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleUrl('amanavault://trades/T-9', nav as never);
      result.current.resumePendingDeepLink(nav as never);
    });

    expect(nav.navigate).not.toHaveBeenCalled();
    expect(result.current.pendingDeepLink).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-9' },
    });
  });

  it('opens a public screen immediately even when signed out', () => {
    setAuth(null);
    const nav = makeNav();
    const { result } = renderHook(() => useDeepLink());

    act(() => {
      result.current.handleDeepLink({ screen: 'WalletConnect' }, nav as never);
    });

    expect(nav.navigate).toHaveBeenCalledWith('WalletConnect', undefined);
    expect(result.current.pendingDeepLink).toBeNull();
  });
});
