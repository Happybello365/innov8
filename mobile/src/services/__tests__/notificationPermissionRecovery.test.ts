import * as Notifications from 'expo-notifications';
import { checkNotificationPermissions } from '../notification.service';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

describe('notification permission recovery (issue #525)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports a denied permission without prompting the user again', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    expect(await checkNotificationPermissions()).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reflects a permission the user grants later in system settings', async () => {
    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'denied' })
      .mockResolvedValueOnce({ status: 'granted' });

    expect(await checkNotificationPermissions()).toBe(false);
    expect(await checkNotificationPermissions()).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
