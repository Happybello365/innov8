/**
 * #270 — trade list and detail use a two-column layout above the tablet
 * breakpoint and the existing push-navigation flow on phones.
 */
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { BREAKPOINTS, LAYOUT } from '../../constants/theme';
import { layoutClassFor, useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import TradeListScreen from '../TradeListScreen';

const trades = [
  { tradeId: 'trade-aaaaaaaa', status: 'FUNDED', amountUsdc: '10', buyerAddress: 'GBUYER0000000001', sellerAddress: 'GSELLER000000001' },
  { tradeId: 'trade-bbbbbbbb', status: 'PENDING', amountUsdc: '20', buyerAddress: 'GBUYER0000000002', sellerAddress: 'GSELLER000000002' },
];

jest.mock('../../stores/tradeStore', () => ({
  useTradeStore: () => ({ trades, isLoading: false, errorView: null, fetchTrades: jest.fn(), clearErrorView: jest.fn() }),
}));
jest.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ clearAuth: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../TradeDetailScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ route, embedded }: { route: { params: { tradeId: string } }; embedded?: boolean }) => (
      <Text testID="embedded-detail">{`${route.params.tradeId}:${embedded ? 'embedded' : 'screen'}`}</Text>
    ),
  };
});

let mockWidth = 390;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 1024, scale: 2, fontScale: 1 }),
}));

function setWidth(width: number) {
  mockWidth = width;
}

const navigation = { navigate: jest.fn(), replace: jest.fn() } as never;

afterEach(() => {
  mockWidth = 390;
});

describe('layoutClassFor', () => {
  it('classifies phone, tablet and wide widths at the breakpoints', () => {
    expect(layoutClassFor(BREAKPOINTS.tablet - 1)).toBe('phone');
    expect(layoutClassFor(BREAKPOINTS.tablet)).toBe('tablet');
    expect(layoutClassFor(BREAKPOINTS.wide)).toBe('wide');
  });
});

describe('useResponsiveLayout', () => {
  it('stays single-column with no width cap on phones', () => {
    setWidth(390);
    const { result } = renderHook(() => useResponsiveLayout());
    expect(result.current.isTwoColumn).toBe(false);
    expect(result.current.contentStyle).toBeUndefined();
  });

  it('switches to two columns with a clamped list pane on tablets', () => {
    setWidth(1024);
    const { result } = renderHook(() => useResponsiveLayout());
    expect(result.current.isTwoColumn).toBe(true);
    expect(result.current.listPaneWidth).toBeGreaterThanOrEqual(LAYOUT.listPaneMin);
    expect(result.current.listPaneWidth).toBeLessThanOrEqual(LAYOUT.listPaneMax);
    expect(result.current.contentStyle).toMatchObject({ maxWidth: LAYOUT.maxContentWidth });
  });
});

describe('TradeListScreen responsive layout (#270)', () => {
  it('phone: tapping a trade pushes the detail screen', () => {
    setWidth(390);
    render(<TradeListScreen navigation={navigation} route={{ key: 'k', name: 'TradeList' } as never} />);
    expect(screen.queryByTestId('trade-detail-pane')).toBeNull();
    fireEvent.press(screen.getByTestId('trade-card-trade-bbbbbbbb'));
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('TradeDetail', { tradeId: 'trade-bbbbbbbb' });
  });

  it('tablet: shows list and embedded detail side by side, first trade selected', () => {
    setWidth(1024);
    render(<TradeListScreen navigation={navigation} route={{ key: 'k', name: 'TradeList' } as never} />);
    expect(screen.getByTestId('trade-detail-pane')).toBeTruthy();
    expect(screen.getByTestId('embedded-detail').props.children).toBe('trade-aaaaaaaa:embedded');
  });

  it('tablet: tapping a trade updates the detail pane instead of navigating', () => {
    setWidth(1024);
    (navigation as { navigate: jest.Mock }).navigate.mockClear();
    render(<TradeListScreen navigation={navigation} route={{ key: 'k', name: 'TradeList' } as never} />);
    fireEvent.press(screen.getByTestId('trade-card-trade-bbbbbbbb'));
    expect(screen.getByTestId('embedded-detail').props.children).toBe('trade-bbbbbbbb:embedded');
    expect((navigation as { navigate: jest.Mock }).navigate).not.toHaveBeenCalledWith('TradeDetail', expect.anything());
    expect(screen.getByTestId('trade-card-trade-bbbbbbbb').props.accessibilityState).toMatchObject({ selected: true });
  });
});
