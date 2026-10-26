import { useWindowDimensions } from 'react-native';
import { BREAKPOINTS, LAYOUT } from '../constants/theme';

export type LayoutClass = 'phone' | 'tablet' | 'wide';

/** Classify a window width against {@link BREAKPOINTS} (#270). */
export function layoutClassFor(width: number): LayoutClass {
  if (width >= BREAKPOINTS.wide) return 'wide';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'phone';
}

/**
 * Responsive layout helpers (#270).
 *
 * - `isTwoColumn`: list/detail screens show both panes side by side.
 * - `contentStyle`: caps single-column content at a readable width and
 *   centres it, so forms and detail views do not stretch edge to edge.
 */
export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const layout = layoutClassFor(width);
  const isTwoColumn = width >= BREAKPOINTS.twoColumn;
  return {
    width,
    layout,
    isTwoColumn,
    listPaneWidth: isTwoColumn ? Math.round(Math.min(Math.max(width * LAYOUT.listPaneRatio, LAYOUT.listPaneMin), LAYOUT.listPaneMax)) : width,
    contentStyle:
      layout === 'phone'
        ? undefined
        : ({ width: '100%', maxWidth: LAYOUT.maxContentWidth, alignSelf: 'center' } as const),
  };
}
