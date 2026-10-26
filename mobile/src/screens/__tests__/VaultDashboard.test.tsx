/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { Linking, RefreshControl } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import VaultDashboard from '../VaultDashboard';
import type { Trade } from '../../types/trade';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockTradeState: any = {};
const mockAuthState: any = {};

jest.mock('../../stores/tradeStore', () => ({
  useTradeStore: () => mockTradeState,
}));
jest.mock('../../stores/authStore', () => ({
  useAuthStore: () => mockAuthState,
}));

function makeTrade(id: string, status: string, amountUsdc: string): Trade {
  return { tradeId: id, status, amountUsdc } as unknown as Trade;
}

const errorView = {
  title: 'Load failed',
  message: 'Could not load trades',
  action: 'retry' as const,
  code: 'NETWORK',
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockTradeState, {
    trades: [],
    isLoading: false,
    errorView: null,
    lastActionErrorView: null,
    fetchTrades: jest.fn().mockResolvedValue(undefined),
    clearErrorView: jest.fn(),
  });
  Object.assign(mockAuthState, {
    walletAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQR',
    clearAuth: jest.fn().mockResolvedValue(undefined),
  });
});

describe('VaultDashboard', () => {
  it('fetches trades on mount', () => {
    render(<VaultDashboard />);
    expect(mockTradeState.fetchTrades).toHaveBeenCalledTimes(1);
  });

  it('renders the loading skeleton while loading', () => {
    mockTradeState.isLoading = true;
    const { getByText, queryByText } = render(<VaultDashboard />);
    expect(getByText('Vault Dashboard')).toBeTruthy();
    expect(queryByText('Total Locked')).toBeNull();
  });

  it('renders the empty state with zero trades', () => {
    const { getByText } = render(<VaultDashboard />);
    expect(getByText('No trades yet')).toBeTruthy();
    expect(getByText('$0.00')).toBeTruthy();
    expect(getByText('0')).toBeTruthy();
  });

  it('renders a single trade', () => {
    mockTradeState.trades = [makeTrade('abcdef1234567890', 'FUNDED', '100.5')];
    const { getByText, queryByText } = render(<VaultDashboard />);
    expect(getByText('#abcdef12')).toBeTruthy();
    expect(getByText('100.5 USDC')).toBeTruthy();
    expect(getByText('$100.50')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(queryByText('No trades yet')).toBeNull();
  });

  it('renders several trades and only counts active ones toward totals', () => {
    mockTradeState.trades = [
      makeTrade('trade-aaa-0001', 'FUNDED', '100'),
      makeTrade('trade-bbb-0002', 'IN_TRANSIT', '50.25'),
      makeTrade('trade-ccc-0003', 'COMPLETED', '999'),
      makeTrade('trade-ddd-0004', 'FUNDED', ''),
    ];
    const { getByText } = render(<VaultDashboard />);
    expect(getByText('#trade-aa')).toBeTruthy();
    expect(getByText('#trade-cc')).toBeTruthy();
    expect(getByText('$150.25')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('shows at most 10 recent trades', () => {
    mockTradeState.trades = Array.from({ length: 12 }, (_, i) =>
      makeTrade(`t${String(i).padStart(2, '0')}xxxxxxxx`, 'COMPLETED', '1'),
    );
    const { queryByText } = render(<VaultDashboard />);
    expect(queryByText('#t09xxxxx')).toBeTruthy();
    expect(queryByText('#t10xxxxx')).toBeNull();
  });

  it('shows a shortened wallet address, or "Not connected"', () => {
    const { getByText, rerender } = render(<VaultDashboard />);
    expect(getByText('GABCDE…OPQR')).toBeTruthy();
    mockAuthState.walletAddress = null;
    rerender(<VaultDashboard />);
    expect(getByText('Not connected')).toBeTruthy();
  });

  it('re-fetches trades on pull-to-refresh and toggles the refreshing flag', async () => {
    let resolveFetch: () => void = () => {};
    mockTradeState.trades = [makeTrade('trade-aaa-0001', 'FUNDED', '10')];
    const { UNSAFE_getByType } = render(<VaultDashboard />);
    mockTradeState.fetchTrades.mockImplementationOnce(
      () => new Promise<void>((r) => { resolveFetch = r; }),
    );

    const refresh = UNSAFE_getByType(RefreshControl);
    expect(refresh.props.refreshing).toBe(false);

    act(() => {
      void refresh.props.onRefresh();
    });
    expect(mockTradeState.fetchTrades).toHaveBeenCalledTimes(2);
    expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);

    await act(async () => {
      resolveFetch();
    });
    expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  it('keeps the list visible (no skeleton) while refreshing even if the store reports loading', async () => {
    let resolveFetch: () => void = () => {};
    mockTradeState.trades = [makeTrade('trade-aaa-0001', 'FUNDED', '10')];
    const { UNSAFE_getByType, getByText, rerender } = render(<VaultDashboard />);
    mockTradeState.fetchTrades.mockImplementationOnce(
      () => new Promise<void>((r) => { resolveFetch = r; }),
    );
    act(() => {
      void UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    mockTradeState.isLoading = true;
    rerender(<VaultDashboard />);
    expect(getByText('Total Locked')).toBeTruthy();
    await act(async () => {
      resolveFetch();
    });
  });

  it('renders a full-screen error banner when there are no trades', () => {
    mockTradeState.errorView = errorView;
    const { getByTestId, getByText, queryByText } = render(<VaultDashboard />);
    expect(getByTestId('admin-error-banner')).toBeTruthy();
    expect(getByText('Could not load trades')).toBeTruthy();
    expect(queryByText('Total Locked')).toBeNull();

    fireEvent.press(getByTestId('admin-error-banner-primary-retry'));
    expect(mockTradeState.fetchTrades).toHaveBeenCalledTimes(2);
  });

  it('prefers the action error over the load error and keeps trades visible', () => {
    mockTradeState.trades = [makeTrade('trade-aaa-0001', 'FUNDED', '10')];
    mockTradeState.errorView = errorView;
    mockTradeState.lastActionErrorView = {
      title: 'Action failed',
      message: 'Deposit failed',
      action: 'go_back',
      code: 'ACTION',
    };
    const { getByText, queryByText, getByTestId } = render(<VaultDashboard />);
    expect(getByText('Deposit failed')).toBeTruthy();
    expect(queryByText('Could not load trades')).toBeNull();
    expect(getByText('Total Locked')).toBeTruthy();

    fireEvent.press(getByTestId('admin-error-banner-primary-go_back'));
    expect(mockTradeState.clearErrorView).toHaveBeenCalled();
  });

  it('wires sign-out and contact-support banner actions', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockTradeState.errorView = { ...errorView, action: 'sign_out_required', requestId: 'req-1' };
    const { getByTestId, rerender } = render(<VaultDashboard />);
    fireEvent.press(getByTestId('admin-error-banner-primary-sign_out_required'));
    await waitFor(() => expect(mockAuthState.clearAuth).toHaveBeenCalled());

    mockTradeState.errorView = { ...errorView, action: 'contact_support', requestId: 'req-1' };
    rerender(<VaultDashboard />);
    fireEvent.press(getByTestId('admin-error-banner-primary-contact_support'));
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining('mailto:'));
    expect(openURL.mock.calls[0][0]).toContain('req-1');
  });
});
