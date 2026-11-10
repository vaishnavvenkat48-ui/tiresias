import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, SignOut } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import { ThemeToggle } from './UI';
import { NAV_GROUPS, ACCOUNT_ITEMS } from './nav';
import { initials } from '../utils/data';

const Item = ({ item, onNavigate, layoutGroup }) => (
  <NavLink to={item.to} onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
    {({ isActive }) => (
      <>
        {isActive && (
          <motion.span
            layoutId={`nav-active-${layoutGroup}`}
            className="absolute inset-0 rounded-[10px]"
            style={{ background: 'var(--surface-grad)', boxShadow: 'var(--raise-1), var(--rim)', border: '1px solid var(--line)' }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          />
        )}
        <item.icon size={18} weight={isActive ? 'fill' : 'regular'} className={`relative ${isActive ? 'text-accent' : ''}`} />
        <span className="relative truncate">{item.label}</span>
      </>
    )}
  </NavLink>
);

/** Navigation column — used by the desktop rail and the mobile/tablet drawer. */
export const SidebarContent = ({ onNavigate, layoutGroup = 'rail' }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="flex items-center justify-between px-2 pb-4 pt-2">
        <NavLink to="/dashboard" onClick={onNavigate} aria-label="Tiresias home"><Logo size={30} /></NavLink>
      </div>

      <NavLink to="/explore" onClick={onNavigate} className="btn btn-primary mb-4 w-full justify-start gap-2.5 !px-3">
        <Plus size={16} weight="bold" /> New exploration
      </NavLink>

      <nav aria-label="Primary" className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => <Item key={it.to} item={it} onNavigate={onNavigate} layoutGroup={layoutGroup} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-line-strong pt-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-3">
          <span className="text-[12px] text-fg-3">Appearance</span>
          <ThemeToggle compact />
        </div>
        {ACCOUNT_ITEMS.map((it) => <Item key={it.to} item={it} onNavigate={onNavigate} layoutGroup={layoutGroup} />)}
        <div className="surface-sm mt-2 flex items-center gap-3 p-2.5">
          <span className="well-sm grid h-9 w-9 shrink-0 place-items-center text-[13px] font-semibold text-accent">{initials(user?.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-fg">{user?.name || 'Explorer'}</p>
            <p className="truncate text-[12px] text-fg-3">@{user?.username || 'guest'}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Sign out" title="Sign out" onClick={() => { logout(); navigate('/'); }}>
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SidebarContent;
