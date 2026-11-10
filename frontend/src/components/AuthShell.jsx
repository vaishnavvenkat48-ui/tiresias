import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { PlateStack, PLATES } from './MapPlates';
import '../pages/landing.css';

const EASE = [0.2, 0.8, 0.2, 1];

/** What a free account adds, stated plainly (matches the landing page and the quotas). */
const PERKS = [
  'Save every map to your library',
  'Expand any concept into its own branch',
  'Share a read-only link with anyone',
  'Ask the AI tutor about what you mapped',
];

const Mark = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.4" stroke="#4f6238" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="2.8" fill="#4f6238" />
  </svg>
);

/**
 * Two fields: the form on sand, and a charcoal field holding three
 * centuries-old maps of knowledge fanned out in depth.
 */
const AuthShell = ({ title, subtitle, children, aside = 'Every concept, connected, with its source.' }) => {
  const reduce = useReducedMotion();
  const rise = (d = 0) => (reduce ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE, delay: d } });
  return (
    <div className="lp lp-auth">
      <div className="lp-auth-form">
        <Link to="/" className="lp-wordmark" aria-label="Tiresias home"><Mark /> <span translate="no">Tiresias</span></Link>
        <div className="lp-auth-body">
          <motion.h1 className="lp-head lp-h2" {...rise(0)}>{title}</motion.h1>
          <motion.div className="lp-auth-sub" {...rise(0.06)}>{subtitle}</motion.div>
          <motion.div className="lp-auth-fields" {...rise(0.12)}>{children}</motion.div>
        </div>
        <p className="lp-small lp-muted">Maps are built from Wikipedia (CC BY-SA 4.0) and Wikidata (CC0).</p>
      </div>
      <aside className="lp-auth-aside" aria-label="What an account gives you">
        <PlateStack plates={[PLATES[0], PLATES[3], PLATES[2], PLATES[1]]} />
        <div className="lp-auth-aside-text">
          <p className="lp-lead">{aside}</p>
          <ul>
            {PERKS.map((p, i) => (
              <motion.li key={p} {...(reduce ? {} : { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.5, ease: EASE, delay: 0.5 + i * 0.08 } })}>{p}</motion.li>
            ))}
          </ul>
          <p className="lp-cap">Maps of knowledge by Ramon Llull, 1515; Diderot, 1751; John Bevis, 1750; and a Ptolemaic planisphere</p>
        </div>
      </aside>
    </div>
  );
};

export default AuthShell;
