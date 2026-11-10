export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

export const initials = (name = '') =>
  (name || '').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'T';

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};
