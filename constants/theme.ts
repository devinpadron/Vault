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
  // Ghost-button / pill fill used across every screen.
  glass: 'rgba(255,255,255,0.04)',
  // Backdrop behind every bottom sheet and modal.
  scrim: 'rgba(0,0,0,0.5)',
  // Gold at the three alphas the UI actually uses: tinted fills, active
  // fills, and borders around gold-tinted elements.
  goldFaint: 'rgba(255,215,0,0.08)',
  goldTint: 'rgba(255,215,0,0.12)',
  goldBorder: 'rgba(255,215,0,0.4)',
  // Lilac accent used for holo/special-variant labels.
  holo: '#9D8FFF',
} as const;

// Decorative gradients reused across screens.
export const Gradients = {
  // Avatar ring / profile CTA accent.
  profileRing: [Colors.gold, '#FF5FB6'] as [string, string],
  // Reverse-holo chip border.
  reverseHolo: ['#7A6BFF', '#5FD2FF', '#FF7AE0'] as [string, string, string],
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

// 38×38 ghost-circle button used in every modal screen's nav bar. Plain
// object (not a StyleSheet.create) so it composes cleanly with array styles
// at the call site.
export const NavButtonStyle = {
  width: 38,
  height: 38,
  borderRadius: Radius.full,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: Colors.line,
  backgroundColor: Colors.glass,
} as const;

// Single press-feedback value for every TouchableOpacity — the app used to
// range 0.7–0.9 ad hoc.
export const PressOpacity = 0.7;

// Elevation presets. `raised` for floating chrome (action bars, FABs over
// content); `goldGlow` for the primary FAB.
export const Shadows = {
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  goldGlow: {
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
} as const;
