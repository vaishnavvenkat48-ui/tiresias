/** Tiresias mark: a raised neumorphic tile holding an "eye" of concentric orbits. */
export const Logo = ({ size = 32, showName = true }) => (
  <span className="inline-flex items-center gap-2.5">
    <span
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: size * 0.3, background: 'var(--surface-grad)', boxShadow: 'var(--raise-2), var(--rim)', border: '1px solid var(--line)' }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" style={{ stroke: 'var(--accent-2)' }} strokeOpacity="0.8" strokeWidth="1.3" />
        <ellipse cx="12" cy="12" rx="9" ry="4.2" style={{ stroke: 'var(--accent)' }} strokeWidth="1.3" />
        <circle cx="12" cy="12" r="2.6" style={{ fill: 'var(--accent)' }} />
      </svg>
    </span>
    {showName && <span className="text-[17px] font-semibold tracking-tight text-fg" translate="no">Tiresias</span>}
  </span>
);
