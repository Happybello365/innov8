/* eslint-disable no-undef */
import { fireEvent, render } from '@testing-library/react-native';
import { OfflineQueueList } from './OfflineQueueList';
import type { QueuedAction } from '../stores/offlineQueueStore';

const actions: QueuedAction[] = [
  { id: 'a', label: 'Confirm delivery', status: 'pending', attempts: 0 },
  { id: 'b', label: 'Release funds', status: 'succeeded', attempts: 1 },
  { id: 'c', label: 'Open dispute', status: 'failed', attempts: 1, error: 'Network Error' },
];

describe('OfflineQueueList', () => {
  it('renders nothing for an empty queue', () => {
    const { toJSON } = render(<OfflineQueueList actions={[]} onRetry={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('shows a status per action and a retry only for failed items', () => {
    const onRetry = jest.fn();
    const { getByText, queryByTestId, getByTestId } = render(
      <OfflineQueueList actions={actions} onRetry={onRetry} />,
    );

    expect(getByText('Pending')).toBeTruthy();
    expect(getByText('Sent')).toBeTruthy();
    expect(getByText('Failed')).toBeTruthy();
    expect(getByText('Network Error')).toBeTruthy();
    expect(queryByTestId('retry-a')).toBeNull();
    expect(queryByTestId('retry-b')).toBeNull();

    fireEvent.press(getByTestId('retry-c'));
    expect(onRetry).toHaveBeenCalledWith('c');
  });
});
