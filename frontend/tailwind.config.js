/** @type {import('tailwindcss').Config} */

// Theme tokens live in CSS custom properties (src/styles/index.css) so the
// adaptive knowledge modes can re-tint everything at runtime. Opacity
// modifiers (`bg-accent/15`) are produced with color-mix so they keep working
// with variables — and keep animating when @property transitions the accent.
const token = (name) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === '1'
    ? `var(${name})`
    : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: { DEFAULT: token('--bg'), 2: token('--bg-2'), deep: token('--bg-deep') },
        surface: { DEFAULT: token('--surface'), hi: token('--surface-hi') },
        fg: { DEFAULT: token('--text'), 2: token('--text-2'), 3: token('--text-3') },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        accent: { DEFAULT: token('--accent'), 2: token('--accent-2'), 3: token('--accent-3') },
        danger: token('--danger'),
        success: token('--success'),
        hover: 'var(--hover)',
        scrim: 'var(--scrim)',
      },
      fontFamily: {
        display: ['"General Sans"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['"General Sans"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        'raise-1': 'var(--raise-1)',
        'raise-2': 'var(--raise-2)',
        'raise-3': 'var(--raise-3)',
        'raise-4': 'var(--raise-4)',
        'inset-1': 'var(--inset-1)',
        'inset-2': 'var(--inset-2)',
        glow: 'var(--glow-ring)',
      },
      transitionTimingFunction: { soft: 'cubic-bezier(.2,.8,.2,1)' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { shimmer: 'shimmer 1.6s infinite' },
    },
  },
  plugins: [],
};
