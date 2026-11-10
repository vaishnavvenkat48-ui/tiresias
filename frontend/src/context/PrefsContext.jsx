import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyPalette, paletteFor } from '../theme/palette';

const PrefsContext = createContext(null);
const KEY = 'tiresias_prefs';

const DEFAULTS = {
  theme: 'light', // 'dark' | 'light' | 'system' — paper by default: the app reads like a book
  reduceMotion: false, // in addition to the OS setting
  ambient: false, // animated background — off by default (calmer, cheaper)
  physics: true, // default for new graphs
  strength: 1, // default physics strength (0.3 – 2)
  minimap: true,
  hintsDismissed: false,
  nodeHintSeen: false, // "click a concept" first-run hint
  autoMedia: true, // load the topic card (image + Wikidata facts) when a node is selected
};

// Scheme 2 (the book): everyone opens on paper once; their own choice is respected after that.
const SCHEME = 2;
const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (saved.scheme !== SCHEME) return { ...DEFAULTS, ...saved, theme: 'light', scheme: SCHEME };
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS, scheme: SCHEME }; }
};

const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

/** Local, per-device interface preferences + resolved colour theme and palette. */
export const PrefsProvider = ({ children }) => {
  const [prefs, setPrefs] = useState(read);
  const [osTheme, setOsTheme] = useState(systemTheme);
  const osReduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return undefined;
    const on = () => setOsTheme(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const theme = prefs.theme === 'system' ? osTheme : prefs.theme;

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
    document.documentElement.dataset.reduceMotion = String(!!prefs.reduceMotion);
  }, [prefs]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    applyPalette(theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ddd6c6' : '#1f1f1c');
  }, [theme]);

  const setPref = useCallback((key, value) => setPrefs((p) => ({ ...p, [key]: value })), []);

  const value = useMemo(
    () => ({ prefs, setPref, theme, palette: paletteFor(theme), reducedMotion: !!(prefs.reduceMotion || osReduce) }),
    [prefs, setPref, theme, osReduce]
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
};

export const usePrefs = () => {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
};
