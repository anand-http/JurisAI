import { Platform, TextStyle } from 'react-native';

export const colors = {
  primary: '#1E3A5F',
  primaryPressed: '#162C49',
  primaryTint: '#E8EEF6',
  onPrimary: '#FFFFFF',

  background: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F0EFEB',
  border: '#DEDCD6',
  borderStrong: '#C3C0B8',

  text: '#1B1B1F',
  textMuted: '#5C6270',
  textSubtle: '#8A8F9A',

  success: '#1B7A4B',
  successTint: '#E4F3EA',
  warning: '#8A4B00',
  warningTint: '#FFF1D6',
  warningBorder: '#F0C674',
  danger: '#A12622',
  dangerTint: '#FCE9E7',

  // Citation states. Each is visually distinct so a lawyer can tell at a
  // glance whether a reference is backed by a retrieved source.
  citeVerified: '#1D3F8F',
  citeVerifiedBg: '#E3EBFA',
  citeUnverified: '#7A4300',
  citeUnverifiedBg: '#FFEBC2',
  citeUnlinked: '#9B1C1C',
  citeUnlinkedBg: '#FBDDDA',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/** Serif face for rendering the legal document itself. */
export const documentFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

export const type = {
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  heading: { fontSize: 18, fontWeight: '600', color: colors.text },
  subheading: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
} satisfies Record<string, TextStyle>;
