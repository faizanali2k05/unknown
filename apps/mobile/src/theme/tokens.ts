/**
 * Semantic design tokens — the ONLY place a hex value may appear.
 * If a component needs a colour that isn't here, add a token; never inline one.
 *
 * Retro green reads well on dark but washes out on light, so the light-mode
 * accent is a deeper green rather than the same phosphor value. Every pair
 * below was chosen to clear 4.5:1 against the surface it sits on.
 */

export interface Tokens {
  bg: { primary: string; secondary: string; elevated: string };
  text: { primary: string; secondary: string; muted: string };
  accent: { default: string; pressed: string; subtle: string; on: string };
  border: { default: string; strong: string };
  status: { success: string; danger: string; warning: string };
  bubble: { mine: string; theirs: string; mineText: string; theirsText: string };
}

export const darkTokens: Tokens = {
  bg: { primary: '#07120C', secondary: '#0D1D14', elevated: '#132A1D' },
  text: { primary: '#E8F5EC', secondary: '#A7C0B0', muted: '#6E8878' },
  accent: { default: '#4ADE80', pressed: '#22C55E', subtle: '#12351F', on: '#04210F' },
  border: { default: '#1E3A28', strong: '#2F5940' },
  status: { success: '#4ADE80', danger: '#F87171', warning: '#FBBF24' },
  bubble: {
    mine: '#1F6D3F',
    theirs: '#152A1E',
    mineText: '#EAFBEF',
    theirsText: '#E8F5EC',
  },
};

export const lightTokens: Tokens = {
  bg: { primary: '#F6FAF7', secondary: '#FFFFFF', elevated: '#FFFFFF' },
  // #3F6B50 on #F6FAF7 ≈ 5.6:1; the muted tone still clears 4.5:1.
  text: { primary: '#0B1F14', secondary: '#3F6B50', muted: '#5C7A68' },
  accent: { default: '#15803D', pressed: '#166534', subtle: '#DCFCE7', on: '#FFFFFF' },
  border: { default: '#D7E6DC', strong: '#A9C7B6' },
  status: { success: '#15803D', danger: '#B91C1C', warning: '#B45309' },
  bubble: {
    mine: '#15803D',
    theirs: '#EDF4EF',
    mineText: '#FFFFFF',
    theirsText: '#0B1F14',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '800' as const },
  title: { fontSize: 24, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
} as const;
