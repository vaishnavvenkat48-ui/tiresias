import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MagnifyingGlass, Plus, BookmarkSimple, Trash, ArrowRight, ShareNetwork } from '@phosphor-icons/react';
import { PageHeader, EmptyState, ErrorBanner, GraphThumb, CategoryDot, Segmented, Skeleton, timeAgo, Spinner } from '../components/UI';
import ShareDialog from '../components/ShareDialog';
import { graphsApi } from '../services/dataService';
import { errorMessage } from '../services/api';
import { useAsync } from '../utils/useAsync';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';

const SORTS = [{ value: 'recent', label: 'Recent' }, { value: 'size', label: 'Largest' }, { value: 'az', label: 'A–Z' }];

/** Library: only the graphs you chose to save (explorations stay in Home → recent activity). */
const Graphs = () => {
  const { toast } = useToast();
  const { refresh } = useUser();
  const { data, error, loading, reload, setData } = useAsync(() => graphsApi.list({ limit: 100, saved: true }).then((d) => d.items || []), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [sort, setSort] = useState('recent');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [sharing, setSharing] = useState(null);

  const categories = useMemo(() => ['All', ...new Set((data || []).map((g) => g.category))], [data]);
  const list = useMemo(() => {
    let l = (data || []).filter((g) => (cat === 'All' || g.category === cat) && g.title.toLowerCase().includes(q.trim().toLowerCase()));
    if (sort === 'size') l = [...l].sort((a, b) => (b.nodes?.length || 0) - (a.nodes?.length || 0));
    if (sort === 'az') l = [...l].sort((a, b) => a.title.localeCompare(b.title));
    return l;
  }, [data, q, cat, sort]);

  const unsave = async (g) => {
    setBusy(g._id);
    try {
      await graphsApi.save(g._id, false);
      setData((d) => d.filter((x) => x._id !== g._id));
      toast(`Removed “${g.title}” from your library`, { type: 'success', action: { label: 'Undo', onClick: async () => { await graphsApi.save(g._id, true); reload(); } } });
    } catch (e) {
      toast(errorMessage(e), { type: 'error' });
    } finally { setBusy(null); setConfirm(null); }
  };

  const remove = async (g) => {
    setBusy(g._id);
    try {
      await graphsApi.remove(g._id);
      setData((d) => d.filter((x) => x._id !== g._id));
      toast(`Deleted “${g.title}”`, { type: 'success' });
      refresh();
    } catch (e) {
      toast(errorMessage(e, 'Could not delete this graph.'), { type: 'error' });
    } finally { setBusy(null); setConfirm(null); }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Your saved graphs"
        description="Graphs you chose to keep — with their layout, pins and expansions exactly as you left them."
        actions={<Link to="/explore" className="btn btn-primary"><Plus size={16} weight="bold" /> New exploration</Link>}
      />

      {!!data?.length && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
            <label htmlFor="graph-filter" className="sr-only">Filter graphs</label>
            <input id="graph-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title" className="input !pl-10" />
          </div>
          {categories.length > 2 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
              {categories.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
            </div>
          )}
          <div className="ml-auto"><Segmented label="Sort" value={sort} onChange={setSort} options={SORTS} /></div>
        </div>
      )}

      {error && <ErrorBanner message={errorMessage(error)} onRetry={reload} />}
      {loading && !data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60 rounded-[20px]" />)}</div>}
      {data && !data.length && (
        <EmptyState
          icon={BookmarkSimple}
          title="Nothing saved yet"
          description="Explore a topic, arrange it the way you think, then press Save. Explorations you don't save stay in your recent activity on Home."
          action={<Link to="/explore" className="btn btn-primary">Explore a topic <ArrowRight size={14} /></Link>}
        />
      )}
      {data?.length > 0 && !list.length && <p className="well-sm px-4 py-8 text-center text-[13px] text-fg-2">No graphs match these filters.</p>}

      <motion.ul layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {list.map((g) => (
            <motion.li key={g._id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="surface group relative overflow-hidden">
              <Link to={`/explore?graph=${g._id}`} className="block p-3 pb-0" aria-label={`Open ${g.title}`}>
                <div className="well relative overflow-hidden">
                  <GraphThumb nodes={g.nodes} edges={g.edges} positions={g.layout?.positions} className="h-36 w-full transition-transform duration-500 group-hover:scale-[1.04]" />
                  {g.shareId && <span className="badge absolute right-2 top-2"><ShareNetwork size={11} /> shared</span>}
                </div>
              </Link>
              <div className="flex items-start gap-3 p-4">
                <Link to={`/explore?graph=${g._id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-fg">{g.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
                    <span className="flex items-center gap-1.5"><CategoryDot /> {g.category}</span>
                    <span>{g.nodes?.length || 0} concepts</span>
                    <span>{timeAgo(g.updatedAt)}</span>
                  </p>
                </Link>
                {confirm === g._id ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button type="button" className="btn btn-sm" onClick={() => unsave(g)} disabled={busy === g._id}>Remove from library</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(g)} disabled={busy === g._id}>{busy === g._id ? <Spinner size={13} /> : 'Delete forever'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center">
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Share ${g.title}`} title="Share" onClick={() => setSharing(g)}><ShareNetwork size={15} /></button>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm opacity-70 hover:opacity-100" aria-label={`Remove or delete ${g.title}`} title="Remove" onClick={() => setConfirm(g._id)}><Trash size={15} /></button>
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      <ShareDialog
        graph={sharing}
        onClose={() => setSharing(null)}
        onChange={(shareId) => setData((d) => d.map((x) => (x._id === sharing?._id ? { ...x, shareId } : x)))}
      />
    </div>
  );
};

export default Graphs;
