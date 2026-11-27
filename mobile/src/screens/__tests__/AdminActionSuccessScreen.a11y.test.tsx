import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import AdminActionSuccessScreen from '../AdminActionSuccessScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('AdminActionSuccessScreen screen-reader announcement (issue #524)', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('announces the completed action and stream to assistive technology on mount', () => {
    render(
      <AdminActionSuccessScreen
        navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
        route={
          {
            params: {
              actionType: 'Release',
              streamId: 'stream-42',
              timestamp: '2026-11-19T10:00:00.000Z',
            },
          } as never
        }
      />,
    );

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Release completed successfully on stream stream-42.',
    );
  });
});
