/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import WalletConnectScreen from '../WalletConnectScreen';
import { authApi } from '../../api/auth';

jest.mock('../../api/auth', () => ({
  authApi: {
    generateChallenge: jest.fn(),
    verifyChallenge: jest.fn(),
  },
}));

const mockSetWalletAddress = jest.fn();
const mockSetToken = jest.fn();
jest.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    setWalletAddress: mockSetWalletAddress,
    setToken: mockSetToken,
  }),
}));

const VALID_ADDRESS = 'G' + 'A'.repeat(55);
const navigation = { replace: jest.fn() } as any;
const route = { key: 'WalletConnect', name: 'WalletConnect' } as any;

let promptCallback: ((value?: string) => Promise<void>) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  promptCallback = undefined;
  (Alert as any).prompt = jest.fn((_t: string, _m: string, cb: any) => {
    promptCallback = cb;
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockSetToken.mockResolvedValue(undefined);
});

function renderScreen() {
  return render(<WalletConnectScreen navigation={navigation} route={route} />);
}

async function connectWith(screen: ReturnType<typeof renderScreen>, address?: string) {
  fireEvent.press(screen.getByText('Connect Wallet'));
  expect(Alert.prompt).toHaveBeenCalled();
  await act(async () => {
    await promptCallback!(address);
  });
}

describe('WalletConnectScreen', () => {
  it('renders the initial disconnected state', () => {
    const screen = renderScreen();
    expect(screen.getByText('Connect your Stellar Wallet')).toBeTruthy();
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
    expect(authApi.generateChallenge).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('shows a spinner while the prompt is open', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Connect Wallet'));
    expect(screen.queryByText('Connect Wallet')).toBeNull();
  });

  it('connects successfully and navigates to the trade list', async () => {
    (authApi.generateChallenge as jest.Mock).mockResolvedValue({ challenge: 'chal' });
    (authApi.verifyChallenge as jest.Mock).mockResolvedValue({ token: 'jwt-token' });
    const screen = renderScreen();
    await connectWith(screen, VALID_ADDRESS);

    expect(authApi.generateChallenge).toHaveBeenCalledWith(VALID_ADDRESS);
    expect(authApi.verifyChallenge).toHaveBeenCalledWith(VALID_ADDRESS, 'chal');
    expect(mockSetToken).toHaveBeenCalledWith('jwt-token');
    expect(mockSetWalletAddress).toHaveBeenCalledWith(VALID_ADDRESS);
    expect(navigation.replace).toHaveBeenCalledWith('TradeList');
  });

  it('alerts and resets when the connection API fails', async () => {
    (authApi.generateChallenge as jest.Mock).mockRejectedValue(new Error('Network down'));
    const screen = renderScreen();
    await connectWith(screen, VALID_ADDRESS);

    expect(Alert.alert).toHaveBeenCalledWith('Connection failed', 'Network down');
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Connect Wallet')).toBeTruthy());
  });

  it('falls back to "Unknown error" when the failure has no message', async () => {
    (authApi.generateChallenge as jest.Mock).mockResolvedValue({ challenge: 'chal' });
    (authApi.verifyChallenge as jest.Mock).mockRejectedValue(undefined);
    const screen = renderScreen();
    await connectWith(screen, VALID_ADDRESS);
    expect(Alert.alert).toHaveBeenCalledWith('Connection failed', 'Unknown error');
  });

  it.each([
    ['empty', undefined],
    ['not a G key', 'X' + 'A'.repeat(55)],
    ['too short', 'GABC'],
  ])('rejects an invalid address (%s)', async (_label, address) => {
    const screen = renderScreen();
    await connectWith(screen, address);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Invalid address',
      'Please enter a valid Stellar public key.',
    );
    expect(authApi.generateChallenge).not.toHaveBeenCalled();
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
  });

  it('does not touch the auth store or navigate on mount (already-connected users are routed by the navigator)', () => {
    renderScreen();
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockSetWalletAddress).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('recovers if the prompt itself throws', () => {
    (Alert as any).prompt = jest.fn(() => {
      throw new Error('prompt unsupported');
    });
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Connect Wallet'));
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
  });
});
