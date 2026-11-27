import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import apiClient, {
  resetAuthRefreshState,
  setAuthRefreshHandlers,
  setSessionRevokedHandler,
} from '../client';
import { isSessionRevokedError, SESSION_REVOKED_CODE } from '../errorInterceptor';
import { useAuthStore } from '../../stores/authStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

function axiosErrorFor(
  config: InternalAxiosRequestConfig,
  status: number | undefined,
  data: unknown,
): AxiosError {
  const response = status
    ? ({ status, statusText: '', headers: {}, config, data } as AxiosResponse)
    : undefined;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, response);
}

describe('auth store on revocation', () => {
  it('drops the token and wallet when the server reports the session revoked', async () => {
    useAuthStore.setState({ token: 'live-token', walletAddress: 'GABC', isAdmin: true });
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      throw axiosErrorFor(config, 401, { code: SESSION_REVOKED_CODE });
    };

    try {
      await expect(apiClient.get('/trades')).rejects.toBeDefined();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.walletAddress).toBeNull();
    expect(state.isAdmin).toBe(false);
  });
});

describe('isSessionRevokedError', () => {
  it('is true for a 401 that reports SESSION_REVOKED', () => {
    const error = axiosErrorFor({} as InternalAxiosRequestConfig, 401, { code: SESSION_REVOKED_CODE });
    expect(isSessionRevokedError(error)).toBe(true);
  });

  it('is false for a 401 with a different or missing code', () => {
    const config = {} as InternalAxiosRequestConfig;
    expect(isSessionRevokedError(axiosErrorFor(config, 401, { code: 'TOKEN_EXPIRED' }))).toBe(false);
    expect(isSessionRevokedError(axiosErrorFor(config, 401, undefined))).toBe(false);
  });

  it('is false when the code is present on a non-401 status', () => {
    const config = {} as InternalAxiosRequestConfig;
    expect(isSessionRevokedError(axiosErrorFor(config, 403, { code: SESSION_REVOKED_CODE }))).toBe(false);
  });

  it('is false when there was no response at all (network failure)', () => {
    expect(isSessionRevokedError(axiosErrorFor({} as InternalAxiosRequestConfig, undefined, undefined))).toBe(false);
  });
});

describe('client handling of a revoked session', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let refresh: jest.Mock;
  let logout: jest.Mock;

  beforeEach(() => {
    resetAuthRefreshState();
    refresh = jest.fn(async () => 'new-token');
    logout = jest.fn();
    setAuthRefreshHandlers({ refresh, logout });
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    // Note: the revocation handler is left alone here; the auth store registers
    // its own at import time and the store test relies on that registration.
    setAuthRefreshHandlers({ refresh: async () => null, logout: () => undefined });
  });

  it('clears local access once and does not refresh or replay the request', async () => {
    const revoked = jest.fn(async () => undefined);
    setSessionRevokedHandler(revoked);
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw axiosErrorFor(config, 401, { code: SESSION_REVOKED_CODE });
    });
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/trades')).rejects.toMatchObject({ code: SESSION_REVOKED_CODE });

    expect(revoked).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('still rejects the request when the revocation handler itself throws', async () => {
    setSessionRevokedHandler(async () => {
      throw new Error('storage unavailable');
    });
    apiClient.defaults.adapter = async (config) => {
      throw axiosErrorFor(config, 401, { code: SESSION_REVOKED_CODE });
    };

    await expect(apiClient.get('/trades')).rejects.toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps the existing refresh path for ordinary 401s', async () => {
    const revoked = jest.fn();
    setSessionRevokedHandler(revoked);
    let calls = 0;
    apiClient.defaults.adapter = async (config) => {
      calls += 1;
      if (calls === 1) throw axiosErrorFor(config, 401, { code: 'TOKEN_EXPIRED' });
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config } as AxiosResponse;
    };

    await expect(apiClient.get('/trades')).resolves.toMatchObject({ data: { ok: true } });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(revoked).not.toHaveBeenCalled();
  });
});
