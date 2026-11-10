import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { List, DotsThreeOutline } from '@phosphor-icons/react';
import { SidebarContent } from './Sidebar';
import AmbientCanvas from './AmbientCanvas';
import { Logo } from './Logo';
import { ThemeToggle } from './UI';
import { usePrefs } from '../context/PrefsContext';
import { ALL_ITEMS, TAB_ITEMS } from './nav';

const SkipLink = () => (
  <a href="#main" className="btn btn-sm sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]">Skip to content</a>
);

/** Fixed atmosphere layer: ambient light + the mode's particle motif. */
export const Atmosphere = ({ intensity = 0.4 }) => {
  const { prefs, reducedMotion, palette, theme } = usePrefs();
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <div className="ambient-light absolute inset-0" />
      {prefs.ambient && (
        <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: theme === 'light' ? intensity * 0.7 : intensity }}>
          <AmbientCanvas kind="constellation" colorA={palette.accent} colorB={palette.accent2} still={reducedMotion} />
        </div>
      )}
    </div>
  );
};

export const PageFallback = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading">
    <span className="skeleton block h-10 w-64" />
    <span className="skeleton block h-4 w-96 max-w-full" />
    <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton block h-28 rounded-[14px]" />)}</div>
  </div>
);

export const PublicLayout = () => {
  const location = useLocation();
  return (
    <div className="relative min-h-dvh">
      {/* The landing page draws its own flat sand ground and navigation. */}
      {!['/', '/login', '/register'].includes(location.pathname) && <Atmosphere intensity={0.55} />}
      <SkipLink />
      <main id="main" className="relative z-[1]">
        <Suspense fallback={<div className="p-10"><PageFallback /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

const AnimatedOutlet = () => {
  const location = useLocation();
  const outlet = useOutlet();
  const { reducedMotion } = usePrefs();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className="h-full"
      >
        <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

/** Authenticated application shell. */
export const AppLayout = () => {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const fullBleed = location.pathname === '/explore';
  const current = ALL_ITEMS.find((i) => location.pathname.startsWith(i.to));

  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className="relative min-h-dvh">
      <Atmosphere intensity={0.32} />
      <SkipLink />

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] border-r border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-base px-3 pt-[env(safe-area-inset-top)] lg:hidden">
        <button type="button" className="btn btn-icon btn-sm" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          <List size={17} />
        </button>
        <NavLink to="/dashboard" aria-label="Tiresias home"><Logo size={26} showName={false} /></NavLink>
        <span className="truncate text-[14px] font-semibold text-fg">{current?.label || 'Tiresias'}</span>
        <span className="ml-auto"><ThemeToggle compact /></span>
      </header>

      <div className="relative z-[1] lg:pl-[var(--sidebar-w)]">
        <main
          id="main"
          className={fullBleed
            ? 'h-[calc(100dvh-56px-64px-env(safe-area-inset-bottom))] p-2 sm:p-3 lg:h-dvh lg:p-4'
            : 'mx-auto w-full max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10'}
        >
          <AnimatedOutlet />
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[color-mix(in_srgb,var(--bg-2)_96%,transparent)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5">
          {TAB_ITEMS.map((to) => {
            const it = ALL_ITEMS.find((i) => i.to === to);
            return (
              <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-fg' : 'text-fg-3'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`grid h-8 w-12 place-items-center rounded-[10px] transition-shadow ${isActive ? 'shadow-inset-1' : ''}`}>
                      <it.icon size={19} weight={isActive ? 'fill' : 'regular'} className={isActive ? 'text-accent' : ''} />
                    </span>
                    {it.short || it.label}
                  </>
                )}
              </NavLink>
            );
          })}
          <button type="button" onClick={() => setDrawer(true)} className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-fg-3">
            <span className="grid h-8 w-12 place-items-center"><DotsThreeOutline size={19} /></span>
            More
          </button>
        </div>
      </nav>

      {/* Drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.button
              type="button" aria-label="Close navigation" tabIndex={-1}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 cursor-default bg-scrim lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 32, stiffness: 340 }}
              role="dialog" aria-modal="true" aria-label="Navigation"
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line bg-base pt-[env(safe-area-inset-top)] shadow-raise-4 lg:hidden"
            >
              <SidebarContent onNavigate={() => setDrawer(false)} layoutGroup="drawer" />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
