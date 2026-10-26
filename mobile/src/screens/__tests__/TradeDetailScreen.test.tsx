/**
 * Tests for TradeDetailScreen (issue #251).
 * Covers each trade status rendering a distinct action set, and the
 * not-found / forbidden states.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import TradeDetailScreen from '../TradeDetailScreen';
import { useTradeStore } from '../../stores/tradeStore';
import { useAuthStore } from '../../stores/authStore';
import { tradeApi } from '../../api/trade';
import type { Trade } from '../../types/trade';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

jest.mock('../../stores/tradeStore');
jest.mock('../../stores/authStore');
jest.mock('../../api/trade', () => ({
  tradeApi: {
    listNotes: jest.fn(),
    addNote: jest.fn(),
  },
}));
jest.mock('../../services/offline.service', () => ({
  offlineService: {
    setSecureItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../components/AdminErrorBanner', () => ({
  AdminErrorBanner: ({ view, onGoBack }: { view: { title: string }; onGoBack?: () => void }) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <>
        <Text>{view.title}</Text>
        {onGoBack && <TouchableOpacity onPress={onGoBack}><Text>Go back</Text></TouchableOpacity>}
      </>
    );
  },
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
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
  replace: jest.fn(),
} as any;

function makeRoute(tradeId: string) {
  return { key: 'TradeDetail', name: 'TradeDetail', params: { tradeId } } as any;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    tradeId: 'trade-abc-001',
    buyerAddress: 'GBUYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    sellerAddress: 'GSELLERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    amountUsdc: '1000',
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

const mockFetchTrade = jest.fn();
const mockConfirmDelivery = jest.fn();
const mockInitiateDispute = jest.fn();
const mockReleaseFunds = jest.fn();
const mockDeposit = jest.fn();
const mockClearErrorView = jest.fn();
const mockClearAuth = jest.fn();

function setupStore(trade: Trade | null, overrides: Partial<ReturnType<typeof useTradeStore>> = {}) {
  (useTradeStore as unknown as jest.Mock).mockReturnValue({
    currentTrade: trade,
    isLoading: false,
    errorView: null,
    lastActionErrorView: null,
    fetchTrade: mockFetchTrade.mockResolvedValue(undefined),
    confirmDelivery: mockConfirmDelivery.mockResolvedValue(undefined),
    initiateDispute: mockInitiateDispute.mockResolvedValue(undefined),
    releaseFunds: mockReleaseFunds.mockResolvedValue(undefined),
    deposit: mockDeposit.mockResolvedValue(undefined),
    clearErrorView: mockClearErrorView,
    ...overrides,
  });
  (useAuthStore as unknown as jest.Mock).mockReturnValue({
    clearAuth: mockClearAuth.mockResolvedValue(undefined),
  });
  (tradeApi.listNotes as jest.Mock).mockResolvedValue({ notes: [] });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Loading state', () => {
  it('shows activity indicator while loading with no trade', () => {
    setupStore(null, { isLoading: true });
    const { UNSAFE_getByType } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});

describe('Not-found / forbidden state', () => {
  it('renders not-found banner when trade is null and not loading', () => {
    setupStore(null, { isLoading: false });
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('missing-id')} />,
    );
    expect(getByText('Trade not found')).toBeTruthy();
  });

  it('renders server-supplied error view when present', () => {
    setupStore(null, {
      isLoading: false,
      errorView: {
        title: 'Access denied',
        message: 'You do not have permission.',
        action: 'go_back',
        code: 'FORBIDDEN',
      },
    });
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-forbidden')} />,
    );
    expect(getByText('Access denied')).toBeTruthy();
  });
});

describe('PENDING status', () => {
  it('shows Deposit Funds action and correct status badge', async () => {
    setupStore(makeTrade({ status: 'PENDING' }));
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('Pending')).toBeTruthy();
      expect(getByText('💰 Deposit Funds')).toBeTruthy();
    });
  });

  it('does not show Confirm Delivery or Release Funds for PENDING', async () => {
    setupStore(makeTrade({ status: 'PENDING' }));
    const { queryByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(queryByText('✅ Confirm Delivery')).toBeNull();
      expect(queryByText('💸 Release Funds')).toBeNull();
    });
  });
});

describe('FUNDED status', () => {
  it('shows Confirm Delivery and Initiate Dispute actions', async () => {
    setupStore(makeTrade({ status: 'FUNDED' }));
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('Funded')).toBeTruthy();
      expect(getByText('✅ Confirm Delivery')).toBeTruthy();
      expect(getByText('⚠️ Initiate Dispute')).toBeTruthy();
    });
  });
});

describe('IN_TRANSIT status', () => {
  it('shows Confirm Delivery and Initiate Dispute actions', async () => {
    setupStore(makeTrade({ status: 'IN_TRANSIT' }));
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('In Transit')).toBeTruthy();
      expect(getByText('✅ Confirm Delivery')).toBeTruthy();
      expect(getByText('⚠️ Initiate Dispute')).toBeTruthy();
    });
  });
});

describe('DELIVERED status', () => {
  it('shows Release Funds and Initiate Dispute actions', async () => {
    setupStore(makeTrade({ status: 'DELIVERED' }));
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('Delivered')).toBeTruthy();
      expect(getByText('💸 Release Funds')).toBeTruthy();
      expect(getByText('⚠️ Initiate Dispute')).toBeTruthy();
    });
  });
});

describe('DISPUTED status', () => {
  it('shows Upload Evidence action', async () => {
    setupStore(makeTrade({ status: 'DISPUTED' }));
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('Disputed')).toBeTruthy();
      expect(getByText('📹 Upload Evidence')).toBeTruthy();
    });
  });

  it('navigates to EvidenceCapture on Upload Evidence press', async () => {
    setupStore(makeTrade({ status: 'DISPUTED' }));
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => getByText('📹 Upload Evidence'));
    fireEvent.press(getByText('📹 Upload Evidence'));
    expect(mockNavigate).toHaveBeenCalledWith('EvidenceCapture', { tradeId: 'trade-abc-001' });
  });
});

describe('COMPLETED status', () => {
  it('shows no action buttons and fallback text', async () => {
    setupStore(makeTrade({ status: 'COMPLETED' }));
    const { getByText, queryByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('Completed')).toBeTruthy();
      expect(getByText('No actions available for this trade status.')).toBeTruthy();
      expect(queryByText('💰 Deposit Funds')).toBeNull();
    });
  });
});

describe('REFUNDED status', () => {
  it('shows no action buttons and fallback text', async () => {
    setupStore(makeTrade({ status: 'REFUNDED' }));
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('Refunded')).toBeTruthy();
      expect(getByText('No actions available for this trade status.')).toBeTruthy();
    });
  });
});

describe('Notes', () => {
  it('shows empty notes state initially', async () => {
    setupStore(makeTrade());
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('No notes yet.')).toBeTruthy();
    });
  });

  it('renders loaded notes', async () => {
    setupStore(makeTrade());
    (tradeApi.listNotes as jest.Mock).mockResolvedValue({
      notes: [
        {
          id: 'note-1',
          tradeId: 'trade-abc-001',
          authorAddress: 'GBUYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          content: 'Shipment en route',
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      ],
    });
    const { getByText } = render(
      <TradeDetailScreen navigation={mockNavigation} route={makeRoute('trade-abc-001')} />,
    );
    await waitFor(() => {
      expect(getByText('Shipment en route')).toBeTruthy();
    });
  });
});
