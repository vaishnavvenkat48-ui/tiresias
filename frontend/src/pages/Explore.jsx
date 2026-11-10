import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MagnifyingGlass, ArrowRight, CheckCircle, CloudWarning, CircleNotch, Graph as GraphIcon, ClockCounterClockwise,
  BookmarkSimple, ShareNetwork, ArrowsClockwise, ListBullets, CursorClick, X, Sparkle,
} from '@phosphor-icons/react';
import KnowledgeGraph from '../graph/KnowledgeGraph';
import NodeInspector from '../graph/NodeInspector';
import ShareDialog from '../components/ShareDialog';
import { Spinner, ErrorBanner, CategoryDot } from '../components/UI';
import { fromPersisted, normalizeNode, normalizeEdge, emptyLayout } from '../graph/model';
import { graphsApi, activityApi } from '../services/dataService';
import { errorMessage, API_BASE } from '../services/api';
import { usePrefs } from '../context/PrefsContext';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';

const SUGGESTIONS = ['Quantum mechanics', 'Machine learning', 'Roman Empire', 'Stoicism', 'Norse mythology', 'Behavioral economics', 'Consciousness', 'Black hole'];

const useIsMobile = () => {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
};

const SyncStatus = ({ state, onRetry }) => {
  const map = {
    saving: [CircleNotch, 'Saving layout…', 'animate-spin text-fg-2'],
    dirty: [CircleNotch, 'Unsaved layout', 'text-fg-3'],
    saved: [CheckCircle, 'Layout saved', 'text-success'],
    error: [CloudWarning, 'Sync failed', 'text-danger'],
  };
  const [Icon, label, cls] = map[state] || map.saved;
  return (
    <span className="hidden items-center gap-1.5 text-[12.5px] text-fg-2 xl:flex" aria-live="polite">
      <Icon size={15} weight={state === 'saved' ? 'fill' : 'regular'} className={cls} /> {label}
      {state === 'error' && <button type="button" className="btn btn-sm ml-1" onClick={onRetry}>Retry</button>}
    </span>
  );
};

/** Real pipeline progress streamed from the server while the graph is built. */
const LoadingCanvas = ({ topic, stages }) => (
  <div className="kg-canvas grid h-full place-items-center rounded-xl" role="status" aria-live="polite">
    <div className="flex flex-col items-center gap-6 px-6 text-center">
      <div className="relative h-24 w-40" aria-hidden="true">
        {[[50, 50, 16], [14, 22, 8], [86, 20, 9], [10, 78, 7], [88, 80, 8], [50, 6, 6], [50, 95, 6]].map(([x, y, r], i) => (
          <motion.span key={i} className="absolute rounded-full bg-accent"
            style={{ left: `${x}%`, top: `${y}%`, width: r, height: r, marginLeft: -r / 2, marginTop: -r / 2, boxShadow: '0 0 14px var(--accent)' }}
            animate={{ opacity: [0.25, 1, 0.25], scale: [0.85, 1.05, 0.85] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
      <div className="w-[min(420px,84vw)]">
        <p className="text-[15px] font-medium text-fg">Mapping “{topic}”</p>
        <ol className="mt-4 space-y-1.5 text-left">
          {stages.map((s, i) => (
            <motion.li key={`${s.stage}-${i}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={`flex items-start gap-2 text-[12.5px] ${i === stages.length - 1 ? 'text-fg' : 'text-fg-3'}`}>
              {i === stages.length - 1 ? <Spinner size={13} className="mt-0.5 shrink-0 text-accent" /> : <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-success" />}
              {s.message}
            </motion.li>
          ))}
          {!stages.length && <li className="flex items-center gap-2 text-[12.5px] text-fg-2"><Spinner size={13} className="text-accent" /> Connecting…</li>}
        </ol>
      </div>
    </div>
  </div>
);

/** Plain-language legend for the line styles. */
const Legend = () => (
  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
    <span className="flex items-center gap-1.5" title="A Wikidata statement directly connects the two concepts"><svg width="22" height="6" aria-hidden="true"><line x1="1" y1="3" x2="21" y2="3" stroke="var(--accent)" strokeWidth="2" /></svg> Verified (Wikidata)</span>
    <span className="flex items-center gap-1.5" title="Wikipedia's search lists the articles as similar — a hint, not a stated fact"><svg width="22" height="6" aria-hidden="true"><line x1="1" y1="3" x2="21" y2="3" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 4" /></svg> Related by search</span>
    <span className="flex items-center gap-1.5" title="Proposed by Gemini — not checked against a source"><svg width="22" height="6" aria-hidden="true"><line x1="1" y1="3" x2="21" y2="3" stroke="var(--accent-2)" strokeWidth="2" strokeDasharray="1.5 4" strokeLinecap="round" /></svg> AI's suggestion</span>
  </span>
);

/** Accessible alternative to the canvas: the graph as a nested list. */
const Outline = ({ graph, selectedId, onSelect }) => {
  const kids = useMemo(() => {
    const m = new Map();
    for (const n of graph.nodes) {
      const p = n.metadata?.parent || null;
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(n);
    }
    return m;
  }, [graph.nodes]);
  const render = (parent, depth = 0) => {
    const list = kids.get(parent) || [];
    if (!list.length) return null;
    return (
      <ul className={depth ? 'ml-4 border-l border-line-strong pl-3' : ''}>
        {list.map((n) => (
          <li key={n.id} className="py-0.5">
            <button type="button" onClick={() => onSelect(n.id)} aria-current={selectedId === n.id ? 'true' : undefined}
              className={`flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13.5px] hover:bg-hover ${selectedId === n.id ? 'bg-hover text-fg' : 'text-fg'} ${n.depth === 0 ? 'font-semibold' : ''}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.depth === 0 ? 'bg-accent' : n.depth === 1 ? 'bg-accent-2' : 'bg-fg-3'}`} />
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              {n.provenance === 'ai_suggested' && <span className="shrink-0 text-[11px] text-fg-3">AI</span>}
            </button>
            {render(n.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <nav aria-label={`${graph.title} — concepts as a list`} className="kg-canvas h-full overflow-y-auto rounded-xl p-4">
      <p className="mb-3 text-[12.5px] text-fg-2">{graph.nodes.length} concepts. Select one to see its details.</p>
      {render(null)}
    </nav>
  );
};

/* ───────────────────────── Page ───────────────────────── */

const Explore = () => {
  const [params, setParams] = useSearchParams();
  const topicParam = params.get('topic');
  const graphParam = params.get('graph');
  const focusParam = params.get('focus');

  const { prefs, setPref } = usePrefs();
  const { toast } = useToast();
  const { analytics, refresh: refreshStats } = useUser();
  const isMobile = useIsMobile();

  const [input, setInput] = useState(topicParam || '');
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [stages, setStages] = useState([]);
  const [enriching, setEnriching] = useState(null); // null | message
  const [error, setError] = useState('');
  const [graph, setGraph] = useState(null);
  const [initialLayout, setInitialLayout] = useState(null);
  const [syncState, setSyncState] = useState('saved');
  const [selectedId, setSelectedId] = useState(null);
  const workspaceRef = useRef(null); // graph + inspector go fullscreen together
  const [expanding, setExpanding] = useState(() => new Set());
  const [layoutView, setLayoutView] = useState({ pinned: [], hidden: [] });
  const [outline, setOutline] = useState(false);
  const [sharing, setSharing] = useState(null);

  const graphRef = useRef(null);
  const latest = useRef({ graph: null, layout: null });
  const skipLoad = useRef(null);
  const saveTimer = useRef(null);
  const abortRef = useRef(null);
  const freshNext = useRef(false);
  const gotGraph = useRef(false);

  latest.current.graph = graph;

  /** Put a server graph document on the canvas. */
  const show = useCallback((doc) => {
    const g = fromPersisted(doc);
    const layout = { ...emptyLayout(prefs), ...g.layout };
    latest.current.layout = layout;
    setInitialLayout(layout);
    setLayoutView({ pinned: layout.pinned || [], hidden: layout.hidden || [] });
    setGraph({ key: `g:${g.id}`, id: g.id, title: g.title, category: doc.category, nodes: g.nodes, edges: g.edges, saved: !!doc.saved, shareId: doc.shareId || null, generation: g.generation, sources: g.sources });
    setInput(g.title);
    setSyncState('saved');
    setStatus('ready');
  }, [prefs]);

  /** Merge AI additions (or expansion results) into the graph on screen. */
  const mergeAdditions = useCallback((res, { expandedId } = {}) => {
    const cur = latest.current.graph;
    if (!cur) return { added: [], links: 0 };
    const parents = new Set([...(res.parentsExpanded || []), ...(expandedId ? [expandedId] : [])]);
    const nodes = cur.nodes.map((n) => (parents.has(n.id) ? { ...n, metadata: { ...n.metadata, expanded: true } } : n));
    const ids = new Set(nodes.map((n) => n.id));
    const added = (res.nodes || []).map(normalizeNode).filter((n) => !ids.has(n.id));
    const edgeIds = new Set(cur.edges.map((e) => e.id));
    const updates = new Map((res.updates || []).map((u) => [u.id, u]));
    const edges = cur.edges.map((e) => (updates.has(e.id) ? { ...e, ...updates.get(e.id) } : e));
    const newEdges = (res.edges || []).map(normalizeEdge).filter((e) => !edgeIds.has(e.id));
    const next = { ...cur, nodes: [...nodes, ...added], edges: [...edges, ...newEdges] };
    latest.current.graph = next;
    setGraph(next);
    return { added, links: newEdges.filter((e) => e.type === 'related').length, edges: newEdges.length };
  }, []);

  const loadSaved = useCallback(async (id) => {
    abortRef.current?.abort();
    setStatus('loading'); setStages([{ stage: 'open', message: 'Opening your graph' }]); setError(''); setSelectedId(null); setEnriching(null);
    try {
      show(await graphsApi.get(id));
    } catch (e) {
      setError(errorMessage(e, 'Could not open this graph.'));
      setStatus('error');
    }
  }, [show]);

  const loadTopic = useCallback(async (topic, { fresh = false } = {}) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    gotGraph.current = false;
    setStatus('loading'); setStages([]); setError(''); setSelectedId(null); setEnriching(null);
    try {
      await graphsApi.generateStream(topic, {
        fresh,
        signal: ctrl.signal,
        onEvent: (event, data) => {
          if (ctrl.signal.aborted) return;
          if (event === 'stage') {
            if (gotGraph.current) setEnriching(data.message);
            else setStages((s) => [...s, data]);
          } else if (event === 'graph') {
            skipLoad.current = data.graph._id;
            setParams({ graph: data.graph._id }, { replace: true });
            show(data.graph);
            gotGraph.current = true; // further stages are AI enrichment
            if (data.reused) toast(`Opened your existing graph “${data.graph.title}”.`, { type: 'info', action: { label: 'Regenerate', onClick: () => { freshNext.current = true; setParams({ topic: data.graph.title }); } } });
            if (data.graph.enrichment === 'pending') setEnriching('Gemini is reviewing the graph…');
          } else if (event === 'enrich') {
            if (data.failed || data.skipped) return;
            const r = mergeAdditions(data);
            if (r.added.length || r.edges) toast(`AI added ${r.added.length} concept${r.added.length === 1 ? '' : 's'} and ${r.edges} link${r.edges === 1 ? '' : 's'} — shown with dotted lines.`, { type: 'success' });
          } else if (event === 'done') {
            setEnriching(null);
            if (data?.generation?.note) toast(data.generation.note, { type: 'info' });
          }
        },
      });
      refreshStats();
    } catch (e) {
      if (e.name === 'AbortError' || ctrl.signal.aborted) return;
      setEnriching(null);
      if (gotGraph.current) { toast(errorMessage(e, 'AI enrichment was interrupted.'), { type: 'info' }); return; }
      setError(errorMessage(e, 'Could not build a graph for this topic.'));
      setStatus('error');
    }
  }, [setParams, show, toast, refreshStats, mergeAdditions]);

  useEffect(() => {
    if (graphParam) {
      if (skipLoad.current === graphParam) { skipLoad.current = null; return; }
      loadSaved(graphParam);
    } else if (topicParam) {
      setInput(topicParam);
      loadTopic(topicParam, { fresh: freshNext.current });
      freshNext.current = false;
    } else {
      abortRef.current?.abort();
      setGraph(null); setStatus('idle'); setEnriching(null);
    }
  }, [graphParam, topicParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => abortRef.current?.abort(), []);

  /* Never lose a debounced layout save: flush it on route change and on page hide/unload. */
  useEffect(() => {
    const flush = (keepalive) => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const g = latest.current.graph;
      if (!g?.id || !latest.current.layout) return;
      if (keepalive) {
        fetch(`${API_BASE}/graphs/${g.id}/layout`, {
          method: 'PATCH',
          keepalive: true,
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tiresias_token')}` },
          body: JSON.stringify({ layout: latest.current.layout }),
        }).catch(() => null);
      } else {
        graphsApi.saveLayout(g.id, latest.current.layout).catch(() => null);
      }
    };
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); flush(false); };
  }, []);

  /* Deep-link focus (?focus=Label) once the graph is up */
  useEffect(() => {
    if (status !== 'ready' || !focusParam || !graph) return;
    const n = graph.nodes.find((x) => x.label.toLowerCase() === focusParam.toLowerCase());
    if (n) setTimeout(() => { setSelectedId(n.id); graphRef.current?.focusNode(n.id); }, 700);
  }, [status, focusParam, graph?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Inspecting a concept: record it (analytics) and retire the first-run hint */
  useEffect(() => {
    if (!selectedId || !graph?.id) return undefined;
    if (!prefs.nodeHintSeen) setPref('nodeHintSeen', true);
    const node = graph.nodes.find((n) => n.id === selectedId);
    const t = setTimeout(() => activityApi.record('NODE_SELECTED', { graphId: graph.id, nodeId: selectedId, topic: node?.label }), 1200);
    return () => clearTimeout(t);
  }, [selectedId, graph?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Layout autosave (positions, pins, hidden, physics) ── */
  const persistLayout = useCallback(async () => {
    saveTimer.current = null;
    const g = latest.current.graph;
    if (!g?.id || !latest.current.layout) return;
    setSyncState('saving');
    try {
      await graphsApi.saveLayout(g.id, latest.current.layout);
      setSyncState('saved');
    } catch {
      setSyncState('error');
    }
  }, []);

  const onLayoutChange = useCallback((layout) => {
    latest.current.layout = layout;
    setLayoutView({ pinned: layout.pinned, hidden: layout.hidden });
    setSyncState((s) => (s === 'saving' ? s : 'dirty'));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistLayout, 1200);
  }, [persistLayout]);

  /* ── Explicit save to the library ── */
  const toggleSaved = async () => {
    const g = latest.current.graph;
    if (!g?.id) return;
    const next = !g.saved;
    setGraph((cur) => ({ ...cur, saved: next }));
    try {
      await graphsApi.save(g.id, next);
      toast(next ? 'Saved to your library.' : 'Removed from your library.', { type: 'success', duration: 2400 });
    } catch (e) {
      setGraph((cur) => ({ ...cur, saved: !next }));
      toast(errorMessage(e), { type: 'error' });
    }
  };

  /* ── Expansion (server-side; returns only new nodes/edges) ── */
  const expand = useCallback(async (id) => {
    const g = latest.current.graph;
    const node = g?.nodes.find((n) => n.id === id);
    if (!node || !g.id || expanding.has(id)) return;
    setExpanding((s) => new Set(s).add(id));
    try {
      const res = await graphsApi.expand(g.id, id);
      if (latest.current.graph?.key !== g.key) return;
      const r = mergeAdditions({ ...res, parentsExpanded: [id] }, { expandedId: id });
      if (!r.added.length && !r.links) toast(`No new concepts found around “${node.label}”.`, { type: 'info' });
      else if (r.links && !r.added.length) toast(`Found ${r.links} connection${r.links > 1 ? 's' : ''} to concepts already in your graph.`, { type: 'success' });
      refreshStats();
    } catch (e) {
      toast(errorMessage(e, 'Could not expand this concept.'), { type: 'error' });
    } finally {
      setExpanding((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [expanding, toast, refreshStats, mergeAdditions]);

  /* ── Search ── */
  const submit = (e) => {
    e?.preventDefault();
    const t = input.trim();
    if (!t) return;
    if (t === topicParam && !graphParam) loadTopic(t);
    else setParams({ topic: t });
  };
  const pick = (t) => { setInput(t); setParams({ topic: t }); };
  const regenerate = () => {
    if (!graph) return;
    freshNext.current = true;
    setParams({ topic: graph.title });
  };

  const selected = useMemo(() => graph?.nodes?.find((n) => n.id === selectedId) || null, [graph, selectedId]);
  const hiddenSet = useMemo(() => new Set(layoutView.hidden), [layoutView.hidden]);
  const navigateTo = useCallback((id, select = false) => {
    if (select) setSelectedId(id);
    if (outline) return;
    if (hiddenSet.has(id)) { toast('That concept is hidden — use “Show hidden” in the graph to reveal it.', { type: 'info' }); return; }
    graphRef.current?.focusNode(id);
  }, [hiddenSet, toast, outline]);

  const ready = status === 'ready' && graph?.nodes;
  const recentTopics = (analytics?.recentTopics || []).slice(0, 6).map((t) => t.name);
  const showNodeHint = ready && !prefs.nodeHintSeen && !selectedId && !outline;

  /* ───────── Render ───────── */
  return (
    <div className="flex h-full flex-col gap-2 sm:gap-3">
      {/* Toolbar */}
      <div className="surface-sm flex flex-wrap items-center gap-2 p-2 sm:gap-3">
        <form onSubmit={submit} className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto" role="search">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
            <label htmlFor="explore-topic" className="sr-only">Topic to explore</label>
            <input id="explore-topic" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Explore any topic…" autoComplete="off" spellCheck={false} className="input !h-10 !pl-10" />
          </div>
          <button type="submit" className="btn btn-primary btn-sm !h-10" disabled={!input.trim() || status === 'loading'}>
            {status === 'loading' ? <Spinner size={15} /> : <ArrowRight size={15} weight="bold" />}
            <span className="hidden sm:inline">Explore</span>
          </button>
        </form>

        {ready && (
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="hidden truncate font-medium text-fg md:inline md:max-w-[220px]" title={graph.title}>{graph.title}</span>
            <span className="badge tabular-nums" title={`${graph.nodes.length} concepts · ${graph.edges.length} links`}><GraphIcon size={12} /> {graph.nodes.length} · {graph.edges.length}</span>
            {graph.category && <span className="badge hidden lg:inline-flex"><CategoryDot size={7} /> {graph.category}</span>}
            {enriching && <span className="badge badge-accent max-w-[260px] truncate" title={enriching}><Sparkle size={12} className="animate-pulse" /> {enriching}</span>}
          </div>
        )}

        {ready && (
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus state={syncState} onRetry={persistLayout} />
            <button type="button" className="btn btn-sm btn-icon" aria-pressed={outline} aria-label={outline ? 'Show graph' : 'Show as a list'} title={outline ? 'Graph view' : 'List view (screen-reader friendly)'} onClick={() => setOutline((v) => !v)}>
              {outline ? <GraphIcon size={16} /> : <ListBullets size={16} />}
            </button>
            <button type="button" className="btn btn-sm btn-icon" aria-label="Share" title="Share a read-only link" onClick={() => setSharing({ _id: graph.id, title: graph.title, shareId: graph.shareId })}><ShareNetwork size={16} /></button>
            <button type="button" className={`btn btn-sm ${graph.saved ? '' : 'btn-primary'}`} aria-pressed={graph.saved} onClick={toggleSaved}>
              <BookmarkSimple size={15} weight={graph.saved ? 'fill' : 'regular'} /> {graph.saved ? 'Saved' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Workspace */}
      <div ref={workspaceRef} className="kg-workspace relative flex min-h-0 flex-1 gap-3">
        <div className="relative min-h-0 min-w-0 flex-1">
          {ready && !outline && (
            <KnowledgeGraph
              ref={graphRef}
              graph={graph}
              graphKey={graph.key}
              layout={initialLayout}
              onLayoutChange={onLayoutChange}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onExpand={expand}
              expandingIds={expanding}
              onAction={(type, id) => { if (type === 'inspect') setSelectedId(id); }}
              title={`${graph.title} knowledge graph`}
              fullscreenRef={workspaceRef}
            />
          )}
          {ready && outline && <Outline graph={graph} selectedId={selectedId} onSelect={setSelectedId} />}

          <AnimatePresence>
            {showNodeHint && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ delay: 1.2 }}
                className="surface-sm absolute left-1/2 top-16 z-20 flex w-[min(440px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 p-3" role="note">
                <span className="well-sm grid h-9 w-9 shrink-0 place-items-center text-accent"><CursorClick size={18} /></span>
                <p className="flex-1 text-[13px] text-fg">Click any concept to see its picture, key facts, videos and papers. Double-click to expand it.</p>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Dismiss" onClick={() => setPref('nodeHintSeen', true)}><X size={14} /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {status === 'loading' && <LoadingCanvas topic={topicParam || input} stages={stages} />}

          {status === 'error' && (
            <div className="kg-canvas grid h-full place-items-center rounded-xl p-6">
              <div className="w-full max-w-md"><ErrorBanner message={error} onRetry={() => (graphParam ? loadSaved(graphParam) : topicParam && loadTopic(topicParam))} /></div>
            </div>
          )}

          {status === 'idle' && (
            <div className="kg-canvas flex h-full items-center justify-center overflow-y-auto rounded-xl p-5">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl py-8 text-center">
                <p className="eyebrow">Explore</p>
                <h1 className="h-page mt-2">What do you want to understand?</h1>
                <p className="mx-auto mt-3 max-w-md text-[14px] text-fg-2">Type any topic and get a map of everything related to it, with sources. Solid links come from Wikidata; you'll always see which links are only hints or the AI's suggestions.</p>
                <form onSubmit={submit} className="mt-6 flex gap-2">
                  <label htmlFor="explore-hero" className="sr-only">Topic</label>
                  <input id="explore-hero" autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Black holes, Byzantine Empire, Stoicism" className="input input-lg" />
                  <button type="submit" className="btn btn-primary btn-lg" disabled={!input.trim()}>Explore</button>
                </form>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => pick(s)}>{s}</button>)}
                </div>
                {recentTopics.length > 0 && (
                  <div className="mt-8">
                    <p className="mb-2 flex items-center justify-center gap-1.5 text-[12.5px] text-fg-3"><ClockCounterClockwise size={13} /> Recently explored</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {recentTopics.map((t) => <button key={t} type="button" className="chip" onClick={() => pick(t)}>{t}</button>)}
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </div>

        {/* Inspector: docked column (xl) · overlay panel (md–lg) · bottom sheet (mobile) */}
        <AnimatePresence>
          {selected && ready && (
            <motion.aside
              key="inspector"
              aria-label={`Details for ${selected.label}`}
              initial={isMobile ? { y: '100%' } : { opacity: 0, x: 24 }}
              animate={isMobile ? { y: 0 } : { opacity: 1, x: 0 }}
              exit={isMobile ? { y: '100%' } : { opacity: 0, x: 24 }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              drag={isMobile ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_e, info) => { if (info.offset.y > 120) setSelectedId(null); }}
              className="surface fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 flex max-h-[62dvh] flex-col overflow-hidden rounded-b-none shadow-raise-4 md:absolute md:bottom-3 md:left-auto md:right-3 md:top-3 md:z-20 md:max-h-none md:w-[370px] md:rounded-b-[var(--r-lg)] md:pb-0 xl:static xl:z-auto xl:w-[390px] xl:shrink-0 xl:shadow-raise-3"
            >
              {isMobile && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-fg/15" aria-hidden="true" />}
              <div className="flex min-h-0 flex-1 flex-col">
                <NodeInspector
                  node={selected}
                  graph={graph}
                  onClose={() => setSelectedId(null)}
                  onNavigate={navigateTo}
                  onExpandToggle={(id) => (outline ? expand(id) : graphRef.current?.expandOrToggle(id))}
                  onTogglePin={(id) => graphRef.current?.togglePin(id)}
                  pinned={layoutView.pinned.includes(selected.id)}
                  expanding={expanding.has(selected.id)}
                  hiddenSet={hiddenSet}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {ready && (
        <div className="hidden items-center justify-between gap-4 px-1 text-[12px] text-fg-3 lg:flex">
          <span className="flex items-center gap-4">
            <Legend />
            <button type="button" className="flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-fg-2" onClick={regenerate}><ArrowsClockwise size={12} /> Regenerate</button>
          </span>
          <span className="flex items-center gap-3">
            <span><span className="kbd">/</span> find</span>
            <span><span className="kbd">F</span> fit</span>
            <span><span className="kbd">E</span> expand</span>
            <span><span className="kbd">P</span> pin</span>
            <Link to="/graphs" className="hover:text-fg-2">Library →</Link>
          </span>
        </div>
      )}

      <ShareDialog
        graph={sharing}
        onClose={() => setSharing(null)}
        onChange={(shareId) => setGraph((cur) => ({ ...cur, shareId, saved: shareId ? true : cur.saved }))}
      />
    </div>
  );
};

export default Explore;
