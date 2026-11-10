/**
 * Tiresias has ONE visual identity — moss green + antique brass on sand —
 * tuned separately for the two themes. (The earlier seven topic
 * "atmospheres" were removed: they multiplied the design surface without
 * helping anyone understand a topic. The violet identity was retired in
 * favour of the landing page's sand-and-moss palette.)
 *
 * Charcoal accents are lifted for legibility on dark surfaces; Sand accents
 * are deepened so accent-coloured text keeps ≥ 4.5:1 contrast on light surfaces.
 */
export const PALETTE = {
  dark: { accent: '#a8c08c', accent2: '#d9b36a', accent3: '#ebe4d4', ambient: '#25301d' },
  light: { accent: '#4f6238', accent2: '#8a6414', accent3: '#6f7462', ambient: '#d3d9c2' },
};

export const paletteFor = (theme = 'dark') => PALETTE[theme] || PALETTE.dark;

/** Write the palette for a theme onto <html> as CSS custom properties. */
export const applyPalette = (theme) => {
  const p = paletteFor(theme);
  const root = document.documentElement;
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--accent-2', p.accent2);
  root.style.setProperty('--accent-3', p.accent3);
  root.style.setProperty('--ambient', p.ambient);
};
