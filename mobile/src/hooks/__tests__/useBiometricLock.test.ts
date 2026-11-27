import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useBiometricLock } from '../useBiometricLock';
import * as service from '../../services/biometricLock.service';

jest.mock('../../services/biometricLock.service', () => {
  const actual = jest.requireActual('../../services/biometricLock.service');
  return {
    shouldLockOnResume: actual.shouldLockOnResume,
    getBiometricLockSettings: jest.fn(),
    authenticateWithBiometrics: jest.fn(),
  };
});

const mocked = service as jest.Mocked<typeof service>;

describe('useBiometricLock (issue #258)', () => {
  let emit: (state: string) => Promise<void>;
  let now = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
      emit = async (state) => {
        await act(async () => {
          await (cb as (s: string) => Promise<void>)(state);
        });
      };
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('locks on resume after the idle timeout and stays locked until verified', async () => {
    mocked.getBiometricLockSettings.mockResolvedValue({ enabled: true, idleTimeoutMs: 60_000 });
    mocked.authenticateWithBiometrics.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useBiometricLock(true));

    await emit('background');
    now = 120_000;
    await emit('active');
    expect(result.current.locked).toBe(true);

    mocked.authenticateWithBiometrics.mockResolvedValueOnce(true);
    await act(() => result.current.unlock());
    expect(result.current.locked).toBe(false);
  });

  it('does not lock when resumed within the idle timeout', async () => {
    mocked.getBiometricLockSettings.mockResolvedValue({ enabled: true, idleTimeoutMs: 60_000 });
    const { result } = renderHook(() => useBiometricLock(true));

    await emit('background');
    now = 10_000;
    await emit('active');
    expect(result.current.locked).toBe(false);
    expect(mocked.authenticateWithBiometrics).not.toHaveBeenCalled();
  });

  it('leaves behavior unchanged when the setting is disabled', async () => {
    mocked.getBiometricLockSettings.mockResolvedValue({ enabled: false, idleTimeoutMs: 0 });
    const { result } = renderHook(() => useBiometricLock(true));

    await emit('background');
    now = 10 * 60_000;
    await emit('active');
    expect(result.current.locked).toBe(false);
    expect(mocked.authenticateWithBiometrics).not.toHaveBeenCalled();
  });

  it('does not subscribe while signed out', () => {
    renderHook(() => useBiometricLock(false));
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });
});
