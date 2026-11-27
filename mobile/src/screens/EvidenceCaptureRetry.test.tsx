import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import apiClient from '../api/client';
import EvidenceCaptureScreen from './EvidenceCaptureScreen';

/**
 * Evidence chunk upload retry (issue #509).
 *
 * A failed evidence upload must leave the captured file in place so the user
 * can retry the same upload without re-recording, and a successful retry must
 * reach the uploaded state.
 */

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

describe('EvidenceCaptureScreen upload retry (#509)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Simulate Capture')?.onPress?.();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the captured file after a failed upload and retries the same request', async () => {
    post
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: {} });

    const screen = renderScreen();
    fireEvent.press(screen.getByText('Tap to record'));
    fireEvent.press(screen.getByText('☁️ Upload Video'));

    expect(
      await screen.findByText(
        "Upload failed: We couldn't upload your evidence. Check your connection and try again.",
      ),
    ).toBeTruthy();

    // The captured file is still offered for upload after the failure.
    fireEvent.press(screen.getByText('☁️ Upload Video'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][0]).toBe(post.mock.calls[0][0]);
    expect(await screen.findByText('Evidence Uploaded')).toBeTruthy();
    expect(screen.queryByText(/Upload failed:/)).toBeNull();
  });

  it('stays in the error state when the retry also fails', async () => {
    post.mockRejectedValue(new Error('Network Error'));

    const screen = renderScreen();
    fireEvent.press(screen.getByText('Tap to record'));
    fireEvent.press(screen.getByText('☁️ Upload Video'));
    await screen.findByText(/Upload failed:/);

    fireEvent.press(screen.getByText('☁️ Upload Video'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Upload failed:/)).toBeTruthy();
    expect(screen.queryByText('Evidence Uploaded')).toBeNull();
  });
});
