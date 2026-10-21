import { ColorSchemeName } from 'react-native';

export interface AppTheme {
  background: string;
  surface: string;
  border: string;
  primary: string;
  primaryText: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  successBg: string;
  successBorder: string;
  chip: string;
  chipBorder: string;
  inputBg: string;
  headerBg: string;
  cardBg: string;
  unreadBg: string;
  badgeBg: string;
  badgeText: string;
}

const light: AppTheme = {
  background: '#f0f4f0',
  surface: '#fff',
  border: '#e0e8e0',
  primary: '#2d6a2d',
  primaryText: '#fff',
  textPrimary: '#1a3a1a',
  textSecondary: '#333',
  textMuted: '#888',
  successBg: '#f0f8f0',
  successBorder: '#d0e8d0',
  chip: '#fff',
  chipBorder: '#d0d8d0',
  inputBg: '#fff',
  headerBg: '#fff',
  cardBg: '#fff',
  unreadBg: '#eef6ee',
  badgeBg: '#e53935',
  badgeText: '#fff',
};

const dark: AppTheme = {
  background: '#0f1f0f',
  surface: '#1a2e1a',
  border: '#2a4a2a',
  primary: '#4caf50',
  primaryText: '#fff',
  textPrimary: '#e8f5e9',
  textSecondary: '#c8e6c9',
  textMuted: '#81c784',
  successBg: '#1b3a1b',
  successBorder: '#2d6a2d',
  chip: '#1a2e1a',
  chipBorder: '#2a4a2a',
  inputBg: '#1a2e1a',
  headerBg: '#122112',
  cardBg: '#1a2e1a',
  unreadBg: '#1e3c1e',
  badgeBg: '#e53935',
  badgeText: '#fff',
};

export function getTheme(scheme: ColorSchemeName): AppTheme {
  return scheme === 'dark' ? dark : light;
}

/**
 * Width breakpoints in density-independent pixels (#270).
 * 768dp ≈ portrait iPad mini / 8" Android tablets; 1024dp ≈ landscape tablets.
 */
export const BREAKPOINTS = {
  tablet: 768,
  /** At and above this width, list/detail screens use two columns. */
  twoColumn: 768,
  wide: 1024,
} as const;

export const LAYOUT = {
  /** Readable maximum width for single-column content on tablets. */
  maxContentWidth: 720,
  /** List pane share of the window in two-column mode, clamped to min/max. */
  listPaneRatio: 0.38,
  listPaneMin: 320,
  listPaneMax: 440,
} as const;
