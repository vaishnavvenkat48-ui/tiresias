import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, ArrowsOutSimple, ArrowsInSimple, Crosshair, PushPin, PushPinSlash, ArrowSquareOut, Sparkle,
  YoutubeLogo, BookOpen, GraduationCap, ArrowUpLeft, LinkSimple, TreeStructure, Images, Article, Database, Play, SealCheck, Robot, Quotes, MagnifyingGlass,
} from '@phosphor-icons/react';
import { aiApi, resourcesApi, activityApi } from '../services/dataService';
import { errorMessage } from '../services/api';
import { descendantsOf } from './model';
import { Spinner, Modal } from '../components/UI';
import { usePrefs } from '../context/PrefsContext';

const KIND = (n) => (n.depth === 0 ? 'Central topic' : n.depth === 1 ? 'Primary concept' : `Subtopic · level ${n.depth}`);

const Section = ({ title, icon: Icon, children, right }) => (
  <section className="border-t border-line-strong py-4 first:border-t-0">
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-fg-2">{Icon && <Icon size={14} className="text-fg-3" />} {title}</h3>
      {right}
    </div>
    {children}
  </section>
);

/** Plain-language provenance badge (matches the graph's line styles). */
const Prov = ({ value, kind = 'link' }) => {
  if (value === 'ai_suggested') return <span className="prov prov-ai" title="Proposed by Gemini — not checked against a source"><Robot size={11} weight="fill" /> AI's suggestion</span>;
  if (value === 'search_related') return <span className="prov text-fg-2" title="Wikipedia's search lists these articles as similar — a hint, not a stated fact"><MagnifyingGlass size={11} weight="bold" /> Related by search</span>;
  if (value === 'user_added') return <span className="prov text-fg-3">Added by you</span>;
  return <span className="prov prov-verified" title={kind === 'link' ? 'A Wikidata statement directly connects these concepts' : 'This concept has its own Wikipedia/Wikidata entry'}><SealCheck size={11} weight="fill" /> {kind === 'link' ? 'Verified' : 'Sourced'}</span>;
};

/** Licence credit for reused text. Wikipedia text is CC BY-SA 4.0; Wikidata data is CC0. */
export const TextCredit = ({ source, url }) => {
  if (source === 'ai') return <p className="mt-2 text-[11px] text-fg-3">Description written by AI — not from a source.</p>;
  if (source === 'wikidata') return <p className="mt-2 text-[11px] text-fg-3">Description: <a href={url || 'https://www.wikidata.org'} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-fg-2">Wikidata</a> (CC0)</p>;
  return (
    <p className="mt-2 text-[11px] text-fg-3">
      Text: {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-fg-2">Wikipedia</a> : 'Wikipedia'}
      {' · '}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-fg-2">CC BY-SA 4.0</a>
    </p>
  );
};

const ConceptChip = ({ node, onClick, sub }) => (
  <button type="button" onClick={onClick} className="chip !h-auto max-w-full !py-1.5 text-left" title={node.label}>
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${node.depth === 0 ? 'bg-accent' : node.depth === 1 ? 'bg-accent-2' : 'bg-fg-3'}`} />
    <span className="truncate">{node.label}</span>
    {sub && <span className="shrink-0 text-[11px] text-fg-3">{sub}</span>}
  </button>
);

export const Attribution = ({ img }) => (
  <p className="mt-1.5 text-[11px] leading-snug text-fg-3">
    {img.creator ? <>{img.creator.slice(0, 60)} · </> : null}
    {img.licenseUrl ? <a href={img.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-fg-2">{img.license || 'licence'}</a> : (img.license || 'licence unknown')}
    {' · '}
    {img.sourceUrl ? <a href={img.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-fg-2">{img.provider}</a> : img.provider}
  </p>
);

/** Section that loads on demand (each hits a cached backend endpoint). */
const useLazy = (loader, deps) => {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  useEffect(() => { setState({ status: 'idle', data: null, error: '' }); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const load = async () => {
    setState({ status: 'loading', data: null, error: '' });
    try { setState({ status: 'ready', data: await loader(), error: '' }); } catch (e) { setState({ status: 'error', data: null, error: errorMessage(e) }); }
  };
  return [state, load];
};

const NodeInspector = ({ node, graph, onClose, onNavigate, onExpandToggle, onTogglePin, pinned, expanding, hiddenSet }) => {
  const { prefs } = usePrefs();
  const context = node.depth > 0 ? graph.title : undefined;
  const deps = [node.id, graph.id];

  const [card, loadCard] = useLazy(() => resourcesApi.topic(node.label, { context, wikidataId: node.metadata?.wikidataId || undefined }), deps);
  const [ai, loadAi] = useLazy(() => aiApi.explain(node.label, { context, wikidataId: node.metadata?.wikidataId || undefined }), deps);
  const [videos, loadVideos] = useLazy(() => resourcesApi.videos(node.label, context, graph.id), deps);
  const [images, loadImages] = useLazy(() => resourcesApi.images(node.label, context), deps);
  const [papers, loadPapers] = useLazy(() => resourcesApi.research(node.label, context, graph.id), deps);
  const [player, setPlayer] = useState(null);
  const [zoom, setZoom] = useState(null);

  // The topic card (image + Wikidata facts) loads automatically on selection (cached server-side)
  useEffect(() => { if (prefs.autoMedia) loadCard(); }, [node.id, graph.id, prefs.autoMedia]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const parent = node.metadata?.parent ? byId.get(node.metadata.parent) : null;
  const children = graph.nodes.filter((n) => n.metadata?.parent === node.id);
  const connections = graph.edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const other = byId.get(otherId);
      if (!other) return null;
      const outgoing = e.source === node.id;
      const rel = e.relationship || (e.type === 'related' ? 'related to' : outgoing ? 'includes' : 'part of');
      return { id: e.id, other, rel: outgoing ? rel : `← ${rel}`, edge: e };
    })
    .filter(Boolean);
  const desc = descendantsOf(graph.nodes, node.id);
  const expanded = node.metadata?.expanded && desc.length > 0;
  const branchHidden = desc.some((d) => hiddenSet?.has(d));
  const c = card.data;
  const sources = [...(node.sources || []), ...((c?.sources || []).filter((s) => !(node.sources || []).some((x) => x.url === s.url)))];

  const q = encodeURIComponent(node.label);
  const open = (kind, url) => { activityApi.record('RESOURCE_OPENED', { graphId: graph.id, nodeId: node.id, topic: node.label, metadata: { kind, url } }); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{KIND(node)}</p>
          <h2 className="mt-1 text-[20px] font-semibold leading-snug tracking-tight text-fg">{node.label}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2"><Prov value={node.provenance} kind="concept" />{c?.description && <span className="truncate text-[12px] text-fg-3">{c.description}</span>}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-1" aria-label="Close inspector (Esc)" onClick={onClose}><X size={15} /></button>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 px-5 pb-4">
        <button type="button" className="btn btn-primary btn-sm col-span-2 !h-9" onClick={() => onExpandToggle(node.id)} disabled={expanding}>
          {expanding ? <Spinner size={14} /> : expanded && !branchHidden ? <ArrowsInSimple size={15} /> : <ArrowsOutSimple size={15} />}
          {expanding ? 'Researching related concepts…' : !expanded ? 'Expand concept' : branchHidden ? 'Show branch' : 'Collapse branch'}
        </button>
        {node.metadata?.url ? (
          <a href={node.metadata.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm"><BookOpen size={15} /> Wikipedia</a>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm btn-icon flex-1" aria-label="Focus in graph" title="Focus in graph" onClick={() => onNavigate(node.id)}><Crosshair size={15} /></button>
          <button type="button" className="btn btn-sm btn-icon flex-1" aria-pressed={pinned} aria-label={pinned ? 'Unpin' : 'Pin in place'} title={pinned ? 'Unpin' : 'Pin in place'} onClick={() => onTogglePin(node.id)}>
            {pinned ? <PushPinSlash size={15} /> : <PushPin size={15} />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {/* Topic image (Wikidata P18 → Wikipedia lead image on Commons → Commons search) */}
        {card.status === 'loading' && <span className="skeleton mb-4 block aspect-[16/10] w-full rounded-[14px]" />}
        {c?.image && (
          <figure className="mb-4">
            <button type="button" className="frame block w-full overflow-hidden" onClick={() => setZoom(c.image)} aria-label={`Enlarge image: ${c.image.title}`}>
              <img src={c.image.thumbnail} alt={c.image.description || c.image.title} loading="lazy" className="max-h-40 object-cover sm:max-h-56" />
            </button>
            <figcaption><Attribution img={c.image} /></figcaption>
          </figure>
        )}
        {!prefs.autoMedia && card.status === 'idle' && <button type="button" className="btn btn-sm mb-4 w-full" onClick={loadCard}><Images size={14} /> Show image & facts</button>}

        <Section title="Overview">
          <p className="book-text text-fg">{node.description || c?.summary || 'No summary available for this concept yet.'}</p>
          {(node.description || c?.summary) && (
            <TextCredit
              source={node.description ? (node.metadata?.source === 'ai' ? 'ai' : node.metadata?.source === 'wikidata' ? 'wikidata' : 'wikipedia') : 'wikipedia'}
              url={node.metadata?.source === 'wikidata' ? node.sources?.[0]?.url : node.metadata?.url || c?.wikipediaUrl}
            />
          )}
          {c?.summary && c.summary.length > (node.description || '').length + 40 && (
            <details className="mt-2 text-[13px] text-fg-2">
              <summary className="cursor-pointer select-none text-fg-3 hover:text-fg-2">Read more from Wikipedia</summary>
              <p className="book-text mt-2">{c.summary}</p>
              <TextCredit source="wikipedia" url={c.wikipediaUrl} />
            </details>
          )}
        </Section>

        {c?.facts?.length > 0 && (
          <Section title="Key facts" icon={Database} right={c.wikidataUrl && <a href={c.wikidataUrl} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-fg-3 hover:text-fg-2">Wikidata ↗</a>}>
            <dl className="well-sm divide-y divide-[var(--line-strong)] px-3">
              {c.facts.slice(0, 8).map((f) => (
                <div key={f.label} className="flex gap-3 py-2 text-[12.5px]">
                  <dt className="w-[38%] shrink-0 capitalize text-fg-3">{f.label}</dt>
                  <dd className="min-w-0 flex-1 text-fg">{f.values.join(', ')}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <Section title="AI explanation" icon={Sparkle} right={ai.data && <span className={`badge ${ai.data.provider === 'offline' ? '' : 'badge-accent'}`}>{ai.data.provider === 'offline' ? 'offline' : 'Gemini'}</span>}>
          {ai.status === 'idle' && <button type="button" className="btn btn-sm w-full" onClick={loadAi}><Sparkle size={14} className="text-accent" /> Explain this concept</button>}
          {ai.status === 'loading' && <div className="space-y-2"><span className="skeleton block h-3 w-full" /><span className="skeleton block h-3 w-11/12" /><span className="skeleton block h-3 w-3/4" /></div>}
          {ai.status === 'error' && <p className="text-[12.5px] text-danger">{ai.error} <button type="button" className="underline" onClick={loadAi}>Retry</button></p>}
          {ai.data && (
            <div className="well-sm p-3.5">
              <p className="book-text text-fg">{ai.data.summary}</p>
              {ai.data.keyPoints?.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {ai.data.keyPoints.map((k) => <li key={k} className="flex gap-2 text-[12.5px] text-fg-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />{k}</li>)}
                </ul>
              )}
              {ai.data.analogy && <p className="mt-3 flex gap-2 text-[12.5px] italic text-fg-2"><Quotes size={14} className="mt-0.5 shrink-0 text-accent-2" />{ai.data.analogy}</p>}
              {ai.data.nextConcepts?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ai.data.nextConcepts.map((t) => {
                    const hit = graph.nodes.find((n) => n.label.toLowerCase() === t.toLowerCase());
                    return hit
                      ? <button key={t} type="button" className="chip !h-7" onClick={() => onNavigate(hit.id, true)}>{t}</button>
                      : <Link key={t} to={`/explore?topic=${encodeURIComponent(t)}`} className="chip !h-7" title="Explore as a new graph">{t} ↗</Link>;
                  })}
                </div>
              )}
            </div>
          )}
        </Section>

        {parent && (
          <Section title="Parent concept" icon={ArrowUpLeft}><ConceptChip node={parent} onClick={() => onNavigate(parent.id, true)} /></Section>
        )}

        {children.length > 0 && (
          <Section title={`Related concepts · ${children.length}`} icon={TreeStructure}>
            <div className="flex flex-wrap gap-1.5">
              {children.map((ch) => <ConceptChip key={ch.id} node={ch} onClick={() => onNavigate(ch.id, true)} sub={hiddenSet?.has(ch.id) ? 'hidden' : ch.provenance === 'ai_suggested' ? 'AI' : null} />)}
            </div>
          </Section>
        )}

        {connections.length > 0 && (
          <Section title="Connections" icon={LinkSimple}>
            <ul className="space-y-1">
              {connections.slice(0, 14).map((cn) => (
                <li key={cn.id}>
                  <button type="button" onClick={() => onNavigate(cn.other.id, true)} className="flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12.5px] hover:bg-hover" title={cn.edge.description || ''}>
                    <span className="min-w-0 flex-1">
                      <span className="text-fg-3">{cn.rel} </span><span className="text-fg">{cn.other.label}</span>
                    </span>
                    <Prov value={cn.edge.provenance} />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Images" icon={Images}>
          {images.status === 'idle' && <button type="button" className="btn btn-sm w-full" onClick={loadImages}>Show images (Wikimedia Commons)</button>}
          {images.status === 'loading' && <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton block aspect-square rounded-[10px]" />)}</div>}
          {images.status === 'error' && <p className="text-[12.5px] text-danger">{images.error}</p>}
          {images.data && (images.data.images.length ? (
            <div className="grid grid-cols-3 gap-2">
              {images.data.images.slice(0, 9).map((img) => (
                <button key={img.id} type="button" onClick={() => setZoom(img)} className="well-sm group overflow-hidden !rounded-[10px] p-0.5" title={`${img.title} — ${img.license || 'licence unknown'}`}>
                  <img src={img.thumbnail} alt={img.title} loading="lazy" className="aspect-square w-full rounded-[8px] object-cover transition-transform duration-300 group-hover:scale-105" />
                </button>
              ))}
            </div>
          ) : <p className="text-[12.5px] text-fg-3">No openly-licensed images found.</p>)}
        </Section>

        <Section title="Videos" icon={YoutubeLogo} right={videos.data?.note && <span className="badge">{videos.data.note.split('—')[0]}</span>}>
          {videos.status === 'idle' && <button type="button" className="btn btn-sm w-full" onClick={loadVideos}>Find videos on YouTube</button>}
          {videos.status === 'loading' && <div className="space-y-2"><span className="skeleton block h-16 w-full" /><span className="skeleton block h-16 w-full" /></div>}
          {videos.status === 'error' && <p className="text-[12.5px] text-danger">{videos.error}</p>}
          {videos.data && (videos.data.videos.length ? (
            <ul className="space-y-2">
              {videos.data.videos.slice(0, 5).map((v) => (
                <li key={v.videoId}>
                  <button type="button" onClick={() => { setPlayer(v); open('video', v.url); }} className="well-sm group flex w-full items-center gap-3 p-2 text-left">
                    <span className="relative w-28 shrink-0 overflow-hidden rounded-[8px]">
                      {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" /> : <span className="block aspect-video bg-fg/10" />}
                      <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-80 transition-opacity group-hover:opacity-100"><Play size={18} weight="fill" className="text-white drop-shadow" /></span>
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[12.5px] font-medium text-fg">{v.title}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-fg-3">{v.channel}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12.5px] text-fg-3">{videos.data.note || 'No videos found.'}</p>)}
        </Section>

        <Section title="Research" icon={Article}>
          {papers.status === 'idle' && <button type="button" className="btn btn-sm w-full" onClick={loadPapers}>Find papers (OpenAlex · Crossref)</button>}
          {papers.status === 'loading' && <div className="space-y-2"><span className="skeleton block h-12 w-full" /><span className="skeleton block h-12 w-full" /></div>}
          {papers.status === 'error' && <p className="text-[12.5px] text-danger">{papers.error}</p>}
          {papers.data && (papers.data.works.length ? (
            <ul className="space-y-2">
              {papers.data.works.slice(0, 5).map((w) => (
                <li key={w.id} className="well-sm p-3">
                  <a href={w.openAccessUrl || w.url} target="_blank" rel="noopener noreferrer" onClick={() => open('paper', w.url)} className="text-[12.5px] font-medium leading-snug text-fg hover:underline">{w.title}</a>
                  <p className="mt-1 text-[11.5px] text-fg-3">
                    {[w.authors?.slice(0, 2).join(', ') + (w.authors?.length > 2 ? ' et al.' : ''), w.year, w.venue].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-fg-3">
                    <span>{w.provider}</span>
                    {w.citations > 0 && <span>{w.citations.toLocaleString()} citations</span>}
                    {w.openAccess && <span className="text-success">open access</span>}
                    {w.doi && <span>doi:{w.doi}</span>}
                  </p>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12.5px] text-fg-3">No matching papers found.</p>)}
        </Section>

        <Section title="Sources & links" icon={BookOpen}>
          <ul className="space-y-1">
            {sources.slice(0, 6).map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[12.5px] text-fg hover:bg-hover">
                  <span className="w-[72px] shrink-0 text-[11px] text-fg-3">{s.provider}</span>
                  <span className="min-w-0 flex-1 truncate">{s.title || s.url}</span>
                  <ArrowSquareOut size={13} className="shrink-0 text-fg-3" />
                </a>
              </li>
            ))}
            {!sources.length && <li className="px-2 text-[12.5px] text-fg-3">{node.provenance === 'ai_suggested' ? 'AI-suggested concept — no retrieved source.' : 'No sources recorded.'}</li>}
            <li>
              <a href={`https://scholar.google.com/scholar?q=${q}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[12.5px] text-fg-2 hover:bg-hover">
                <GraduationCap size={14} className="w-[72px] shrink-0" /> <span className="flex-1">Search Google Scholar</span> <ArrowSquareOut size={13} className="text-fg-3" />
              </a>
            </li>
          </ul>
        </Section>
      </div>

      {/* Video player (privacy-enhanced embed) */}
      <Modal open={!!player} onClose={() => setPlayer(null)} title={player?.title || ''} description={player?.channel} width="max-w-3xl">
        {player && (
          <>
            <div className="frame overflow-hidden">
              <iframe
                className="aspect-video w-full rounded-[10px]"
                src={`${player.embedUrl}?autoplay=1&rel=0`}
                title={player.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <a href={player.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-fg-2 hover:text-fg">Open on YouTube <ArrowSquareOut size={12} /></a>
          </>
        )}
      </Modal>

      {/* Image lightbox with attribution */}
      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom?.title || ''} description={zoom?.description?.slice(0, 160)} width="max-w-3xl">
        {zoom && (
          <>
            <div className="frame"><img src={zoom.imageUrl || zoom.thumbnail} alt={zoom.description || zoom.title} className="max-h-[60dvh] object-contain" /></div>
            <Attribution img={zoom} />
          </>
        )}
      </Modal>
    </div>
  );
};

export default NodeInspector;
