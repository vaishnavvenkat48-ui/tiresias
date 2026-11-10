import axios from 'axios';

/** Same-origin `/api` in production builds (backend serves the app); localhost in dev. */
export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tiresias_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired/revoked token anywhere should end the session cleanly.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register')) {
      window.dispatchEvent(new CustomEvent('tiresias:unauthorized'));
    }
    return Promise.reject(err);
  }
);

/** Unwrap the backend `{ success, message, data }` envelope. */
export const unwrap = (res) => res.data?.data;

/** Human-readable message from an axios error. */
export const errorMessage = (err, fallback = 'Something went wrong.') => {
  if (!err?.response) return 'Cannot reach the Tiresias server. Is the backend running?';
  return err.response.data?.message || fallback;
};

export default api;
