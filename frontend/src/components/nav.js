import { House, Graph, Sparkle, BookmarkSimple, UserCircle, GearSix } from '@phosphor-icons/react';

/**
 * Single source of truth for app navigation (sidebar, drawer, tab bar).
 * Deliberately small: the product is one core loop (explore → inspect → save)
 * plus a place to keep and ask about what you saved.
 */
export const NAV_GROUPS = [
  {
    label: 'Explore',
    items: [
      { to: '/dashboard', label: 'Home', icon: House },
      { to: '/explore', label: 'Explore', icon: Graph },
      { to: '/graphs', label: 'Library', icon: BookmarkSimple },
      { to: '/assistant', label: 'Ask Tiresias', short: 'Ask', icon: Sparkle },
    ],
  },
];

export const ACCOUNT_ITEMS = [
  { to: '/profile', label: 'Profile', icon: UserCircle },
  { to: '/settings', label: 'Settings', icon: GearSix },
];

export const TAB_ITEMS = ['/dashboard', '/explore', '/graphs', '/assistant'];

export const ALL_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ...ACCOUNT_ITEMS];
