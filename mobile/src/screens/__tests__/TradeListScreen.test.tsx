/**
 * Tests for TradeListScreen (issue #252).
 * Covers empty, loaded, error, and pull-to-refresh states, and
 * navigation to trade detail on row press.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import TradeListScreen from '../TradeListScreen';
import { useTradeStore } from '../../stores/tradeStore';
import { useAuthStore } from '../../stores/authStore';
import type { Trade } from '../../types/trade';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../stores/tradeStore');
jest.mock('../../stores/authStore');

jest.mock('../../components/AdminErrorBanner', () => ({
  AdminErrorBanner: ({ view }: { view: { title: string } }) => {
    const { Text } = require('react-native');
    return <Text>{view.title}</Text>;
  },
}));

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  replace: mockReplace,
  goBack: jest.fn(),
  dispatch: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => true),
  reset: jest.fn(),
  getParent: jest.fn(),
  getState: jest.fn(),
  setParams: jest.fn(),
} as any;

const mockRoute = { key: 'TradeList', name: 'TradeList', params: undefined } as any;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrade(id: number, status: Trade['status'] = 'PENDING'): Trade {
  return {
    id,
    tradeId: `trade-${id.toString().padStart(3, '0')}`,
    buyerAddress: 'GBUYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    sellerAddress: 'GSELLERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    amountUsdc: '500',
    status,
  };
}

const mockFetchTrades = jest.fn().mockResolvedValue(undefined);
const mockClearErrorView = jest.fn();
const mockClearAuth = jest.fn().mockResolvedValue(undefined);

function setupStore(overrides: Partial<ReturnType<typeof useTradeStore>> = {}) {
  (useTradeStore as unknown as jest.Mock).mockReturnValue({
    trades: [],
    isLoading: false,
    errorView: null,
    fetchTrades: mockFetchTrades,
    clearErrorView: mockClearErrorView,
    ...overrides,
  });
  (useAuthStore as unknown as jest.Mock).mockReturnValue({
    clearAuth: mockClearAuth,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchTrades.mockResolvedValue(undefined);
});

describe('Loading state', () => {
  it('shows spinner while loading', () => {
    setupStore({ isLoading: true, trades: [] });
    const { UNSAFE_getByType } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});

describe('Empty state', () => {
  it('shows empty-state message when no trades', async () => {
    setupStore({ trades: [] });
    const { getByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    await waitFor(() => {
      expect(getByText('No trades found')).toBeTruthy();
      expect(getByText('You have no trades yet.')).toBeTruthy();
    });
  });
});

describe('Loaded state', () => {
  it('renders trade cards with humanized status labels', async () => {
    setupStore({
      trades: [makeTrade(1, 'PENDING'), makeTrade(2, 'IN_TRANSIT'), makeTrade(3, 'COMPLETED')],
    });
    const { getByText, getAllByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    await waitFor(() => {
      expect(getByText('Pending')).toBeTruthy();
      expect(getByText('In Transit')).toBeTruthy();
      expect(getByText('Completed')).toBeTruthy();
    });
  });

  it('renders the correct trade IDs', async () => {
    setupStore({ trades: [makeTrade(1), makeTrade(2)] });
    const { getByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    await waitFor(() => {
      expect(getByText('#trade-00')).toBeTruthy();
    });
  });
});

describe('Error state', () => {
  it('renders the error banner when errorView is set', async () => {
    setupStore({
      errorView: {
        title: 'Failed to load trades',
        message: 'Network error',
        action: 'retry',
        code: 'NETWORK_ERROR',
      },
    });
    const { getByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    await waitFor(() => {
      expect(getByText('Failed to load trades')).toBeTruthy();
    });
  });
});

describe('Pull-to-refresh', () => {
  it('calls fetchTrades on refresh', async () => {
    setupStore({ trades: [makeTrade(1)] });
    const { UNSAFE_getByType } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    await waitFor(() => {
      const { FlatList } = require('react-native');
      const list = UNSAFE_getByType(FlatList);
      act(() => {
        list.props.refreshControl.props.onRefresh();
      });
    });
    await waitFor(() => {
      // fetchTrades called on mount + on refresh
      expect(mockFetchTrades).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Navigation', () => {
  it('navigates to TradeDetail when a trade card is pressed', async () => {
    const trade = makeTrade(99, 'FUNDED');
    setupStore({ trades: [trade] });
    const { getByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    await waitFor(() => getByText('#trade-09'));
    fireEvent.press(getByText('#trade-09'));
    expect(mockNavigate).toHaveBeenCalledWith('TradeDetail', { tradeId: 'trade-099' });
  });

  it('navigates to CreateTrade when + New is pressed', async () => {
    setupStore({ trades: [] });
    const { getByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    fireEvent.press(getByText('+ New'));
    expect(mockNavigate).toHaveBeenCalledWith('CreateTrade');
  });
});

describe('Filter tabs', () => {
  it('renders all filter options', () => {
    setupStore({ trades: [] });
    const { getByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    expect(getByText('All')).toBeTruthy();
    expect(getByText('Pending')).toBeTruthy();
    expect(getByText('Active')).toBeTruthy();
    expect(getByText('Disputed')).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
  });

  it('calls fetchTrades with status filter when a filter is pressed', () => {
    setupStore({ trades: [] });
    const { getByText } = render(
      <TradeListScreen navigation={mockNavigation} route={mockRoute} />,
    );
    fireEvent.press(getByText('Disputed'));
    expect(mockFetchTrades).toHaveBeenCalledWith({ status: 'DISPUTED' });
  });
});
