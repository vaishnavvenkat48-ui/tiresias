import { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CircleNotch, Check, CaretDown, Sparkle, Sun, Moon } from '@phosphor-icons/react';
import { usePrefs } from '../context/PrefsContext';

/* ── Page header ─────────────────────────────────────────── */
export const PageHeader = ({ eyebrow, title, description, actions }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
    <div className="min-w-0 max-w-2xl">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="h-page text-balance">{title}</h1>
      {description && <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

/* ── Section card ────────────────────────────────────────── */
export const Card = ({ title, description, action, children, className = '', bodyClass = '' }) => (
  <section className={`surface p-5 sm:p-6 ${className}`}>
    {(title || action) && (
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h2 className="h-section">{title}</h2>}
          {description && <p className="mt-0.5 text-[12.5px] text-fg-2">{description}</p>}
        </div>
        {action}
      </div>
    )}
    <div className={bodyClass}>{children}</div>
  </section>
);

/* ── Stat tile (raised number in a recessed well) ────────── */
export const StatTile = ({ label, value, hint, icon: Icon, loading }) => (
  <div className="surface-sm flex flex-col gap-3 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
      {Icon && (
        <span className="well-sm grid h-8 w-8 place-items-center text-accent"><Icon size={16} weight="duotone" /></span>
      )}
    </div>
    {loading ? <span className="skeleton h-8 w-16" /> : <span className="engraved text-[28px] font-semibold leading-none tracking-tight text-fg">{value ?? '—'}</span>}
    {hint && <span className="text-[12px] text-fg-3">{hint}</span>}
  </div>
);

/* ── Empty state ─────────────────────────────────────────── */
export const EmptyState = ({ icon: Icon = Sparkle, title, description, action, className = '' }) => (
  <div className={`well flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
    <span className="surface-sm mb-4 grid h-12 w-12 place-items-center text-accent"><Icon size={22} weight="duotone" /></span>
    <p className="text-[15px] font-semibold text-fg">{title}</p>
    {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-fg-2">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const ErrorBanner = ({ message, onRetry }) => (
  <div role="alert" className="well flex flex-wrap items-center justify-between gap-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-4 py-3">
    <p className="text-[13px] text-danger">{message}</p>
    {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
  </div>
);

export const Spinner = ({ size = 16, className = '' }) => <CircleNotch size={size} className={`animate-spin ${className}`} aria-hidden="true" />;

export const Skeleton = ({ className = '' }) => <span className={`skeleton block ${className}`} aria-hidden="true" />;

export const FieldError = ({ message, id }) =>
  message ? <p id={id} className="mt-1.5 text-[12.5px] font-medium text-danger">{message}</p> : null;

/** Labelled recessed input; forwardRef so react-hook-form's register() works. */
export const TextField = forwardRef(({ id, label, error, right, ...rest }, ref) => (
  <div>
    <label className="field-label" htmlFor={id}>{label}</label>
    <div className="relative">
      <input ref={ref} id={id} className={`input ${right ? '!pr-16' : ''}`} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
      {right && <div className="absolute right-2 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
    <FieldError id={`${id}-err`} message={error} />
  </div>
));
TextField.displayName = 'TextField';

/* ── Switch row ──────────────────────────────────────────── */
export const SwitchRow = ({ title, description, checked, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 py-3.5">
    <div className="min-w-0">
      <p className="text-[13.5px] font-medium text-fg">{title}</p>
      {description && <p className="text-[12.5px] text-fg-2">{description}</p>}
    </div>
    <button type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} className="switch disabled:opacity-40" onClick={() => onChange(!checked)} />
  </div>
);

/* ── Segmented control ───────────────────────────────────── */
export const Segmented = ({ options, value, onChange, label }) => (
  <div className="seg" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
        {o.icon && <o.icon size={14} />}
        {o.label}
      </button>
    ))}
  </div>
);

/* ── Modal ───────────────────────────────────────────────── */
export const Modal = ({ open, onClose, title, description, children, width = 'max-w-lg' }) => {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    setTimeout(() => panelRef.current?.querySelector('input, button:not([data-close]), [tabindex]')?.focus(), 30);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.button
            type="button" aria-label="Close dialog" tabIndex={-1}
            className="absolute inset-0 cursor-default bg-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className={`surface relative w-full ${width} max-h-[85dvh] overflow-y-auto rounded-b-none p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-raise-4 sm:rounded-b-[var(--r-lg)] sm:p-6`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
                {description && <p className="mt-1 text-[13px] text-fg-2">{description}</p>}
              </div>
              <button type="button" data-close className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={onClose}><X size={15} /></button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/* ── Category tag (neutral; no per-topic colour schemes) ── */
export const CategoryDot = ({ size = 8 }) => (
  <span aria-hidden="true" className="marble" style={{ width: size, height: size, background: 'radial-gradient(circle at 35% 30%, var(--accent-3) 0%, var(--accent) 50%, var(--accent-2) 100%)' }} />
);

/** Skeuomorphic sun/moon rocker. `compact` hides the label. */
export const ThemeToggle = ({ compact = false }) => {
  const { prefs, setPref, theme } = usePrefs();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={theme === 'light'}
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode${prefs.theme === 'system' ? ' (currently following your system)' : ''}`}
        onClick={() => setPref('theme', next)}
        className="theme-rocker"
        data-on={theme}
      >
        <span className="ico"><Moon size={13} weight="fill" /></span>
        <span className="ico"><Sun size={14} weight="fill" /></span>
        <span className="knob">{theme === 'light' ? <Sun size={13} weight="fill" /> : <Moon size={12} weight="fill" />}</span>
      </button>
      {!compact && <span className="text-[12.5px] text-fg-2">{theme === 'light' ? 'Light' : 'Dark'}{prefs.theme === 'system' ? ' · system' : ''}</span>}
    </div>
  );
};

/* ── Mini graph thumbnail (SVG, from saved positions) ────── */
export const GraphThumb = ({ nodes = [], edges = [], positions = {}, className = '' }) => {
  const W = 280;
  const H = 150;
  const pts = {};
  const placed = nodes.filter((n) => positions[n.id]);
  if (placed.length >= Math.min(3, nodes.length) && placed.length) {
    const xs = placed.map((n) => positions[n.id].x);
    const ys = placed.map((n) => positions[n.id].y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const s = Math.min((W - 30) / (maxX - minX || 1), (H - 30) / (maxY - minY || 1));
    const ox = (W - (maxX - minX) * s) / 2; const oy = (H - (maxY - minY) * s) / 2;
    for (const n of placed) pts[n.id] = [ox + (positions[n.id].x - minX) * s, oy + (positions[n.id].y - minY) * s, n.depth];
  } else {
    // Radial fallback for graphs without a saved layout
    const tiers = {};
    nodes.forEach((n) => { (tiers[n.depth] = tiers[n.depth] || []).push(n); });
    Object.entries(tiers).forEach(([d, list]) => list.forEach((n, i) => {
      const r = Number(d) * 46;
      const a = (i / list.length) * Math.PI * 2 + Number(d) * 0.6;
      pts[n.id] = [W / 2 + Math.cos(a) * r * 1.6, H / 2 + Math.sin(a) * r, Number(d)];
    }));
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Graph preview with ${nodes.length} concepts`}>
      {edges.slice(0, 220).map((e) => {
        const a = pts[e.source]; const b = pts[e.target];
        if (!a || !b) return null;
        return <line key={e.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} style={{ stroke: e.type === 'related' ? 'var(--accent-2)' : 'var(--accent)' }} strokeOpacity={e.type === 'related' ? 0.35 : 0.3} strokeWidth="1" />;
      })}
      {Object.entries(pts).slice(0, 160).map(([id, [x, y, d]]) => (
        <circle key={id} cx={x} cy={y} r={d === 0 ? 5 : d === 1 ? 3.2 : 2.2} style={{ fill: d === 0 ? 'var(--accent)' : d === 1 ? 'var(--accent-2)' : 'var(--text-2)' }} fillOpacity={d >= 2 ? 0.6 : 0.95} />
      ))}
    </svg>
  );
};

/* ── Relative time ───────────────────────────────────────── */
export const timeAgo = (date) => {
  if (!date) return '';
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
