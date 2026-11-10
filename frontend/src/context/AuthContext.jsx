import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { fetchMe } from '../services/authService';
import api from '../services/api';

const AuthContext = createContext(null);

const clearStorage = () => {
  localStorage.removeItem('tiresias_token');
  localStorage.removeItem('tiresias_user');
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tiresias_user') || 'null'); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('tiresias_token') || null);
  const [loading, setLoading] = useState(true);

  // Rehydrate + verify session on boot
  useEffect(() => {
    (async () => {
      if (!token) { setLoading(false); return; }
      try {
        const { user: fresh } = await fetchMe();
        setUser(fresh);
        localStorage.setItem('tiresias_user', JSON.stringify(fresh));
      } catch (err) {
        // Only drop the session for auth failures — keep it if the server is merely offline.
        if (err.response?.status === 401 || err.response?.status === 403) {
          setUser(null); setToken(null); clearStorage();
        }
      } finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line

  const login = useCallback(({ token: t, user: u, remember }) => {
    setToken(t); setUser(u);
    localStorage.setItem('tiresias_token', t);
    localStorage.setItem('tiresias_user', JSON.stringify(u));
    if (remember) localStorage.setItem('tiresias_remember', '1');
  }, []);

  const logout = useCallback(() => {
    const t = localStorage.getItem('tiresias_token');
    // Revoke refresh tokens server-side (token captured before storage is cleared)
    if (t) api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
    setToken(null); setUser(null);
    clearStorage();
  }, []);

  // Any 401 from the API ends the session (expired / revoked token)
  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null); clearStorage(); };
    window.addEventListener('tiresias:unauthorized', onUnauthorized);
    return () => window.removeEventListener('tiresias:unauthorized', onUnauthorized);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, token, loading, isAuthenticated: !!token && !!user, login, logout }),
    [user, token, loading, login, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
