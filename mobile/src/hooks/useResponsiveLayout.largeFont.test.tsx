/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
// Issue #522: core screens must stay usable at maximum text scaling.
// Covers the layout classification at phone width (where large text matters
// most) and confirms the offline banner never clips its copy with numberOfLines.
import React from 'react';
import { Text } from 'react-native';
import { renderHook, render } from '@testing-library/react-native';
import { useResponsiveLayout, layoutClassFor } from './useResponsiveLayout';
import { OfflineBanner } from '../components/OfflineBanner';

let mockWidth = 360;
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: mockFontScale }),
}));

describe('large-font layout pass (#522)', () => {
  beforeEach(() => {
    mockWidth = 360;
    mockFontScale = 1;
  });

  it.each([1, 1.5, 2, 3])(
    'keeps a single-column phone layout at font scale %p',
    (scale) => {
      mockFontScale = scale;
      const { result } = renderHook(() => useResponsiveLayout());

      expect(result.current.layout).toBe('phone');
      expect(result.current.isTwoColumn).toBe(false);
      // Phone layout takes the full width, so text can reflow instead of
      // being squeezed into a side pane at large sizes.
      expect(result.current.listPaneWidth).toBe(360);
      expect(result.current.contentStyle).toBeUndefined();
    }
  );

  it('classifies the smallest supported phone width as phone', () => {
    expect(layoutClassFor(320)).toBe('phone');
    expect(layoutClassFor(767)).toBe('phone');
  });

  it('does not clip offline banner copy with numberOfLines at large font sizes', () => {
    mockFontScale = 3;
    const { UNSAFE_getAllByType } = render(
      <OfflineBanner
        message="You're offline. Admin actions can't be submitted until the device reconnects, and queued trade drafts will sync once a connection is restored."
        queuedActions={[
          { id: 'q-1', label: 'Create trade for maize lot 12', status: 'failed', error: 'Trade already exists for this lot', attempts: 1 },
        ]}
      />
    );

    const texts = UNSAFE_getAllByType(Text);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.props.numberOfLines).toBeUndefined();
    }
  });
});
