import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tokens, darkTokens, lightTokens } from './tokens';

export * from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeState {
  t: Tokens;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const STORAGE_KEY = 'unknown.theme';
const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPref(p);
    void AsyncStorage.setItem(STORAGE_KEY, p);
  };

  const scheme: 'light' | 'dark' =
    preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeState>(
    () => ({
      t: scheme === 'dark' ? darkTokens : lightTokens,
      scheme,
      preference,
      setPreference,
    }),
    [scheme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** `const { t } = useTheme()` then `t.bg.primary` etc. */
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
