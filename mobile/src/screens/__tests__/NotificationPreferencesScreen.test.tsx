import { fireEvent, render, waitFor } from '@testing-library/react-native';
import NotificationPreferencesScreen, { isValidQuietHoursTime } from '../NotificationPreferencesScreen';
import apiClient from '../../api/client';
import { quietHoursApi } from '../../api/notifications';

jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));
jest.mock('../../services/notification.service', () => ({ getDeviceTimeZone: () => 'Africa/Lagos' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const client = apiClient as unknown as { get: jest.Mock; put: jest.Mock };
const navigation = { goBack: jest.fn() } as never;
const route = { key: 'k', name: 'NotificationPreferences' } as never;

describe('quiet hours (issue #260)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('round-trips a quiet-hours range through the API', async () => {
    const qh = { enabled: true, start: '22:30', end: '06:45', timezone: 'Africa/Lagos' };
    client.put.mockResolvedValueOnce({ data: { quietHours: qh } });
    client.get.mockResolvedValueOnce({ data: { quietHours: qh } });

    expect(await quietHoursApi.updateQuietHours(qh)).toEqual(qh);
    expect(client.put).toHaveBeenCalledWith('/notifications/quiet-hours', qh);
    expect(await quietHoursApi.getQuietHours()).toEqual(qh);
  });

  it('validates HH:MM times', () => {
    expect(isValidQuietHoursTime('00:00')).toBe(true);
    expect(isValidQuietHoursTime('23:59')).toBe(true);
    expect(isValidQuietHoursTime('24:00')).toBe(false);
    expect(isValidQuietHoursTime('7:00')).toBe(false);
  });

  it('loads saved hours, shows the device timezone and saves edits', async () => {
    client.get.mockResolvedValueOnce({
      data: { quietHours: { enabled: true, start: '22:00', end: '07:00', timezone: 'Africa/Lagos' } },
    });
    client.put.mockImplementationOnce(async (_url: string, body: unknown) => ({ data: { quietHours: body } }));

    const screen = render(<NotificationPreferencesScreen navigation={navigation} route={route} />);
    await waitFor(() => expect(screen.getByTestId('quiet-hours-start').props.value).toBe('22:00'));
    expect(screen.getByText(/Africa\/Lagos/)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('quiet-hours-start'), '23:15');
    fireEvent.press(screen.getByLabelText('Save quiet hours'));

    await waitFor(() => expect(screen.getByText('Quiet hours saved.')).toBeTruthy());
    expect(client.put).toHaveBeenCalledWith('/notifications/quiet-hours', {
      enabled: true,
      start: '23:15',
      end: '07:00',
      timezone: 'Africa/Lagos',
    });
  });

  it('rejects an invalid range without calling the API', async () => {
    client.get.mockResolvedValueOnce({ data: { quietHours: null } });
    const screen = render(<NotificationPreferencesScreen navigation={navigation} route={route} />);
    await waitFor(() => expect(screen.getByTestId('quiet-hours-toggle')).toBeTruthy());

    fireEvent(screen.getByTestId('quiet-hours-toggle'), 'valueChange', true);

    fireEvent.changeText(screen.getByTestId('quiet-hours-end'), '25:00');
    fireEvent.press(screen.getByLabelText('Save quiet hours'));

    expect(await screen.findByText(/HH:MM/)).toBeTruthy();
    expect(client.put).not.toHaveBeenCalled();
  });
});
