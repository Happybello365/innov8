import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import apiClient from '../api/client';
import EvidenceCaptureScreen from './EvidenceCaptureScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const post = apiClient.post as jest.Mock;

function renderScreen() {
  return render(
    <EvidenceCaptureScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { tradeId: 'trade-123456789012' } } as never}
    />,
  );
}

describe('EvidenceCaptureScreen temporary evidence cleanup (issue #526)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Simulate Capture')?.onPress?.();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aborts an in-flight upload when the screen unmounts', () => {
    post.mockReturnValue(new Promise(() => {}));

    const screen = renderScreen();
    fireEvent.press(screen.getByText('Tap to record'));
    fireEvent.press(screen.getByText('☁️ Upload Video'));

    const requestConfig = post.mock.calls[0][2];
    expect(requestConfig.signal.aborted).toBe(false);

    screen.unmount();
    expect(requestConfig.signal.aborted).toBe(true);
  });

  it('drops the captured media reference when the user retakes', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Tap to record'));
    expect(screen.getByText('Ready to upload')).toBeTruthy();

    fireEvent.press(screen.getByText('↩ Retake'));

    expect(screen.queryByText('Ready to upload')).toBeNull();
    expect(screen.getByText('Tap to record')).toBeTruthy();
    expect(screen.queryByText('↩ Retake')).toBeNull();
  });

  it('does not send a request when the user retakes before uploading', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Tap to record'));
    fireEvent.press(screen.getByText('↩ Retake'));

    expect(post).not.toHaveBeenCalled();
  });
});
