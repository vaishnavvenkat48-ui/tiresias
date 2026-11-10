import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, MagnifyingGlass, X, ArrowSquareOut, LockSimple, ListBullets, Graph as GraphIcon } from '@phosphor-icons/react';
import KnowledgeGraph from '../graph/KnowledgeGraph';
import { TextCredit, Attribution } from '../graph/NodeInspector';
import { fromPersisted } from '../graph/model';
import { Spinner, ErrorBanner, Skeleton } from '../components/UI';
import { publicApi } from '../services/dataService';
import { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const IDEAS = ['Black hole', 'Stoicism', 'Roman Empire', 'Photosynthesis', 'Machine learning', 'Renaissance'];

/** Read-only details for a concept, from public sources only (no AI). */
const PublicInspector = ({ node, rootTitle, onClose }) => {
  const [card, setCard] = useState(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let live = true;
    setState('loading'); setCard(null);
    publicApi.topic(node.label, { context: node.depth > 0 ? rootTitle : undefined, wikidataId: node.metadata?.wikidataId || undefined })
      .then((c) => { if (live) { setCard(c); setState('ready'); } })
      .catch(() => live && setState('error'));
    return () => { live = false; };
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = card?.summary || node.description;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-snug text-fg">{node.label}</h2>
          {card?.description && <p className="mt-0.5 text-[12.5px] text-fg-2">{card.description}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Close details" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {state === 'loading' && <><Skeleton className="h-40 w-full rounded-lg" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></>}
        {card?.image && (
          <figure className="frame overflow-hidden rounded-lg">
            <img src={card.image.thumbnail} alt={card.image.description || card.image.title || node.label} className="max-h-56 w-full object-cover" loading="lazy" />
            <figcaption className="px-2 pb-1.5"><Attribution img={card.image} /></figcaption>
          </figure>
        )}
        {text && state !== 'loading' && (
          <div>
            <p className="text-[13.5px] leading-relaxed text-fg">{text}</p>
            <TextCredit source={card?.summary ? 'wikipedia' : node.metadata?.source} url={card?.wikipediaUrl || node.metadata?.url} />
          </div>
        )}
        {card?.facts?.length > 0 && (
          <dl className="well-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-3 text-[12.5px]">
            {card.facts.slice(0, 8).map((f) => (
              <div key={f.label} className="contents"><dt className="text-fg-3">{f.label}</dt><dd className="text-fg">{(f.values || [f.value]).join(', ')}</dd></div>
            ))}
          </dl>
        )}
        {state === 'error' && <p className="text-[13px] text-fg-2">Couldn't load details for this concept right now.</p>}
        {card?.sources?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {card.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="chip">{s.provider} <ArrowSquareOut size={12} /></a>
            ))}
          </div>
        )}
        <div className="surface-sm p-3 text-[12.5px] text-fg-2">
          <p className="flex items-center gap-1.5 font-medium text-fg"><LockSimple size={13} /> With a free account</p>
          <p className="mt-1">Videos, research papers, expanding concepts, AI explanations — and saving your map.</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Public graph viewer.
 *  mode="try"    — anonymous trial: /try?topic=… (sources only, a few per day per IP)
 *  mode="shared" — read-only shared link: /g/:shareId
 */
const TryGraph = ({ mode }) => {
  const { shareId } = useParams();
  const [params, setParams] = useSearchParams();
  const topic = params.get('topic');
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [input, setInput] = useState(topic || '');
  const [state, setState] = useState('idle'); // idle | loading | ready | error | limit
  const [error, setError] = useState('');
  const [doc, setDoc] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [outline, setOutline] = useState(false);

  const load = useCallback(async () => {
    setSelectedId(null); setError('');
    if (mode === 'shared') {
      setState('loading');
      try { setDoc(await publicApi.shared(shareId)); setState('ready'); } catch (e) { setError(errorMessage(e, 'This link is no longer available.')); setState('error'); }
      return;
    }
    if (!topic) { setState('idle'); setDoc(null); return; }
    setState('loading');
    try {
      const r = await publicApi.tryTopic(topic);
      setDoc(r.graph); setRemaining(r.remaining); setState('ready');
    } catch (e) {
      if (e.response?.status === 429 && e.response?.data?.code === 'TRY_LIMIT') { setError(e.response.data.message); setState('limit'); return; }
      setError(errorMessage(e, 'Could not build a graph for this topic.')); setState('error');
    }
  }, [mode, shareId, topic]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (topic) setInput(topic); }, [topic]);

  const graph = useMemo(() => {
    if (!doc) return null;
    const g = fromPersisted({ ...doc, _id: doc.shareId || `try:${doc.title}` });
    return { ...g, key: `pub:${g.id}` };
  }, [doc]);
  const layout = useMemo(() => (graph ? { positions: {}, pinned: [], hidden: [], physics: true, strength: 1, ...(mode === 'shared' ? graph.layout : {}) } : null), [graph, mode]);
  const selected = graph?.nodes.find((n) => n.id === selectedId) || null;

  const submit = (e) => {
    e.preventDefault();
    const t = input.trim();
    if (t) setParams({ topic: t });
  };
  const onExpand = useCallback(() => toast('Expanding concepts needs a free account.', { type: 'info', action: { label: 'Sign up', onClick: () => { window.location.href = '/register'; } } }), [toast]);

  const signupCta = isAuthenticated
    ? <Link to={topic ? `/explore?topic=${encodeURIComponent(topic)}` : '/explore'} className="btn btn-primary btn-sm">Open in explorer <ArrowRight size={14} weight="bold" /></Link>
    : <Link to="/register" className="btn btn-primary btn-sm">Save it — free account <ArrowRight size={14} weight="bold" /></Link>;

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-7xl flex-col gap-3 px-4 pb-4 pt-20 sm:px-6">
      <div className="surface-sm flex flex-wrap items-center gap-2 p-2">
        {mode === 'try' ? (
          <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2" role="search">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
              <label htmlFor="try-topic" className="sr-only">Topic</label>
              <input id="try-topic" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type any topic…" className="input !h-10 !pl-10" autoComplete="off" />
            </div>
            <button type="submit" className="btn btn-primary btn-sm !h-10" disabled={!input.trim() || state === 'loading'}>{state === 'loading' ? <Spinner size={15} /> : <ArrowRight size={15} weight="bold" />}<span className="hidden sm:inline">Map it</span></button>
          </form>
        ) : (
          <div className="min-w-0 flex-1 px-2">
            <p className="truncate text-[15px] font-semibold text-fg">{doc?.title || 'Shared graph'}</p>
            {doc && <p className="text-[12px] text-fg-3">Shared by {doc.owner} · read-only</p>}
          </div>
        )}
        {graph && (
          <div className="flex items-center gap-2">
            {mode === 'try' && remaining !== null && !isAuthenticated && <span className="hidden text-[12px] text-fg-3 sm:inline">{remaining} free {remaining === 1 ? 'map' : 'maps'} left today</span>}
            <button type="button" className="btn btn-sm btn-icon" aria-pressed={outline} aria-label={outline ? 'Show graph' : 'Show as a list'} onClick={() => setOutline((v) => !v)}>{outline ? <GraphIcon size={16} /> : <ListBullets size={16} />}</button>
            {signupCta}
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 gap-3">
        <div className="relative min-h-0 min-w-0 flex-1">
          {state === 'ready' && graph && !outline && (
            <KnowledgeGraph graph={graph} graphKey={graph.key} layout={layout} selectedId={selectedId} onSelect={setSelectedId} onExpand={onExpand} title={`${graph.title} knowledge graph`} />
          )}
          {state === 'ready' && graph && outline && (
            <nav aria-label={`${graph.title} concepts`} className="kg-canvas h-full overflow-y-auto rounded-xl p-4">
              <ul className="space-y-0.5">
                {graph.nodes.map((n) => (
                  <li key={n.id} style={{ paddingLeft: n.depth * 16 }}>
                    <button type="button" className={`w-full rounded-[8px] px-2 py-1.5 text-left text-[13.5px] text-fg hover:bg-hover ${n.depth === 0 ? 'font-semibold' : ''}`} onClick={() => setSelectedId(n.id)}>{n.label}</button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {state === 'loading' && (
            <div className="kg-canvas grid h-full place-items-center rounded-xl" role="status">
              <p className="flex items-center gap-2 text-[14px] text-fg-2"><Spinner className="text-accent" /> Reading Wikipedia and Wikidata…</p>
            </div>
          )}
          {state === 'error' && <div className="kg-canvas grid h-full place-items-center rounded-xl p-6"><div className="w-full max-w-md"><ErrorBanner message={error} onRetry={load} /></div></div>}
          {state === 'limit' && (
            <div className="kg-canvas grid h-full place-items-center rounded-xl p-6 text-center">
              <div className="max-w-md">
                <h2 className="h-section">That's today's free maps</h2>
                <p className="mt-2 text-[14px] text-fg-2">{error}</p>
                <Link to="/register" className="btn btn-primary mt-5">Create a free account <ArrowRight size={15} weight="bold" /></Link>
              </div>
            </div>
          )}
          {state === 'idle' && mode === 'try' && (
            <div className="kg-canvas grid h-full place-items-center rounded-xl p-6 text-center">
              <div className="max-w-lg">
                <h1 className="h-page">Try it — no account needed</h1>
                <p className="mt-2 text-[14px] text-fg-2">Type a topic above. You'll get a map built from Wikipedia and Wikidata, with every link showing where it came from.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">{IDEAS.map((t) => <button key={t} type="button" className="chip" onClick={() => setParams({ topic: t })}>{t}</button>)}</div>
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {selected && (
            <motion.aside key="pi" aria-label={`Details for ${selected.label}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
              className="surface absolute inset-x-0 bottom-0 z-30 max-h-[65dvh] overflow-hidden md:inset-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[360px] xl:static xl:w-[380px] xl:shrink-0">
              <PublicInspector node={selected} rootTitle={graph.title} onClose={() => setSelectedId(null)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {graph && (
        <p className="px-1 text-[12px] text-fg-3">
          Solid line = verified by Wikidata · Dashed = related by Wikipedia search · Dotted = AI's suggestion. Text from Wikipedia (CC BY-SA 4.0) and Wikidata (CC0).
        </p>
      )}
    </div>
  );
};

export default TryGraph;
