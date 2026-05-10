export const Colors = {
  gold: '#FFD700',
  bg: '#0A0A0C',
  surface: '#111114',
  elevated: '#18181C',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  text: '#FFFFFF',
  text2: 'rgba(255,255,255,0.6)',
  text3: 'rgba(255,255,255,0.35)',
  up: '#4ADE80',
  down: '#FF5C5C',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  full: 999,
} as const;

export const FontFamily = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'SpaceGrotesk_400Regular',
  bodySemi: 'SpaceGrotesk_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMed: 'JetBrainsMono_500Medium',
} as const;
