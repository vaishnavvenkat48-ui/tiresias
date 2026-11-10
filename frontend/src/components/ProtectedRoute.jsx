import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-pulse"><Logo size={44} showName={false} /></div>
          <span className="text-[13px] text-fg-2">Opening your observatory…</span>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return children;
};

export default ProtectedRoute;
