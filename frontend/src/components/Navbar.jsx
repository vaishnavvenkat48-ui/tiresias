import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import { ThemeToggle } from './UI';

/** Marketing-site navigation (landing page only). */
const Navbar = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="surface-sm fixed inset-x-3 top-3 z-50 mx-auto max-w-6xl sm:inset-x-6"
    >
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <Link to="/" aria-label="Tiresias home"><Logo size={28} /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-[13.5px] font-medium text-fg-2 md:flex">
          <Link to="/#showcase" className="transition hover:text-fg">Examples</Link>
          <Link to="/#how" className="transition hover:text-fg">How it works</Link>
          <Link to="/try" className="transition hover:text-fg">Try it</Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="mr-1 hidden sm:inline-flex"><ThemeToggle compact /></span>
          {isAuthenticated ? (
            <>
              <button type="button" onClick={() => { logout(); navigate('/'); }} className="btn btn-ghost btn-sm hidden sm:inline-flex">Sign out</button>
              <Link to="/dashboard" className="btn btn-primary btn-sm">Open app</Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Get started</Link>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
};

export default Navbar;
