import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { analyticsApi } from '../services/dataService';

const UserContext = createContext(null);

/**
 * Personal stats shared by Dashboard, Sidebar and Profile.
 * Backed by GET /api/analytics/me — refresh() after actions that change them.
 */
export const UserProvider = ({ children }) => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setAnalytics(await analyticsApi.me(30));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
    else setAnalytics(null);
  }, [user, refresh]);

  const value = useMemo(
    () => ({ analytics, stats: analytics?.totals || null, error, refresh }),
    [analytics, error, refresh]
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
};
