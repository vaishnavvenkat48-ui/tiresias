import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

const IMG = '/landing';

/**
 * Five centuries of people drawing knowledge as a map. Public-domain / CC BY
 * scans from Wikimedia Commons; credits live in the landing footer and in
 * public/landing/credits.json.
 */
export const PLATES = [
  { src: `${IMG}/llull-tree.jpg`, w: 1400, h: 1998, year: '1515', pos: '50% 62%', alt: 'Woodcut of a tree whose branches and roots are labelled with the names of the sciences', caption: 'Ramon Llull, Arbor scientiae, 1515', note: 'Llull drew every science as one tree: roots of first principles, branches of subjects.' },
  { src: `${IMG}/ptolemaic-planisphere.jpg`, w: 1200, h: 1001, year: '1660', pos: '50% 50%', alt: 'Hand-coloured planisphere of the Ptolemaic universe, the planets on concentric rings', caption: 'Planisphaerium Ptolemaicum, Boston Public Library', note: 'Astronomers set the whole known universe on concentric rings, each body in its place.' },
  { src: `${IMG}/bevis-star-chart.jpg`, w: 1400, h: 1191, year: '1750', pos: '50% 50%', alt: 'Engraved star chart with the constellations drawn as figures and the stars joined by lines', caption: 'John Bevis, star chart from Uranographia Britannica, 1750', note: 'Star charts joined points of light into figures, so a sky could be read and remembered.' },
  { src: `${IMG}/diderot-system.jpg`, w: 1400, h: 2359, year: '1751', pos: '50% 30%', alt: 'Printed chart dividing human knowledge into memory, reason and imagination, with bracketed branches', caption: "Diderot and d'Alembert, the figurative system of human knowledge, 1751", note: 'The Encyclopédie opened with a chart of all knowledge, split into memory, reason and imagination.' },
];

const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Pointer tilt: returns props for a motion element that leans toward the
 * cursor in 3D. Springs keep it soft; touch and reduced motion get nothing.
 */
export const useTilt = (max = 8) => {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), { stiffness: 160, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-max, max]), { stiffness: 160, damping: 18 });
  if (reduce) return { ref, style: {}, handlers: {} };
  const onPointerMove = (e) => {
    if (!finePointer() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onPointerLeave = () => { px.set(0); py.set(0); };
  return { ref, style: { rotateX: rx, rotateY: ry, transformPerspective: 1100 }, handlers: { onPointerMove, onPointerLeave } };
};

/**
 * A fanned stack of the plates standing in depth; the whole stack leans
 * toward the pointer and each plate sits at its own Z, so they part as it turns.
 */
export const PlateStack = ({ plates = PLATES.slice(0, 3), className = '' }) => {
  const reduce = useReducedMotion();
  const tilt = useTilt(12);
  return (
    <div className={`lp-stack ${className}`} {...tilt.handlers}>
      <motion.div ref={tilt.ref} className="lp-stack-inner" style={tilt.style}>
        {plates.map((p, i) => {
          const off = i - (plates.length - 1) / 2;
          return (
            <motion.figure
              key={p.src}
              className="lp-stack-plate"
              initial={reduce ? false : { opacity: 0, z: -400, rotateZ: 0 }}
              animate={{ opacity: 1, z: (plates.length - i) * 30, rotateZ: off * 7, x: `${off * 16}%`, y: `${Math.abs(off) * 5}%` }}
              transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 + i * 0.12 }}
              style={{ zIndex: plates.length - i }}
            >
              <img src={p.src} alt={p.alt} width={p.w} height={p.h} style={{ objectPosition: p.pos }} />
            </motion.figure>
          );
        })}
      </motion.div>
    </div>
  );
};
