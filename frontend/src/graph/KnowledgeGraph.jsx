import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, applyNodeChanges, useReactFlow, useNodesInitialized } from '@xyflow/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MagnifyingGlass, Plus, Minus, CornersOut, CornersIn, ArrowsCounterClockwise, FrameCorners, Atom, SlidersHorizontal,
  X, CaretUp, CaretDown, EyeSlash, Eye, PushPin, PushPinSlash, ArrowsOutSimple, ArrowsInSimple, Crosshair, Info,
  ArrowSquareOut, Copy, Lightbulb,
} from '@phosphor-icons/react';
import ConceptNode from './ConceptNode';
import EdgeLayer from './EdgeLayer';
import { useForceLayout, nodeRadius } from './useForceLayout';
import { descendantsOf } from './model';
import { usePrefs } from '../context/PrefsContext';

const nodeTypes = { concept: ConceptNode };
const NO_EDGES = [];
const NODE_ORIGIN = [0.5, 0.5];
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/* ───────────── Small graph-chrome controls ───────────── */

const ToolButton = ({ label, shortcut, onClick, children, active = false, disabled = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={active || undefined}
    title={shortcut ? `${label} (${shortcut})` : label}
    className="btn btn-ghost btn-icon btn-sm !h-9 !w-9 text-fg-2 hover:text-fg"
  >
    {children}
  </button>
);

const MenuItem = ({ icon: Icon, label, hint, onClick, danger }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-hover focus-visible:bg-hover ${danger ? 'text-danger' : 'text-fg'}`}
  >
    <Icon size={15} className={danger ? '' : 'text-fg-2'} />
    <span className="flex-1">{label}</span>
    {hint && <span className="kbd">{hint}</span>}
  </button>
);

/* ───────────────────────── Inner graph ───────────────────────── */

const GraphInner = forwardRef(function GraphInner(
  {
    graph,
    graphKey,
    layout,
    onLayoutChange,
    selectedId = null,
    onSelect,
    onExpand,
    onAction,
    expandingIds,
    compact = false,
    title = 'Knowledge graph',
    fullscreenRef = null, // optional: element to take fullscreen instead of the canvas
  },
  ref
) {
  const rf = useReactFlow();
  const { prefs, setPref, reducedMotion } = usePrefs();
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  const [rfNodes, setRfNodes] = useState([]);
  const [pinned, setPinned] = useState(() => new Set(layout?.pinned || []));
  const [hidden, setHidden] = useState(() => new Set(layout?.hidden || []));
  const [physics, setPhysicsState] = useState(layout?.physics ?? prefs.physics);
  const [strength, setStrengthState] = useState(layout?.strength ?? prefs.strength);
  const [hoverId, setHoverId] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, nodeId | null }
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [newIds, setNewIds] = useState(() => new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const [fsFallback, setFsFallback] = useState(false);
  const [showTuning, setShowTuning] = useState(false);

  const memoryRef = useRef({}); // last known positions incl. hidden nodes
  const keyRef = useRef(null);
  const userMovedRef = useRef(false);
  const firstSettleRef = useRef(false);
  const stateRef = useRef({});
  stateRef.current = { pinned, hidden, physics, strength, graph, onLayoutChange };

  /* ── Layout persistence ── */
  const emitLayout = useCallback(() => {
    const s = stateRef.current;
    if (!s.onLayoutChange) return;
    const positions = { ...memoryRef.current };
    for (const [id, n] of force.nodes.current) positions[id] = { x: Math.round(n.x), y: Math.round(n.y) };
    s.onLayoutChange({ positions, pinned: [...s.pinned], hidden: [...s.hidden], physics: s.physics, strength: s.strength });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Physics → React Flow (one batched state update per frame) ── */
  const onTick = useCallback((simNodes, dragging) => {
    setRfNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        if (dragging.has(n.id)) return n;
        const s = simNodes.get(n.id);
        if (!s) return n;
        if (Math.abs(n.position.x - s.x) < 0.1 && Math.abs(n.position.y - s.y) < 0.1) return n;
        changed = true;
        return { ...n, position: { x: s.x, y: s.y } };
      });
      return changed ? next : prev;
    });
  }, []);

  const onSettle = useCallback(() => {
    emitLayout();
    if (!firstSettleRef.current && !userMovedRef.current) {
      firstSettleRef.current = true;
      rf.fitView({ padding: 0.16, duration: reducedMotion ? 0 : 700 });
    }
  }, [emitLayout, rf, reducedMotion]);

  const force = useForceLayout({ onTick, onSettle, reducedMotion });

  useEffect(() => { force.setEnabled(physics); }, [physics]); // eslint-disable-line
  useEffect(() => { force.setStrength(strength); }, [strength]); // eslint-disable-line

  /* ── Derived graph structure ── */
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const visibleNodes = useMemo(() => graph.nodes.filter((n) => !hidden.has(n.id)), [graph.nodes, hidden]);
  const visibleEdges = useMemo(() => graph.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)), [graph.edges, hidden]);
  const adjacency = useMemo(() => {
    const m = new Map();
    for (const e of visibleEdges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source).add(e.target);
      m.get(e.target).add(e.source);
    }
    return m;
  }, [visibleEdges]);
  const hiddenChildCount = useMemo(() => {
    const c = {};
    for (const n of graph.nodes) {
      const p = n.metadata?.parent;
      if (p && hidden.has(n.id) && !hidden.has(p)) c[p] = (c[p] || 0) + 1;
    }
    return c;
  }, [graph.nodes, hidden]);

  /* ── Stable per-node data objects (avoid re-rendering unchanged nodes) ── */
  const dataCache = useRef(new Map());
  const dataFor = useCallback((n) => {
    const next = {
      label: n.label,
      description: n.description,
      depth: n.depth,
      pinned: pinned.has(n.id),
      expanding: !!expandingIds?.has(n.id),
      hiddenCount: hiddenChildCount[n.id] || 0,
      isNew: newIds.has(n.id),
      ai: n.provenance === 'ai_suggested',
    };
    const prev = dataCache.current.get(n.id);
    if (prev && Object.keys(next).every((k) => prev[k] === next[k])) return prev;
    dataCache.current.set(n.id, next);
    return next;
  }, [pinned, expandingIds, hiddenChildCount, newIds]);

  /* ── Sync graph structure into the simulation + React Flow ── */
  useEffect(() => {
    const map = force.nodes.current;
    const isReset = keyRef.current !== graphKey;
    const saved = layout?.positions || {};
    if (isReset) {
      keyRef.current = graphKey;
      map.clear();
      dataCache.current.clear();
      memoryRef.current = { ...saved };
      firstSettleRef.current = false;
      userMovedRef.current = false;
      setPinned(new Set(layout?.pinned || []));
      setHidden(new Set(layout?.hidden || []));
      setPhysicsState(layout?.physics ?? prefs.physics);
      setStrengthState(layout?.strength ?? prefs.strength);
      setMenu(null);
      setQuery('');
    }
    const pinnedNow = isReset ? new Set(layout?.pinned || []) : stateRef.current.pinned;
    const hiddenNow = isReset ? new Set(layout?.hidden || []) : stateRef.current.hidden;
    const physicsNow = isReset ? (layout?.physics ?? prefs.physics) : stateRef.current.physics;
    if (isReset) force.setStrength(layout?.strength ?? prefs.strength);

    const visible = graph.nodes.filter((n) => !hiddenNow.has(n.id));
    const ids = new Set(visible.map((n) => n.id));
    const fresh = [];
    const placedWithoutMemory = [];

    for (const n of visible) {
      let s = map.get(n.id);
      if (!s) {
        const mem = memoryRef.current[n.id];
        s = { id: n.id, depth: n.depth, r: nodeRadius(n) };
        if (mem) {
          s.x = mem.x; s.y = mem.y;
        } else {
          const p = map.get(n.metadata?.parent);
          if (p && p.x !== undefined) {
            const a = Math.random() * Math.PI * 2;
            s.x = p.x + Math.cos(a) * 40; s.y = p.y + Math.sin(a) * 40;
            placedWithoutMemory.push(n);
          } else if (n.depth === 0) {
            s.x = 0; s.y = 0;
          }
          if (!isReset) fresh.push(n.id);
        }
        if (pinnedNow.has(n.id) && s.x !== undefined) { s.fx = s.x; s.fy = s.y; }
        map.set(n.id, s);
      } else {
        s.depth = n.depth;
        s.r = nodeRadius(n);
      }
    }
    for (const [id, s] of [...map]) {
      if (!ids.has(id)) {
        memoryRef.current[id] = { x: Math.round(s.x), y: Math.round(s.y) };
        map.delete(id);
      }
    }

    // Without physics, lay new children on an arc pointing away from their grandparent.
    if (!physicsNow && placedWithoutMemory.length) {
      const groups = new Map();
      for (const n of placedWithoutMemory) {
        const p = n.metadata.parent;
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(n);
      }
      for (const [pid, kids] of groups) {
        const p = map.get(pid);
        const gp = map.get(byId.get(pid)?.metadata?.parent) || { x: 0, y: 0 };
        const base = p.x === gp.x && p.y === gp.y ? -Math.PI / 2 : Math.atan2(p.y - gp.y, p.x - gp.x);
        const spread = Math.min(Math.PI * 1.2, 0.5 * kids.length);
        kids.forEach((k, i) => {
          const a = base - spread / 2 + (kids.length === 1 ? spread / 2 : (spread * i) / (kids.length - 1));
          const s = map.get(k.id);
          s.x = p.x + Math.cos(a) * 170;
          s.y = p.y + Math.sin(a) * 170;
        });
      }
    }

    const links = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type }));
    force.setGraph([...map.values()], links);

    const hasMemory = Object.keys(memoryRef.current).length > 0;
    if (isReset && !hasMemory) {
      force.warm(physicsNow ? 90 : 320); // pre-settle so the first paint isn't a pile-up
    }
    if (physicsNow) {
      force.setEnabled(true);
      force.kick(isReset ? (hasMemory ? 0.04 : 0.35) : fresh.length ? 0.55 : 0.2);
    } else {
      force.setEnabled(false); // static arrangement: positions only change when the user drags
    }

    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return visible.map((n) => {
        const s = map.get(n.id);
        const old = isReset ? null : prevById.get(n.id);
        return {
          id: n.id,
          type: 'concept',
          position: { x: s.x ?? 0, y: s.y ?? 0 },
          data: dataFor(n),
          selected: old?.selected || false,
          ...(old?.measured ? { measured: old.measured } : {}),
        };
      });
    });

    if (fresh.length) {
      setNewIds(new Set(fresh));
      const t = setTimeout(() => setNewIds(new Set()), 900);
      return () => clearTimeout(t);
    }
    if (isReset) needsFitRef.current = true; // fitted once React Flow has measured the nodes
    return undefined;
  }, [graphKey, graph.nodes, graph.edges, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Fit on first measurement after a reset (fitView is a no-op before nodes have sizes) */
  const needsFitRef = useRef(true);
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (!nodesInitialized || !needsFitRef.current || !rfNodes.length) return;
    needsFitRef.current = false;
    requestAnimationFrame(() => rf.fitView({ padding: 0.16, duration: 0 }));
  }, [nodesInitialized, rfNodes.length, rf]);

  /* Refresh node data when flags change (pins, spinners, hidden counts) */
  useEffect(() => {
    setRfNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        const src = byId.get(n.id);
        if (!src) return n;
        const d = dataFor(src);
        if (d === n.data) return n;
        changed = true;
        return { ...n, data: d };
      });
      return changed ? next : prev;
    });
  }, [dataFor, byId]);

  /* ── Search & highlight ── */
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? visibleNodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id) : []),
    [q, visibleNodes]
  );
  const matchSet = useMemo(() => new Set(matches), [matches]);
  useEffect(() => { setMatchIdx(0); }, [q]);

  const focusNode = useCallback((id, { select = false, zoom } = {}) => {
    const s = force.nodes.current.get(id);
    if (!s) return;
    rf.setCenter(s.x, s.y, { zoom: zoom ?? Math.max(rf.getZoom(), 1.05), duration: reducedMotion ? 0 : 650 });
    userMovedRef.current = true;
    if (select) onSelect?.(id);
  }, [rf, reducedMotion, onSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  const gotoMatch = useCallback((dir = 1) => {
    if (!matches.length) return;
    const i = (matchIdx + dir + matches.length) % matches.length;
    setMatchIdx(i);
    focusNode(matches[i], { select: true });
  }, [matches, matchIdx, focusNode]);

  /* ── Display decoration (classes only; nodes themselves stay memoised) ── */
  const activeId = hoverId || selectedId;
  const displayNodes = useMemo(() => rfNodes.map((n) => {
    const cls = [];
    if (n.id === selectedId) cls.push('is-selected');
    if (q) cls.push(matchSet.has(n.id) ? 'is-match' : 'is-dim');
    else if (hoverId) cls.push(n.id === hoverId || adjacency.get(hoverId)?.has(n.id) ? 'is-hl' : 'is-dim');
    else if (selectedId && adjacency.get(selectedId)?.has(n.id)) cls.push('is-hl');
    const className = cls.join(' ') || undefined;
    return n.className === className ? n : { ...n, className };
  }), [rfNodes, selectedId, hoverId, adjacency, q, matchSet]);

  const displayEdges = useMemo(() => visibleEdges.map((e) => {
    let state = '';
    if (q) state = matchSet.has(e.source) || matchSet.has(e.target) ? '' : 'is-dim';
    else if (activeId) {
      const touches = e.source === activeId || e.target === activeId;
      state = touches ? 'is-hl' : hoverId ? 'is-dim' : '';
    }
    return { id: e.id, source: e.source, target: e.target, kind: e.type, prov: e.provenance, state, isNew: newIds.has(e.target) || newIds.has(e.source) };
  }), [visibleEdges, activeId, hoverId, q, matchSet, newIds]);

  /* ── Interactions ── */
  const onNodesChange = useCallback((changes) => setRfNodes((nds) => applyNodeChanges(changes, nds)), []);

  const onNodeDragStart = useCallback((_e, _node, nodes) => {
    setMenu(null);
    for (const n of nodes) {
      force.dragging.current.add(n.id);
      const s = force.nodes.current.get(n.id);
      if (s) { s.fx = n.position.x; s.fy = n.position.y; }
    }
    if (stateRef.current.physics) {
      force.sim.current.alphaTarget(0.22);
      force.kick(0.22);
    }
  }, [force]);

  const onNodeDrag = useCallback((_e, _node, nodes) => {
    for (const n of nodes) {
      const s = force.nodes.current.get(n.id);
      if (s) { s.fx = s.x = n.position.x; s.fy = s.y = n.position.y; }
    }
  }, [force]);

  const onNodeDragStop = useCallback((_e, _node, nodes) => {
    const { pinned: pins, physics: phys } = stateRef.current;
    for (const n of nodes) {
      force.dragging.current.delete(n.id);
      const s = force.nodes.current.get(n.id);
      if (!s) continue;
      s.x = n.position.x; s.y = n.position.y;
      if (pins.has(n.id) || !phys) { s.fx = s.x; s.fy = s.y; } else { s.fx = null; s.fy = null; }
    }
    force.sim.current.alphaTarget(0);
    if (!phys) emitLayout();
  }, [force, emitLayout]);

  const togglePin = useCallback((ids, forceValue) => {
    const list = Array.isArray(ids) ? ids : [ids];
    setPinned((prev) => {
      const next = new Set(prev);
      const pinAll = forceValue ?? list.some((id) => !prev.has(id));
      for (const id of list) {
        const s = force.nodes.current.get(id);
        if (pinAll) { next.add(id); if (s) { s.fx = s.x; s.fy = s.y; } } else {
          next.delete(id);
          if (s && stateRef.current.physics) { s.fx = null; s.fy = null; }
        }
      }
      stateRef.current.pinned = next;
      return next;
    });
    if (stateRef.current.physics) force.kick(0.1);
    setTimeout(emitLayout, 0);
  }, [force, emitLayout]);

  const hideIds = useCallback((ids) => {
    setHidden((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => { if (id !== 'root') next.add(id); });
      stateRef.current.hidden = next;
      return next;
    });
    if (ids.includes(selectedId)) onSelect?.(null);
    setTimeout(emitLayout, 0);
  }, [emitLayout, selectedId, onSelect]);

  const showIds = useCallback((ids) => {
    setHidden((prev) => {
      const next = new Set(prev);
      (ids || [...prev]).forEach((id) => next.delete(id));
      stateRef.current.hidden = next;
      return next;
    });
    setTimeout(emitLayout, 0);
  }, [emitLayout]);

  /** Double-click semantics: fetch → reveal → collapse. */
  const expandOrToggle = useCallback((id, intent = 'toggle') => {
    const node = byId.get(id);
    if (!node) return;
    const desc = descendantsOf(graph.nodes, id);
    const anyHidden = desc.some((d) => hidden.has(d));
    if (!node.metadata?.expanded || desc.length === 0) {
      if (intent !== 'collapse') onExpand?.(id);
    } else if (anyHidden && intent !== 'collapse') {
      showIds(desc);
    } else if (intent !== 'expand') {
      hideIds(desc);
    } else {
      onExpand?.(id); // explicit "expand more"
    }
  }, [byId, graph.nodes, hidden, onExpand, showIds, hideIds]);

  const setPhysics = useCallback((on) => {
    setPhysicsState(on);
    stateRef.current.physics = on;
    force.setEnabled(on);
    if (on) {
      for (const s of force.nodes.current.values()) if (!stateRef.current.pinned.has(s.id)) { s.fx = null; s.fy = null; }
      force.kick(0.5);
    } else {
      for (const s of force.nodes.current.values()) { s.fx = s.x; s.fy = s.y; s.vx = 0; s.vy = 0; }
      emitLayout();
    }
  }, [force, emitLayout]);

  const setStrength = useCallback((k) => {
    setStrengthState(k);
    stateRef.current.strength = k;
    force.setStrength(k);
    if (stateRef.current.physics) force.kick(0.45);
  }, [force]);

  const resetLayout = useCallback(() => {
    memoryRef.current = {};
    setPinned(new Set());
    stateRef.current.pinned = new Set();
    for (const s of force.nodes.current.values()) {
      s.fx = null; s.fy = null; s.vx = 0; s.vy = 0;
      if (s.depth === 0) { s.x = 0; s.y = 0; } else { s.x = (Math.random() - 0.5) * 300; s.y = (Math.random() - 0.5) * 300; }
    }
    force.setEnabled(true);
    force.warm(stateRef.current.physics ? 60 : 320);
    if (stateRef.current.physics) force.kick(0.6);
    else {
      onTick(force.nodes.current, new Set());
      for (const s of force.nodes.current.values()) { s.fx = s.x; s.fy = s.y; }
      force.setEnabled(false);
    }
    firstSettleRef.current = false;
    userMovedRef.current = false;
    setTimeout(() => rf.fitView({ padding: 0.16, duration: reducedMotion ? 0 : 600 }), 80);
    setTimeout(emitLayout, 120);
  }, [force, onTick, rf, reducedMotion, emitLayout]);

  /* Fullscreen (native where available, CSS fallback otherwise) */
  // Fullscreen takes the whole workspace when the page provides one (so the
  // inspector panel comes along); otherwise just the canvas.
  const fsTarget = useCallback(() => fullscreenRef?.current || containerRef.current, [fullscreenRef]);
  const toggleFullscreen = useCallback(() => {
    const el = fsTarget();
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (fsFallback) { setFsFallback(false); return; }
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFsFallback(true));
    else setFsFallback(true);
  }, [fsFallback, fsTarget]);
  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement && document.fullscreenElement === fsTarget());
      setTimeout(() => rf.fitView({ padding: 0.16, duration: 300 }), 120);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [rf, fsTarget]);
  const isFull = fullscreen || fsFallback;
  // CSS fallback (no element fullscreen, e.g. iOS): pin the workspace over the page.
  useEffect(() => {
    const el = fullscreenRef?.current;
    if (!el) return undefined;
    el.classList.toggle('kg-fs-fallback', fsFallback);
    return () => el.classList.remove('kg-fs-fallback');
  }, [fsFallback, fullscreenRef]);

  /* Context menu */
  const openMenu = useCallback((e, nodeId = null) => {
    e.preventDefault();
    const box = containerRef.current.getBoundingClientRect();
    const x = Math.min(e.clientX - box.left, box.width - 236);
    const y = Math.min(e.clientY - box.top, box.height - (nodeId ? 360 : 220));
    setMenu({ x: Math.max(8, x), y: Math.max(8, y), nodeId });
    if (nodeId) onSelect?.(nodeId);
  }, [onSelect]);

  const selectedRfIds = useMemo(() => rfNodes.filter((n) => n.selected).map((n) => n.id), [rfNodes]);

  /* Keyboard shortcuts (full explorer only) */
  useEffect(() => {
    if (compact) return undefined;
    const onKey = (e) => {
      // A modal (video player, lightbox, dialogs) owns the keyboard while open:
      // Esc should close only that topmost layer, not also deselect the node.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === 'Escape') {
        if (menu) { setMenu(null); return; }
        if (fsFallback) { setFsFallback(false); return; }
        if (q) { setQuery(''); return; }
        onSelect?.(null);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'f') rf.fitView({ padding: 0.16, duration: 500 });
      else if (e.key === 'e' && selectedId) expandOrToggle(selectedId, 'expand');
      else if (e.key === 'p' && selectedId) togglePin(selectedId);
      else if (e.key === 'h' && selectedId) hideIds([selectedId, ...descendantsOf(graph.nodes, selectedId)]);
      else if (e.key === 'g') setPhysics(!stateRef.current.physics);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, menu, fsFallback, q, selectedId, rf, expandOrToggle, togglePin, hideIds, setPhysics, onSelect, graph.nodes]);

  useImperativeHandle(ref, () => ({
    focusNode,
    fit: () => rf.fitView({ padding: 0.16, duration: 500 }),
    expandOrToggle,
    togglePin,
    isPinned: (id) => stateRef.current.pinned.has(id),
    isHidden: (id) => stateRef.current.hidden.has(id),
    hideBranch: (id) => hideIds([id, ...descendantsOf(graph.nodes, id)]),
  }), [focusNode, rf, expandOrToggle, togglePin, hideIds, graph.nodes]);

  /* First-run hint */
  const showHint = !compact && !prefs.hintsDismissed && !selectedId;
  const menuNode = menu?.nodeId ? byId.get(menu.nodeId) : null;
  const menuMulti = menu?.nodeId && selectedRfIds.length > 1 && selectedRfIds.includes(menu.nodeId) ? selectedRfIds : null;
  const close = () => setMenu(null);

  return (
    <div
      ref={containerRef}
      className={`kg-canvas relative h-full w-full overflow-hidden ${isFull ? 'rounded-none' : 'rounded-xl'} ${fsFallback && !fullscreenRef ? 'kg-fs-fallback' : ''}`}
      role="application"
      aria-label={`${title}. ${visibleNodes.length} concepts. Drag nodes to move them, double-click to expand, right-click for actions.`}
    >
      {/* Edges are drawn by our own batched layer underneath React Flow (see EdgeLayer). */}
      <EdgeLayer edges={displayEdges} />
      <ReactFlow
        nodes={displayNodes}
        edges={NO_EDGES}
        nodeTypes={nodeTypes}
        nodeOrigin={NODE_ORIGIN}
        onNodesChange={onNodesChange}
        onNodeClick={(_e, n) => { setMenu(null); onSelect?.(n.id); }}
        onNodeDoubleClick={(_e, n) => { onSelect?.(n.id); expandOrToggle(n.id); }}
        onNodeContextMenu={compact ? undefined : (e, n) => openMenu(e, n.id)}
        onPaneContextMenu={compact ? undefined : (e) => openMenu(e, null)}
        onNodeMouseEnter={(_e, n) => setHoverId(n.id)}
        onNodeMouseLeave={() => setHoverId(null)}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => { setMenu(null); setShowTuning(false); onSelect?.(null); }}
        onMoveStart={(e) => { if (e) { userMovedRef.current = true; setMenu(null); } }}
        nodesConnectable={false}
        edgesFocusable={false}
        zoomOnDoubleClick={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
        deleteKeyCode={null}
        minZoom={0.12}
        maxZoom={2.5}
        preventScrolling={!compact}
        zoomOnScroll={!compact}
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="color-mix(in srgb, var(--accent) 22%, transparent)" />
        {!compact && prefs.minimap && (
          <MiniMap className="!hidden md:!block" pannable zoomable position="bottom-right" nodeBorderRadius={6} ariaLabel="Graph overview map" />
        )}
      </ReactFlow>

      {/* ── Top bar: search + physics ── */}
      {!compact && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
          <div className="surface-sm pointer-events-auto flex items-center gap-1 p-1">
            <div className="relative">
              <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); }
                  if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); }
                }}
                placeholder="Find concept…"
                aria-label="Find a concept in the graph"
                className="input !h-9 w-[min(220px,42vw)] !pl-9 !pr-8 !text-[13px]"
              />
              {!query && <span className="kbd pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</span>}
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-3 hover:text-fg"><X size={13} /></button>
              )}
            </div>
            {query && (
              <div className="flex items-center gap-0.5 pl-1 pr-1">
                <span className="min-w-[42px] text-center text-[12px] tabular-nums text-fg-2" aria-live="polite">
                  {matches.length ? `${matchIdx + 1}/${matches.length}` : '0'}
                </span>
                <ToolButton label="Previous match" shortcut="Shift+Enter" onClick={() => gotoMatch(-1)} disabled={!matches.length}><CaretUp size={14} /></ToolButton>
                <ToolButton label="Next match" shortcut="Enter" onClick={() => gotoMatch(1)} disabled={!matches.length}><CaretDown size={14} /></ToolButton>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex items-start gap-2">
            {hidden.size > 0 && (
              <button type="button" className="chip !h-[38px] !rounded-[10px]" onClick={() => showIds()} title="Show all hidden concepts">
                <Eye size={14} /> {hidden.size} hidden
              </button>
            )}
            <div className="surface-sm relative flex items-center gap-2 p-1 pl-3">
              <Atom size={16} className={physics ? 'text-accent' : 'text-fg-3'} />
              <span className="hidden text-[12.5px] font-medium text-fg-2 sm:inline">Physics</span>
              <button type="button" role="switch" aria-checked={physics} aria-label="Toggle physics simulation (G)" title="Physics (G)" className="switch" onClick={() => setPhysics(!physics)} />
              <ToolButton label="Physics strength" onClick={() => setShowTuning((v) => !v)} active={showTuning}><SlidersHorizontal size={15} /></ToolButton>
              <AnimatePresence>
                {showTuning && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16 }}
                    className="surface absolute right-0 top-[calc(100%+8px)] w-64 p-4"
                  >
                    <label htmlFor="kg-strength" className="flex items-center justify-between text-[12.5px] font-medium text-fg">
                      Simulation strength <span className="tabular-nums text-fg-2">{strength.toFixed(1)}×</span>
                    </label>
                    <input id="kg-strength" type="range" min="0.3" max="2" step="0.1" value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="range mt-3 w-full" />
                    <div className="mt-1 flex justify-between text-[11px] text-fg-3"><span>Calm</span><span>Energetic</span></div>
                    <p className="mt-3 text-[12px] leading-relaxed text-fg-2">Higher values push concepts further apart and pull links tighter.{!physics && ' Turn physics on to apply.'}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation controls ── */}
      <div className={`surface-sm absolute bottom-3 left-3 z-10 flex ${compact ? 'flex-row' : 'flex-col'} gap-0.5 p-1`}>
        <ToolButton label="Zoom in" onClick={() => rf.zoomIn({ duration: 200 })}><Plus size={15} /></ToolButton>
        <ToolButton label="Zoom out" onClick={() => rf.zoomOut({ duration: 200 })}><Minus size={15} /></ToolButton>
        <ToolButton label="Fit to view" shortcut="F" onClick={() => rf.fitView({ padding: 0.16, duration: 500 })}><FrameCorners size={15} /></ToolButton>
        {!compact && (
          <>
            <span className="mx-auto my-0.5 h-px w-5 bg-line-strong" aria-hidden="true" />
            <ToolButton label="Reset layout" onClick={resetLayout}><ArrowsCounterClockwise size={15} /></ToolButton>
            <ToolButton label={isFull ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
              {isFull ? <CornersIn size={15} /> : <CornersOut size={15} />}
            </ToolButton>
          </>
        )}
      </div>

      {/* ── First-run hint ── */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className={`surface-sm absolute bottom-3 left-[68px] z-10 hidden items-center gap-3 py-2 pl-3 pr-1.5 md:flex ${prefs.minimap ? 'max-w-[calc(100%-300px)]' : 'max-w-[calc(100%-84px)]'}`}
          >
            <Lightbulb size={16} weight="fill" className="shrink-0 text-accent-2" />
            <p className="text-[12.5px] leading-snug text-fg-2">
              <span className="text-fg">Drag</span> nodes · <span className="text-fg">double-click</span> to expand · <span className="text-fg">right-click</span> for more · <span className="text-fg">Shift-drag</span> to multi-select
            </p>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Dismiss tips" onClick={() => setPref('hintsDismissed', true)}><X size={13} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Context menu ── */}
      <AnimatePresence>
        {menu && (
          <motion.div
            role="menu"
            aria-label={menuNode ? `Actions for ${menuNode.label}` : 'Graph actions'}
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ left: menu.x, top: menu.y, transformOrigin: 'top left' }}
            className="surface absolute z-30 w-[228px] p-1.5"
            onContextMenu={(e) => e.preventDefault()}
          >
            {menuNode && !menuMulti && (() => {
              const desc = descendantsOf(graph.nodes, menuNode.id);
              const expanded = menuNode.metadata?.expanded && desc.length > 0;
              const anyHidden = desc.some((d) => hidden.has(d));
              return (
                <>
                  <p className="truncate px-2.5 pb-1.5 pt-1 text-[11.5px] font-medium text-fg-3">{menuNode.label}</p>
                  <MenuItem icon={Info} label="Inspect" onClick={() => { onAction?.('inspect', menuNode.id); close(); }} />
                  {!expanded && <MenuItem icon={ArrowsOutSimple} label="Expand" hint="E" onClick={() => { expandOrToggle(menuNode.id, 'expand'); close(); }} />}
                  {expanded && anyHidden && <MenuItem icon={ArrowsOutSimple} label="Show branch" onClick={() => { showIds(desc); close(); }} />}
                  {expanded && !anyHidden && <MenuItem icon={ArrowsInSimple} label="Collapse branch" onClick={() => { hideIds(desc); close(); }} />}
                  {expanded && <MenuItem icon={Plus} label="Find more related" onClick={() => { onExpand?.(menuNode.id); close(); }} />}
                  <MenuItem icon={Crosshair} label="Focus" onClick={() => { focusNode(menuNode.id); close(); }} />
                  <MenuItem icon={pinned.has(menuNode.id) ? PushPinSlash : PushPin} label={pinned.has(menuNode.id) ? 'Unpin' : 'Pin in place'} hint="P" onClick={() => { togglePin(menuNode.id); close(); }} />
                  {menuNode.metadata?.url && (
                    <MenuItem icon={ArrowSquareOut} label="Open on Wikipedia" onClick={() => { window.open(menuNode.metadata.url, '_blank', 'noopener'); close(); }} />
                  )}
                  <MenuItem icon={Copy} label="Copy name" onClick={() => { navigator.clipboard?.writeText(menuNode.label); close(); }} />
                  {menuNode.id !== 'root' && (
                    <>
                      <div className="my-1 h-px bg-line-strong" />
                      <MenuItem icon={EyeSlash} label="Hide" hint="H" danger onClick={() => { hideIds([menuNode.id, ...desc]); close(); }} />
                    </>
                  )}
                </>
              );
            })()}
            {menuMulti && (
              <>
                <p className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-medium text-fg-3">{menuMulti.length} concepts selected</p>
                <MenuItem icon={PushPin} label="Pin all" onClick={() => { togglePin(menuMulti, true); close(); }} />
                <MenuItem icon={PushPinSlash} label="Unpin all" onClick={() => { togglePin(menuMulti, false); close(); }} />
                <MenuItem icon={EyeSlash} label="Hide all" danger onClick={() => { hideIds(menuMulti); close(); }} />
              </>
            )}
            {!menu.nodeId && (
              <>
                <MenuItem icon={FrameCorners} label="Fit to view" hint="F" onClick={() => { rf.fitView({ padding: 0.16, duration: 500 }); close(); }} />
                <MenuItem icon={Atom} label={physics ? 'Turn physics off' : 'Turn physics on'} hint="G" onClick={() => { setPhysics(!physics); close(); }} />
                {pinned.size > 0 && <MenuItem icon={PushPinSlash} label={`Release ${pinned.size} pinned`} onClick={() => { togglePin([...pinned], false); close(); }} />}
                {hidden.size > 0 && <MenuItem icon={Eye} label={`Show ${hidden.size} hidden`} onClick={() => { showIds(); close(); }} />}
                <MenuItem icon={ArrowsCounterClockwise} label="Reset layout" onClick={() => { resetLayout(); close(); }} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * KnowledgeGraph — modular, self-contained interactive graph.
 *
 * Props
 *  graph        {nodes, edges}            data (see graph/model.js)
 *  graphKey     string                    identity; changing it resets layout state
 *  layout       {positions,pinned,hidden,physics,strength}  initial layout for this key
 *  onLayoutChange(layout)                 called when the user changes the arrangement
 *  selectedId / onSelect(id|null)         selection (drives the inspector)
 *  onExpand(id)                           fetch + merge new concepts for a node
 *  onAction(type, id)                     'inspect' | 'path'
 *  expandingIds Set                       nodes currently loading
 *  compact      boolean                   preview mode (landing / dashboard)
 *
 * Ref API: focusNode(id), fit(), expandOrToggle(id, intent), togglePin(id),
 *          isPinned(id), isHidden(id), hideBranch(id)
 */
const KnowledgeGraph = forwardRef(function KnowledgeGraph(props, ref) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});

export default KnowledgeGraph;
