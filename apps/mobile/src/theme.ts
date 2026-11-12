import { Platform } from 'react-native';

/** MAINDY design tokens (brand palette is fixed; do not redesign). */
export const colors = {
  navy: '#05082B',
  navySoft: '#0B1040',
  navyLight: '#151A50',
  purple: '#7600FF',
  purpleLight: '#A020F0',
  magenta: '#D000E8',
  yellow: '#FFC400',
  yellowSoft: '#FFE36E',
  white: '#FFFFFF',
  textPrimary: '#F8F8FF',
  textSecondary: '#A8AAC6',
  surface: '#101438',
  surfaceLight: '#1B2050',
  hairline: 'rgba(168,170,198,0.14)',
  danger: '#FF5C7A',
  success: '#3DDC97',
} as const;

const family = Platform.select({ ios: 'System', android: 'sans-serif', default: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif' });
const familyMedium = Platform.select({ ios: 'System', android: 'sans-serif-medium', default: family });

/** Typographic scale (1.2 ratio), tuned for pt-BR text length. */
export const type = {
  display: { fontFamily: family, fontSize: 34, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontFamily: family, fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontFamily: familyMedium, fontSize: 19, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontFamily: family, fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontFamily: familyMedium, fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  caption: { fontFamily: family, fontSize: 13, lineHeight: 18, fontWeight: '500' as const, letterSpacing: 0.1 },
  overline: { fontFamily: familyMedium, fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1.2 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const motion = {
  quick: 160,
  base: 260,
  slow: 520,
  spring: { damping: 16, stiffness: 180, mass: 0.9 },
} as const;
