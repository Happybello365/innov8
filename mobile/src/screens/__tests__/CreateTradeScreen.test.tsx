/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Keypair } from '@stellar/stellar-sdk';
import CreateTradeScreen from '../CreateTradeScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockCreateTrade = jest.fn();
jest.mock('../../stores/tradeStore', () => ({
  useTradeStore: () => ({ createTrade: mockCreateTrade }),
}));

const SELLER = Keypair.random().publicKey();
const navigation = { replace: jest.fn(), goBack: jest.fn() } as any;
const route = { key: 'CreateTrade', name: 'CreateTrade' } as any;

function renderScreen() {
  return render(<CreateTradeScreen navigation={navigation} route={route} />);
}

function fillStep1(screen: ReturnType<typeof renderScreen>) {
  fireEvent.press(screen.getByText('Rice'));
  fireEvent.press(screen.getByText('tonnes'));
  fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '10');
  fireEvent.changeText(screen.getByPlaceholderText('e.g. 450'), '200');
  fireEvent.changeText(screen.getByPlaceholderText('G...'), SELLER);
}

function goToReview(screen: ReturnType<typeof renderScreen>) {
  fillStep1(screen);
  fireEvent.press(screen.getByText('Continue'));
  fireEvent.press(screen.getByText('+10%'));
  fireEvent.press(screen.getByText('Review'));
  expect(screen.getByText('Step 3: Review & Submit')).toBeTruthy();
}

// The header title and the submit button both read "Create Trade"; the button renders last.
function pressSubmit(screen: ReturnType<typeof renderScreen>) {
  const matches = screen.getAllByText('Create Trade');
  return matches[matches.length - 1];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('CreateTradeScreen', () => {
  it('walks through the wizard and shows the review summary', () => {
    const screen = renderScreen();
    expect(screen.getByText('Step 1: Details')).toBeTruthy();
    fillStep1(screen);
    expect(screen.getByText(`NGN ${(2000).toLocaleString()}`)).toBeTruthy();
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Step 2: Negotiation')).toBeTruthy();
    fireEvent.press(screen.getByText('+10%'));
    fireEvent.press(screen.getByText('Review'));

    expect(screen.getByText('Rice')).toBeTruthy();
    expect(screen.getByText('10 tonnes')).toBeTruthy();
    expect(screen.getByText(SELLER)).toBeTruthy();
    expect(screen.getByText('Buyer 60% / Seller 40%')).toBeTruthy();
    expect(screen.getByText('7 days')).toBeTruthy();
  });

  it('submits the trade and navigates to the trade detail screen', async () => {
    mockCreateTrade.mockResolvedValue({ tradeId: 'trade-42', unsignedXdr: 'xdr' });
    const screen = renderScreen();
    goToReview(screen);
    fireEvent.press(pressSubmit(screen));

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('TradeDetail', { tradeId: 'trade-42' }),
    );
    expect(mockCreateTrade).toHaveBeenCalledWith({
      sellerAddress: SELLER,
      amountUsdc: '2000',
      buyerLossBps: 6000,
      sellerLossBps: 4000,
      commodity: 'Rice',
      quantity: '10',
      unit: 'tonnes',
    });
    expect(Alert.alert).toHaveBeenCalledWith('Trade Created', expect.stringContaining('trade-42'));
  });

  it('shows a server-side error alert (not inline validation) when the store returns null', async () => {
    mockCreateTrade.mockResolvedValue(null);
    const screen = renderScreen();
    goToReview(screen);
    fireEvent.press(pressSubmit(screen));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to create trade. Please try again.'),
    );
    expect(navigation.replace).not.toHaveBeenCalled();
    // Still on the review step with no client-side validation messages.
    expect(screen.getAllByText('Create Trade')).toHaveLength(2);
    expect(screen.queryByText('Invalid Stellar public key')).toBeNull();
    expect(screen.queryByText('Loss ratios must sum to 100%')).toBeNull();
  });

  it('surfaces the thrown server error message', async () => {
    mockCreateTrade.mockRejectedValue(new Error('Seller account not found'));
    const screen = renderScreen();
    goToReview(screen);
    fireEvent.press(pressSubmit(screen));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Seller account not found'),
    );
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getAllByText('Create Trade')).toHaveLength(2);
  });

  it('falls back to a generic message for errors without one', async () => {
    mockCreateTrade.mockRejectedValue(undefined);
    const screen = renderScreen();
    goToReview(screen);
    fireEvent.press(pressSubmit(screen));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to create trade'));
  });

  it('shows client-side validation errors inline without calling the server', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Select a commodity')).toBeTruthy();
    expect(screen.getByText('Quantity must be greater than 0')).toBeTruthy();
    expect(screen.getByText('Price must be greater than 0')).toBeTruthy();
    expect(screen.getByText('Invalid Stellar public key')).toBeTruthy();
    expect(screen.getByText('Step 1: Details')).toBeTruthy();
    expect(mockCreateTrade).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('validates the delivery window on step 2', () => {
    const screen = renderScreen();
    fillStep1(screen);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByPlaceholderText('7'), '120');
    fireEvent.press(screen.getByText('Review'));
    expect(screen.getByText('Delivery window must be between 1 and 90 days')).toBeTruthy();
    fireEvent.press(screen.getByText('−10%'));
    expect(screen.getByText('40 / 60')).toBeTruthy();
  });

  it('navigates back through steps, then leaves the screen', () => {
    const screen = renderScreen();
    goToReview(screen);
    fireEvent.press(screen.getAllByText('Back')[0]);
    expect(screen.getByText('Step 2: Negotiation')).toBeTruthy();
    fireEvent.press(screen.getAllByText('Back')[0]);
    expect(screen.getByText('Step 1: Details')).toBeTruthy();
    fireEvent.press(screen.getByText('← Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('header back on later steps goes to the previous step', () => {
    const screen = renderScreen();
    goToReview(screen);
    fireEvent.press(screen.getByText('← Back'));
    expect(screen.getByText('Step 2: Negotiation')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
