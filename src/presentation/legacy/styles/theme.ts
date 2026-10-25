export const COLORS = {
  primary: '#1a73e8',
  primaryPressed: '#1557b0',
  background: '#f8f9fa',
  surface: '#ffffff',
  textPrimary: '#202124',
  textSecondary: '#5f6368',
  textTertiary: '#80868b',
  border: '#dadce0',
  borderLight: '#e8eaed',
  white: '#ffffff',
  
  // Status Colors
  success: '#188038',
  successLight: '#a5d6a7',
  successBg: '#e6f4ea',
  
  danger: '#d93025',
  dangerLight: '#ef9a9a',
  dangerBg: '#fce8e6',
  
  warning: '#b06000',
  warningBg: '#fef7e0',
  
  shadowColor: '#000000',
} as const;

export const FONTS = {
  sizes: {
    xxs: 8,
    xs: 9,
    sm: 10,
    sub: 11,
    md: 12,
    base: 13,
    lg: 14,
    xl: 15,
    xxl: 18,
    title: 22,
    giant: 24,
    hero: 28,
  },
  weights: {
    regular: '400' as const,
    medium: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
};

export const SHADOWS = {
  small: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  floating: {
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  // ... existing shadows
};

// Card background color palettes for splits
export const CARD_PALETTES = [
  ['#1a73e8', '#1557b0'], // Indigo/Blue
  ['#009688', '#00796b'], // Teal
  ['#2c3e50', '#1a252f'], // Dark Slate
  ['#7b1fa2', '#4a148c'], // Rich Purple
  ['#e65100', '#b53d00'], // Bright Orange
  ['#c2185b', '#880e4f'], // Deep Pink
  ['#1b5e20', '#0d3c12'], // Forest Green
  ['#29b6f6', '#0288d1'], // Light Blue
  ['#ec407a', '#c2185b'], // Coral Pink
  ['#f4511e', '#b71c1c'], // Vermilion
  ['#3f51b5', '#1a237e'], // Royal Indigo
  ['#43a047', '#1b5e20'], // Emerald Green
  ['#ab47bc', '#7b1fa2'], // Amethyst Purple
  ['#d81b60', '#ad1457'], // Ruby Red
  ['#00acc1', '#00838f'], // Cyan
  ['#ffb300', '#ff6f00'], // Amber Gold
] as const;

export default {
  COLORS,
  FONTS,
  SHADOWS,
  CARD_PALETTES,
};
