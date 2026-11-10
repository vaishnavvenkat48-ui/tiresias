import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

const NotFound = () => {
  const { isAuthenticated } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="surface w-full max-w-md p-8 text-center">
        <span className="well mx-auto grid h-16 w-16 place-items-center !rounded-full text-accent"><Compass size={28} weight="duotone" /></span>
        <p className="mt-6 font-display text-6xl text-fg">404</p>
        <h1 className="mt-2 text-[18px] font-semibold text-fg">This page drifted off the graph</h1>
        <p className="mt-2 text-[13.5px] text-fg-2">The link may be broken, or the page has moved.</p>
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="btn btn-primary mt-7 w-full"><ArrowLeft size={15} /> {isAuthenticated ? 'Back to Home' : 'Back to Tiresias'}</Link>
      </div>
    </div>
  );
};

export default NotFound;
