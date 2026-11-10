import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, MagnifyingGlass, Compass, BookmarkSimple, Atom, ChatCircleDots, ClockCounterClockwise, Sparkle,
  ArrowsOutSimple, Graph as GraphIcon, ChartLineUp,
} from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { greeting } from '../utils/data';
import { useAsync } from '../utils/useAsync';
import { graphsApi, aiApi, analyticsApi } from '../services/dataService';
import { errorMessage } from '../services/api';
import { StatTile, Card, EmptyState, GraphThumb, CategoryDot, timeAgo, Skeleton, Spinner, Segmented } from '../components/UI';
import { ActivityChart, BarList } from '../components/Charts';

const STARTERS = ['Black hole', 'Stoicism', 'Roman Empire', 'Machine learning', 'Photosynthesis', 'Norse mythology', 'Behavioral economics', 'Renaissance'];

const ACTIVITY = {
  TOPIC_SEARCHED: [Compass, 'Explored'],
  GRAPH_SAVED: [BookmarkSimple, 'Saved'],
  NODE_EXPANDED: [ArrowsOutSimple, 'Expanded a concept in'],
  AI_QUERY: [ChatCircleDots, 'Asked Tiresias'],
  NODE_SELECTED: [GraphIcon, 'Inspected'],
};

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] } } };

/** Home = welcome + search, your numbers, your library, and your activity (formerly Analytics + History). */
const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [days, setDays] = useState(30);
  const saved = useAsync(() => graphsApi.list({ limit: 6, saved: true }), []);
  const stats = useAsync(() => analyticsApi.me(days), [days]);
  const feed = useAsync(() => analyticsApi.activity({ limit: 12 }).then((d) => (d.items || []).filter((a) => ACTIVITY[a.activityType])), []);
  const [recs, setRecs] = useState(() => {
    try { return { data: JSON.parse(sessionStorage.getItem('tiresias_recs') || 'null'), loading: false, error: '' }; } catch { return { data: null, loading: false, error: '' }; }
  });

  useEffect(() => {
    if (location.hash === '#activity') setTimeout(() => document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [location.hash]);

  const loadRecs = async () => {
    setRecs({ data: null, loading: true, error: '' });
    try {
      const data = await aiApi.recommendations();
      try { sessionStorage.setItem('tiresias_recs', JSON.stringify(data)); } catch { /* noop */ }
      setRecs({ data, loading: false, error: '' });
    } catch (e) {
      setRecs({ data: null, loading: false, error: errorMessage(e, 'Could not get recommendations.') });
    }
  };

  const go = (t) => navigate(`/explore?topic=${encodeURIComponent(t)}`);
  const t = stats.data?.totals;
  const recent = (stats.data?.recentTopics || []).map((r) => r.name);
  const starters = STARTERS.filter((s) => !recent.some((r) => r.toLowerCase() === s.toLowerCase())).slice(0, 5);
  const hasActivity = stats.data?.timeline?.some((d) => d.searches || d.expansions || d.ai);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Welcome + search */}
      <motion.section variants={rise} className="surface relative overflow-hidden p-6 sm:p-8">
        <p className="eyebrow relative">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p>
        <h1 className="h-page relative mt-2">{greeting()}, {user?.name?.split(' ')[0] || 'explorer'}.</h1>
        <p className="relative mt-2 text-[14.5px] text-fg-2">Type any topic and get a map of everything related to it, with sources.</p>
        <form className="relative mt-6 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) go(q.trim()); }} role="search">
          <div className="relative flex-1">
            <MagnifyingGlass size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-3" />
            <label htmlFor="home-search" className="sr-only">Topic to explore</label>
            <input id="home-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Quantum entanglement, the Silk Road, Stoicism" className="input input-lg !pl-11" />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={!q.trim()}>Explore <ArrowRight size={16} weight="bold" /></button>
        </form>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {(recent.length ? recent.slice(0, 3) : []).map((r) => <button key={r} type="button" className="chip" onClick={() => go(r)}><ClockCounterClockwise size={12} /> {r}</button>)}
          {starters.map((s) => <button key={s} type="button" className="chip" onClick={() => go(s)}>{s}</button>)}
        </div>
      </motion.section>

      {/* Numbers */}
      <motion.div variants={rise} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Topics explored" value={t?.topicsExplored} icon={Compass} loading={!t} />
        <StatTile label="Saved graphs" value={saved.data?.pagination?.total} icon={BookmarkSimple} loading={!saved.data} />
        <StatTile label="Concepts discovered" value={t?.nodesDiscovered} icon={Atom} loading={!t} />
        <StatTile label="Questions asked" value={t?.aiQueries} icon={ChatCircleDots} loading={!t} />
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Library preview */}
        <motion.div variants={rise} className="xl:col-span-2">
          <Card title="Your library" description="Graphs you chose to save" action={<Link to="/graphs" className="btn btn-ghost btn-sm">Open library <ArrowRight size={13} /></Link>}>
            {saved.loading && <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-[14px]" />)}</div>}
            {!saved.loading && !saved.data?.items?.length && (
              <EmptyState icon={BookmarkSimple} title="Nothing saved yet" description="Explore a topic and press Save to keep it here, layout and all." action={<Link to="/explore" className="btn btn-primary btn-sm">Start exploring</Link>} />
            )}
            {!!saved.data?.items?.length && (
              <div className="grid gap-3 sm:grid-cols-2">
                {saved.data.items.slice(0, 4).map((g) => (
                  <Link key={g._id} to={`/explore?graph=${g._id}`} className="surface-sm surface-interactive group block overflow-hidden">
                    <div className="well m-2 mb-0 overflow-hidden !rounded-[10px]">
                      <GraphThumb nodes={g.nodes} edges={g.edges} positions={g.layout?.positions} className="h-28 w-full" />
                    </div>
                    <div className="p-3.5">
                      <p className="truncate text-[14px] font-medium text-fg">{g.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-3"><CategoryDot /> {g.category} · {g.nodes?.length || 0} concepts · {timeAgo(g.updatedAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Suggestions */}
        <motion.div variants={rise}>
          <Card
            title="Suggested for you"
            description={recs.data ? `From your history${recs.data.provider === 'offline' ? ' (unexplored branches)' : ' · Gemini'}` : 'Ideas to explore next'}
            action={!recs.data && t?.graphsCreated > 0 && (
              <button type="button" className="btn btn-sm" onClick={loadRecs} disabled={recs.loading}>{recs.loading ? <Spinner size={13} /> : <Sparkle size={13} className="text-accent" />} Personalise</button>
            )}
          >
            {recs.error && <p className="mb-2 text-[12.5px] text-danger">{recs.error}</p>}
            {recs.data?.recommendations?.length ? (
              <ul className="space-y-1.5">
                {recs.data.recommendations.slice(0, 5).map((r) => (
                  <li key={r.topic}>
                    <button type="button" onClick={() => go(r.topic)} className="w-full rounded-[10px] px-2 py-1.5 text-left hover:bg-hover">
                      <span className="block text-[13.5px] font-medium text-fg">{r.topic}</span>
                      <span className="block text-[12px] leading-snug text-fg-3">{r.reason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-wrap gap-2">{STARTERS.map((s) => <button key={s} type="button" className="chip" onClick={() => go(s)}>{s}</button>)}</div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Activity (formerly the Analytics and History pages) */}
      <motion.section variants={rise} id="activity" className="scroll-mt-24 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-fg"><ChartLineUp size={18} className="text-accent" /> Your activity</h2>
            <p className="text-[13px] text-fg-2">What you've been exploring, and how much.</p>
          </div>
          <Segmented label="Time range" value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
        </div>

        {stats.data && !hasActivity && !feed.data?.length ? (
          <EmptyState icon={ChartLineUp} title="Your activity will appear here" description="Explore a topic, expand a few concepts or ask a question — this section fills in as you go." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2" title="Over time" description={`Daily events · last ${days} days`}>
              {stats.data ? <ActivityChart data={stats.data.timeline} /> : <Skeleton className="h-[260px]" />}
            </Card>
            <Card title="Most explored" description="Your most-searched topics">
              {stats.data ? <BarList items={stats.data.topTopics} empty="No searches yet." onSelect={(it) => go(it.name)} /> : <Skeleton className="h-40" />}
            </Card>
            <Card className="xl:col-span-3" title="Recent" action={null}>
              {feed.loading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
              <ol className="divide-y divide-[var(--line-strong)]">
                {(feed.data || []).map((a) => {
                  const [Icon, verb] = ACTIVITY[a.activityType];
                  const label = a.topic || a.metadata?.title || a.metadata?.question || '';
                  const to = a.graphId ? `/explore?graph=${a.graphId}` : a.activityType === 'AI_QUERY' ? '/assistant' : label ? `/explore?topic=${encodeURIComponent(label)}` : null;
                  const body = (
                    <>
                      <span className="well-sm grid h-8 w-8 shrink-0 place-items-center text-accent"><Icon size={15} /></span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px]"><span className="text-fg-2">{verb} </span><span className="text-fg">{label}</span></span>
                      <time className="shrink-0 text-[12px] text-fg-3" dateTime={a.timestamp}>{timeAgo(a.timestamp)}</time>
                    </>
                  );
                  return <li key={a._id}>{to ? <Link to={to} className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-hover">{body}</Link> : <div className="flex items-center gap-3 px-2 py-2.5">{body}</div>}</li>;
                })}
              </ol>
            </Card>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
};

export default Dashboard;
