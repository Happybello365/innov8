import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import EvidenceCaptureScreen from './EvidenceCaptureScreen';

/**
 * Evidence capture quality guidance (issue #510).
 *
 * The capture screen must tell the user what to show in the evidence, and the
 * guidance must follow the selected media type so a photo is never framed with
 * video instructions (and vice versa).
 */

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const VIDEO_GUIDANCE =
  'Record a video showing the goods and their condition. The driver should be present.';
const PHOTO_GUIDANCE =
  'Take a clear photo of the goods showing any damage or discrepancy.';

function renderScreen() {
  return render(
    <EvidenceCaptureScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { tradeId: 'trade-123456789012' } } as never}
    />,
  );
}

describe('EvidenceCaptureScreen capture guidance (#510)', () => {
  it('shows video capture guidance by default', () => {
    const screen = renderScreen();

    expect(screen.getByText('Record Delivery Video')).toBeTruthy();
    expect(screen.getByText(VIDEO_GUIDANCE)).toBeTruthy();
    expect(screen.queryByText(PHOTO_GUIDANCE)).toBeNull();
  });

  it('switches to photo guidance when the photo type is selected', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Photo'));

    expect(screen.getByText('Take Delivery Photo')).toBeTruthy();
    expect(screen.getByText(PHOTO_GUIDANCE)).toBeTruthy();
    expect(screen.queryByText(VIDEO_GUIDANCE)).toBeNull();
  });

  it('restores video guidance when switching back to video', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Photo'));
    fireEvent.press(screen.getByText('Video'));

    expect(screen.getByText(VIDEO_GUIDANCE)).toBeTruthy();
    expect(screen.queryByText(PHOTO_GUIDANCE)).toBeNull();
  });
});
