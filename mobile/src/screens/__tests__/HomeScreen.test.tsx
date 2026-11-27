/**
 * Tests for HomeScreen (issue #250).
 * Covers rendered content and navigation from the Help & FAQ card.
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../HomeScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const mockOpenURL = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: mockOpenURL,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
  getInitialURL: jest.fn().mockResolvedValue(null),
  canOpenURL: jest.fn().mockResolvedValue(true),
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
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

const mockRoute = { key: 'Home', name: 'Home', params: undefined } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenURL.mockResolvedValue(undefined);
});

test('renders title and subtitle', () => {
  const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
  expect(getByText('Stellar Mobile')).toBeTruthy();
  expect(getByText('Trust as a Service for Agricultural Products')).toBeTruthy();
});

test('renders Getting Started section', () => {
  const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
  expect(getByText('Getting Started')).toBeTruthy();
});

test('renders About & Help section with FAQ link', () => {
  const { getByText } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
  expect(getByText('About & Help')).toBeTruthy();
  expect(getByText('Help & FAQ')).toBeTruthy();
});

test('tapping Help & FAQ link opens external URL', async () => {
  const { getByTestId } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
  fireEvent.press(getByTestId('help-faq-link'));
  await waitFor(() => {
    expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining('help'));
  });
});

test('notification listener is registered and cleaned up on unmount', () => {
  const removeMock = jest.fn();
  const Notifications = require('expo-notifications');
  (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({ remove: removeMock });

  const { unmount } = render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);
  expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
  unmount();
  expect(removeMock).toHaveBeenCalled();
});
