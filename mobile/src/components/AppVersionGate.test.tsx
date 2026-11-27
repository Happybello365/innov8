/* eslint-disable no-undef */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppVersionGate } from './AppVersionGate';
import { loadUpdatePolicy } from '../services/appUpdate.service';

jest.mock('../services/appUpdate.service', () => ({
  loadUpdatePolicy: jest.fn(),
  getCurrentVersion: () => '0.1.0',
  compareVersions: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));
jest.mock('./UpdateBanner', () => ({ UpdateBanner: () => null }));

it('keeps the navigator blocked through a failed retry and restores it after a valid policy', async () => {
  const load = jest.mocked(loadUpdatePolicy);
  load.mockResolvedValueOnce({ latestVersion: '0.2.0', minimumVersion: '0.2.0', required: true })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ latestVersion: '0.1.0', required: false });

  const view = render(<AppVersionGate><Text>Trade navigation</Text></AppVersionGate>);
  await view.findByText('Update required');
  expect(view.queryByText('Trade navigation')).toBeNull();
  expect(view.getByText(/Open your app store/)).toBeTruthy();

  fireEvent.press(view.getByText('Check again'));
  await waitFor(() => {
    expect(view.getByRole('button', { name: 'Check again' })).not.toBeDisabled();
  });
  expect(view.queryByText('Trade navigation')).toBeNull();

  fireEvent.press(view.getByText('Check again'));
  expect(await view.findByText('Trade navigation')).toBeTruthy();
});
