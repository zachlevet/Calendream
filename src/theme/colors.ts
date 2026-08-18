export const palette = {
  light: {
    background: '#FFFFFF', card: '#F2F2F7', chrome: 'rgba(249,249,249,0.96)',
    text: '#111111', secondary: '#6C6C70', tertiary: '#AEAEB2', separator: '#E5E5EA',
    blue: '#007AFF', blueSoft: '#E8F2FF', red: '#FF3B30', redSoft: '#FFF0EF',
    purple: '#7650B3', purpleSoft: '#F3EDFF', amber: '#FF9500', amberSoft: '#FFF4DF',
    orange: '#FF6B00', orangeSoft: '#FFF0E3', yellow: '#C78D00', yellowSoft: '#FFF9DC',
  },
  dark: {
    background: '#000000', card: '#1C1C1E', chrome: 'rgba(28,28,30,0.96)',
    text: '#FFFFFF', secondary: '#98989D', tertiary: '#636366', separator: '#2C2C2E',
    blue: '#0A84FF', blueSoft: '#102A43', red: '#FF453A', redSoft: '#3A1715',
    purple: '#BF9CFF', purpleSoft: '#2D213F', amber: '#FF9F0A', amberSoft: '#3B2D12',
    orange: '#FF7A00', orangeSoft: '#3D220E', yellow: '#FFD60A', yellowSoft: '#332D00',
  },
} as const;

export type AppColors = typeof palette.light | typeof palette.dark;
