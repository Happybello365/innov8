import { renderHook } from '@testing-library/react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useNetworkStatus } from './useNetworkStatus';

jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: jest.fn() }));

const mockNetInfo = useNetInfo as jest.Mock;

const setNetInfo = (isConnected: boolean | null, isInternetReachable: boolean | null) =>
  mockNetInfo.mockReturnValue({ isConnected, isInternetReachable });

describe('useNetworkStatus', () => {
  beforeEach(() => mockNetInfo.mockReset());

  it('treats the unknown state (netinfo not yet reported) as offline', () => {
    setNetInfo(null, null);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(true);
  });

  it('reports online when connected and the internet is reachable', () => {
    setNetInfo(true, true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(false);
  });

  it('reports offline when disconnected', () => {
    setNetInfo(false, false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(true);
  });

  it('reports offline when connected to Wi-Fi but the internet is unreachable', () => {
    setNetInfo(true, false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(true);
  });

  it('reports online while connected and reachability is still unknown', () => {
    setNetInfo(true, null);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(false);
  });

  it('reports offline when disconnected even if reachability is unknown', () => {
    setNetInfo(false, null);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(true);
  });

  it('follows transitions unknown -> online -> offline -> online', () => {
    setNetInfo(null, null);
    const { result, rerender } = renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(true);

    setNetInfo(true, true);
    rerender({});
    expect(result.current.isOffline).toBe(false);

    setNetInfo(false, false);
    rerender({});
    expect(result.current.isOffline).toBe(true);

    setNetInfo(true, true);
    rerender({});
    expect(result.current.isOffline).toBe(false);
  });
});
