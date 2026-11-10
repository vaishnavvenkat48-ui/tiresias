import { useCallback, useEffect, useRef } from 'react';
import { forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY } from 'd3-force';

/** Approximate rendered node width (for collision) from its label. */
export const nodeRadius = (n) => {
  const len = Math.min((n.label || '').length, 34);
  const w = n.depth === 0 ? 70 + len * 8 : n.depth === 1 ? 46 + len * 6.6 : 40 + len * 6.2;
  return Math.min(w, n.depth === 0 ? 240 : 210) * 0.45 + 8;
};

/**
 * d3-force engine driving React Flow positions.
 *  - Repulsion (manyBody), spring links, rectangular-ish collision, centring.
 *  - Velocity damping via velocityDecay; alpha decay → natural stabilisation.
 *  - The rAF loop only runs while the simulation is "hot" (or a drag is in
 *    progress) and stops when it cools — no idle CPU.
 *  - `strength` scales repulsion/springs (user-adjustable).
 *
 * The hook owns simulation nodes (Map id → {x,y,vx,vy,fx,fy}); React state only
 * receives positions through `onTick`, batched once per animation frame.
 */
export const useForceLayout = ({ onTick, onSettle, reducedMotion }) => {
  const simRef = useRef(null);
  const nodesRef = useRef(new Map());
  const rafRef = useRef(0);
  const draggingRef = useRef(new Set());
  const enabledRef = useRef(true);
  const strengthRef = useRef(1);
  const cbRef = useRef({ onTick, onSettle });
  cbRef.current = { onTick, onSettle };

  if (!simRef.current) {
    simRef.current = forceSimulation([])
      .force('charge', forceManyBody())
      .force('link', forceLink([]).id((d) => d.id))
      .force('collide', forceCollide())
      .force('x', forceX(0).strength(0.03))
      .force('y', forceY(0).strength(0.04))
      .velocityDecay(0.42)
      .alphaDecay(0.03)
      .alphaMin(0.004)
      .stop();
  }

  const configure = useCallback(() => {
    const k = strengthRef.current;
    const sim = simRef.current;
    sim.force('charge').strength((d) => (d.depth === 0 ? -1100 : d.depth === 1 ? -560 : -300) * k).distanceMax(1100).theta(0.9);
    sim.force('link')
      .distance((l) => (l.type === 'related' ? 240 : l.source.depth === 0 ? 190 + 20 * k : 120 + 15 * k))
      .strength((l) => (l.type === 'related' ? 0.05 : 0.5) * Math.min(1.5, 0.55 + 0.45 * k));
    sim.force('collide').radius((d) => d.r).strength(0.9).iterations(2);
  }, []);

  const step = useCallback(() => {
    const sim = simRef.current;
    sim.tick();
    cbRef.current.onTick(nodesRef.current, draggingRef.current);
    if (enabledRef.current && (sim.alpha() > sim.alphaMin() || draggingRef.current.size > 0)) {
      rafRef.current = requestAnimationFrame(step);
    } else {
      rafRef.current = 0;
      cbRef.current.onSettle?.(nodesRef.current);
    }
  }, []);

  /** Heat the simulation and make sure the loop is running. */
  const kick = useCallback((alpha = 0.3) => {
    if (!enabledRef.current) return;
    const sim = simRef.current;
    sim.alpha(Math.max(sim.alpha(), alpha));
    if (reducedMotion && draggingRef.current.size === 0) {
      // No animation: converge instantly, render once.
      sim.tick(Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay())));
      cbRef.current.onTick(nodesRef.current, draggingRef.current);
      cbRef.current.onSettle?.(nodesRef.current);
      return;
    }
    if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
  }, [reducedMotion, step]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  /** Replace the node/link sets (keeps existing positions & velocities). */
  const setGraph = useCallback((simNodes, links) => {
    const sim = simRef.current;
    sim.nodes(simNodes);
    sim.force('link').links(links);
    configure();
  }, [configure]);

  /** Synchronous ticks (used for pre-warming and static layout). */
  const warm = useCallback((ticks) => {
    const sim = simRef.current;
    sim.alpha(1);
    sim.tick(ticks);
  }, []);

  const setEnabled = useCallback((on) => {
    enabledRef.current = on;
    if (!on) stop();
  }, [stop]);

  const setStrength = useCallback((k) => {
    strengthRef.current = k;
    configure();
  }, [configure]);

  // Reset the handle too — otherwise kick() thinks a loop is still running after
  // a remount (StrictMode, route changes) and physics silently freezes.
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }, []);

  return { sim: simRef, nodes: nodesRef, dragging: draggingRef, kick, stop, setGraph, warm, setEnabled, setStrength };
};
