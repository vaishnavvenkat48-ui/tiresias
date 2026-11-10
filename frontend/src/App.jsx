import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { UserProvider } from './context/UserContext';
import { PrefsProvider, usePrefs } from './context/PrefsContext';
import { ToastProvider } from './context/ToastContext';
import { PublicLayout, AppLayout } from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Route-level code splitting — the graph engine only loads where it's used.
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const TryGraph = lazy(() => import('./pages/TryGraph'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Explore = lazy(() => import('./pages/Explore'));
const Graphs = lazy(() => import('./pages/Graphs'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

const Motion = ({ children }) => {
  const { reducedMotion } = usePrefs();
  return <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>{children}</MotionConfig>;
};

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <PrefsProvider>
        <UserProvider>
          <ToastProvider>
            <Motion>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/try" element={<TryGraph mode="try" />} />
                  <Route path="/g/:shareId" element={<TryGraph mode="shared" />} />
                  <Route path="/404" element={<NotFound />} />
                </Route>
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/graphs" element={<Graphs />} />
                  <Route path="/assistant" element={<Assistant />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  {/* merged into Home (council decision) — keep old links working */}
                  <Route path="/history" element={<Navigate to="/dashboard#activity" replace />} />
                  <Route path="/analytics" element={<Navigate to="/dashboard#activity" replace />} />
                  <Route path="/paths" element={<Navigate to="/dashboard" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </Motion>
          </ToastProvider>
        </UserProvider>
      </PrefsProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
