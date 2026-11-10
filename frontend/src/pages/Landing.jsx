import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion, useScroll, useTransform, useMotionValueEvent, useSpring, animate } from 'framer-motion';
import KnowledgeGraph from '../graph/KnowledgeGraph';
import { sampleGraph } from '../graph/sources';
import { fromPersisted } from '../graph/model';
import { Spinner } from '../components/UI';
import { publicApi } from '../services/dataService';
import { useAuth } from '../context/AuthContext';
import { PLATES, useTilt } from '../components/MapPlates';
import './landing.css';

const EASE = [0.2, 0.8, 0.2, 1];
const SHOWCASE = ['Black hole', 'Roman Empire', 'Stoicism', 'Machine learning', 'Norse mythology', 'Photosynthesis'];
const IMG = '/landing';

/** Five centuries of people drawing knowledge as a map — the frames of the hero reel. */
const REEL = [
  { src: `${IMG}/llull-tree.jpg`, pos: '50% 62%', alt: 'Woodcut of a tree whose branches and roots are labelled with the names of the sciences', caption: 'Ramon Llull, Arbor scientiae, 1515' },
  { src: `${IMG}/diderot-system.jpg`, pos: '50% 30%', alt: 'Printed chart dividing human knowledge into memory, reason and imagination, with bracketed branches', caption: "Diderot and d'Alembert, the figurative system of human knowledge, 1751" },
  { src: `${IMG}/bevis-star-chart.jpg`, pos: '50% 50%', alt: 'Engraved star chart with the constellations drawn as figures and the stars joined by lines', caption: 'John Bevis, star chart from Uranographia Britannica, 1750' },
  { src: `${IMG}/ptolemaic-planisphere.jpg`, pos: '50% 50%', alt: 'Hand-coloured planisphere of the Ptolemaic universe, the planets on concentric rings', caption: 'Planisphaerium Ptolemaicum, Boston Public Library' },
];

const STAGES = [
  { name: 'Type', clause: 'First, type any topic.', copy: 'A subject, a person, a period or an idea. Anything with a Wikipedia article.' },
  { name: 'Map', clause: 'Then the sources draw it.', copy: 'Tiresias reads Wikipedia, Wikidata and OpenAlex and lays out the concepts around your topic, connected.' },
  { name: 'Open', clause: 'Open any concept.', copy: 'Each one opens with its picture, key facts, videos and research papers. Double-click to expand it.' },
  { name: 'Keep', clause: 'Save it, share a link.', copy: 'Keep maps in your library, arrange them by hand, and send anyone a read-only link.' },
];

const SOURCES = ['Wikipedia', 'Wikidata', 'OpenAlex', 'Wikimedia Commons', 'YouTube'];

const LINES = [
  { kind: 'solid', title: 'Verified', text: 'A Wikidata statement directly connects the two concepts.' },
  { kind: 'dashed', title: 'Related by search', text: 'Wikipedia lists the articles as similar. A useful hint, not a stated fact.' },
  { kind: 'dotted', title: "The AI's suggestion", text: 'Proposed by Gemini to fill gaps. It only ever adds, and never overrides a source.' },
];

/* ── small helpers ─────────────────────────────────── */

const reveal = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Staggered entrance: each direct <Reveal.Item> rises in turn, once. */
const Reveal = ({ as = 'div', className, children, ...rest }) => {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag className={className} initial={reduce ? false : 'hidden'} whileInView="show" viewport={{ once: true, margin: '-12% 0px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }} {...rest}>
      {children}
    </Tag>
  );
};
const Item = ({ as = 'div', className, children, ...rest }) => {
  const Tag = motion[as];
  return <Tag className={className} variants={reveal} {...rest}>{children}</Tag>;
};

const useMedia = (query) => {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
};

const Mark = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.4" stroke="#4f6238" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="2.8" fill="#4f6238" />
  </svg>
);

/* ── hero ───────────────────────────────────────────── */

/** One frame of the reel: it rides a drum, tipping back as it leaves the centre and forward as it arrives. */
const ReelFrame = ({ f, i, step }) => {
  const d = useTransform(step, (s) => i - s);
  const y = useTransform(d, (v) => `calc(${v} * (50svh + 9.85vw - 60px))`);
  const rotateX = useTransform(d, [-1.2, 0, 1.2], [42, 0, -42]);
  const scale = useTransform(d, [-1.2, 0, 1.2], [0.84, 1, 0.84]);
  return (
    <motion.div className="lp-reel-frame" style={{ top: 0, y, rotateX, scale, transformPerspective: 1200 }}>
      <img src={f.src} alt={f.alt} width="1400" height="1000" style={{ objectPosition: f.pos }} loading={i === 0 ? 'eager' : 'lazy'} />
    </motion.div>
  );
};

const Hero = ({ isAuthenticated }) => {
  const reduce = useReducedMotion();
  const wide = useMedia('(min-width: 901px)');
  const pinned = wide && !reduce;
  const ref = useRef(null);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [current, setCurrent] = useState(0);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const step = useTransform(scrollYProgress, [0.02, 0.96], [0, REEL.length - 1], { clamp: true });
  // One step = from this frame's centre to where the next shows as a 60px sliver at the viewport's foot.
  const tilt = useTilt(6);
  useMotionValueEvent(step, 'change', (s) => pinned && setCurrent(Math.round(s)));

  // Without the pin (phones, reduced motion) the reel advances on its own, gently.
  useEffect(() => {
    if (pinned || reduce) return undefined;
    const t = setInterval(() => setCurrent((c) => (c + 1) % REEL.length), 3800);
    return () => clearInterval(t);
  }, [pinned, reduce]);

  const go = (e) => {
    e.preventDefault();
    const t = q.trim();
    if (!t) return;
    navigate(isAuthenticated ? `/explore?topic=${encodeURIComponent(t)}` : `/try?topic=${encodeURIComponent(t)}`);
  };

  return (
    <section ref={ref} className="lp-hero" aria-labelledby="lp-title">
      <div className="lp-hero-stage">
        <h1 id="lp-title">
          <motion.span className="lp-half lp-half-a" initial={reduce ? false : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: EASE }}>Type a topic,</motion.span>{' '}
          <motion.span className="lp-half lp-half-b" initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}>see its map.</motion.span>
        </h1>

        <div className="lp-reel-pos" {...tilt.handlers}>
        <motion.div ref={tilt.ref} className="lp-reel-tilt" style={tilt.style}>
        <motion.figure className="lp-reel" initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}>
          {pinned ? (
            <div className="lp-reel-track">
              {REEL.map((f, i) => <ReelFrame key={f.src} f={f} i={i} step={step} />)}
            </div>
          ) : (
            REEL.map((f, i) => (
              <div key={f.src} className="lp-reel-frame" style={{ top: 0, opacity: i === current ? 1 : 0, transition: 'opacity .8s ease' }} aria-hidden={i !== current}>
                <img src={f.src} alt={f.alt} width="1400" height="1000" style={{ objectPosition: f.pos }} loading={i === 0 ? 'eager' : 'lazy'} />
              </div>
            ))
          )}
          <figcaption className="lp-reel-caption" aria-live="polite">{REEL[current].caption}</figcaption>
        </motion.figure>
        </motion.div>
        </div>

        <motion.div className="lp-hero-foot" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.35 }}>
          <p>People have drawn knowledge as maps for five hundred years. Tiresias draws one for any topic in seconds, from Wikipedia and Wikidata, and says where every link came from.</p>
          <form onSubmit={go} className="lp-hero-form" role="search">
            <label htmlFor="lp-topic" className="sr-only">Topic to map</label>
            <input id="lp-topic" className="lp-field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Byzantine Empire, CRISPR, jazz" autoComplete="off" />
            <button type="submit" className="lp-btn" disabled={!q.trim()}>Map it</button>
          </form>
          <p className="lp-hero-note">{isAuthenticated ? 'Opens in your explorer.' : 'No account needed for your first three maps a day.'}</p>
        </motion.div>
      </div>
    </section>
  );
};

/* ── showcase: the headline you can type ───────────── */

const ShowcaseGraph = ({ topic }) => {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let live = true;
    setLoading(true); setSelected(null);
    publicApi.showcase(topic)
      .then((r) => live && setDoc(r.graph ? { ...r.graph, _id: `showcase:${topic}` } : null))
      .catch(() => live && setDoc(null))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [topic]);
  const graph = useMemo(() => {
    if (loading) return null;
    if (doc) return fromPersisted(doc);
    return { ...sampleGraph(topic), id: `sample:${topic}` };
  }, [doc, loading, topic]);
  const layout = useMemo(() => ({ positions: {}, pinned: [], hidden: [], physics: true, strength: 1 }), [graph]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!graph) return <div className="grid h-full place-items-center"><Spinner className="text-accent" /></div>;
  return <KnowledgeGraph graph={graph} graphKey={`showcase:${topic}:${doc ? 'live' : 'sample'}`} layout={layout} selectedId={selected} onSelect={setSelected} compact title={`${topic} example map`} />;
};

const Showcase = ({ isAuthenticated }) => {
  const navigate = useNavigate();
  const [text, setText] = useState(SHOWCASE[0]);
  const [topic, setTopic] = useState(SHOWCASE[0]);

  const onChange = (v) => {
    setText(v);
    const hit = SHOWCASE.find((t) => t.toLowerCase() === v.trim().toLowerCase());
    if (hit) setTopic(hit);
  };
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    navigate(isAuthenticated ? `/explore?topic=${encodeURIComponent(t)}` : `/try?topic=${encodeURIComponent(t)}`);
  };

  return (
    <section id="showcase" className="lp-section lp-wrap" aria-labelledby="lp-showcase">
      <Reveal>
        <Item className="lp-type-head">
          <h2 id="lp-showcase" className="lp-h2 lp-head">Map anything on Wikipedia.</h2>
          <Link to={`/try?topic=${encodeURIComponent(topic)}`} className="lp-link lp-lead">Open the full {topic} map</Link>
        </Item>
        <Item as="form" className="lp-type-form" onSubmit={submit} role="search" data-ui>
          <label htmlFor="lp-type" className="sr-only">Topic to map</label>
          <input id="lp-type" className="lp-type-input" value={text} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck="false" />
          <button type="submit" className="lp-btn" disabled={!text.trim()}>Map it</button>
        </Item>
        <Item className="lp-answer">
          <div className="lp-answer-graph" data-ui>
            <ShowcaseGraph topic={topic} />
          </div>
          <div className="lp-answer-side">
            <p className="lp-lead">This is the real map for {topic}, built from open sources before any AI touches it. Drag a concept and the network follows.</p>
            <div>
              <p className="lp-small lp-muted" style={{ marginBottom: 12 }}>Or try one of these</p>
              <div className="lp-examples" role="group" aria-label="Example topics">
                {SHOWCASE.map((t) => (
                  <button key={t} type="button" className="lp-example" aria-pressed={topic === t} onClick={() => { setText(t); setTopic(t); }}>{t}</button>
                ))}
              </div>
            </div>
          </div>
        </Item>
      </Reveal>
    </section>
  );
};

/* ── how it works: drag through the stages ─────────── */

const FragType = () => (
  <div className="lp-ui" data-ui>
    <div className="lp-ui-search"><span>Photosynthesis</span><span className="lp-ui-caret" /></div>
    <div style={{ marginTop: 12 }}>
      {[['Photosynthesis', 'Biological process'], ['Photosynthetic pigment', 'Pigment'], ['Artificial photosynthesis', 'Chemical process']].map(([t, d]) => (
        <div key={t} className="lp-ui-row"><span>{t}</span><span className="lp-ui-dim">{d}</span></div>
      ))}
    </div>
  </div>
);

const MAP_NODES = [
  { id: 'p', x: 220, y: 150, label: 'Photosynthesis', root: true },
  { id: 'c', x: 80, y: 60, label: 'Chlorophyll' },
  { id: 'k', x: 360, y: 58, label: 'Calvin cycle' },
  { id: 'l', x: 74, y: 246, label: 'Chloroplast' },
  { id: 'f', x: 366, y: 244, label: 'Carbon fixation' },
  { id: 'a', x: 220, y: 286, label: 'Artificial leaf' },
];
const MAP_EDGES = [['p', 'c', 'solid'], ['p', 'k', 'solid'], ['p', 'l', 'solid'], ['p', 'f', 'dashed'], ['k', 'f', 'solid'], ['p', 'a', 'dotted']];

const FragMap = () => {
  const at = Object.fromEntries(MAP_NODES.map((n) => [n.id, n]));
  return (
    <div className="lp-ui" data-ui>
      <svg className="lp-ui-map" viewBox="0 0 440 320" role="img" aria-label="A small map: Photosynthesis linked to Chlorophyll, Calvin cycle, Chloroplast, Carbon fixation and Artificial leaf">
        {MAP_EDGES.map(([a, b, k]) => (
          <line key={a + b} x1={at[a].x} y1={at[a].y} x2={at[b].x} y2={at[b].y} stroke={k === 'dotted' ? '#8a6414' : '#4f6238'} strokeWidth={k === 'solid' ? 2.2 : 1.8}
            strokeDasharray={k === 'dashed' ? '8 6' : k === 'dotted' ? '1.5 6' : undefined} strokeLinecap="round" />
        ))}
        {MAP_NODES.map((n) => (
          <g key={n.id}>
            <rect x={n.x - (n.label.length * 3.9 + 16)} y={n.y - 15} width={n.label.length * 7.8 + 32} height="30" rx="6" fill={n.root ? '#2a2a26' : '#e6e0d2'} />
            <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="13" fontWeight={n.root ? 600 : 500} fill={n.root ? '#f5f1e8' : '#2a2a26'} fontFamily="Inter, sans-serif">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const FragOpen = () => (
  <div className="lp-ui" data-ui>
    <div className="lp-ui-title">Chlorophyll</div>
    <p style={{ margin: '8px 0 12px' }}>The green pigment in plants and algae that absorbs light for photosynthesis.</p>
    {[['Part of', 'Photosynthesis'], ['Papers', 'OpenAlex'], ['Videos', 'YouTube']].map(([k, v]) => (
      <div key={k} className="lp-ui-row"><span className="lp-ui-dim">{k}</span><span>{v}</span></div>
    ))}
    <p className="lp-ui-dim" style={{ margin: '10px 0 0', fontSize: 12.5 }}>Sample summary. Real ones quote Wikipedia, CC BY-SA 4.0.</p>
  </div>
);

const FragKeep = () => (
  <div className="lp-ui" data-ui>
    <div className="lp-ui-row" style={{ alignItems: 'center' }}>
      <span><span className="lp-ui-title" style={{ fontSize: 16 }}>Photosynthesis</span><br /><span className="lp-ui-dim">Saved to your library</span></span>
      <span className="lp-ui-btn">Saved</span>
    </div>
    <div style={{ marginTop: 14 }}>
      <span className="lp-ui-dim">Read-only link</span>
      <div className="lp-ui-search" style={{ marginTop: 6, fontSize: 14, justifyContent: 'space-between' }}><span>/g/k3v9q2</span><span className="lp-ui-btn">Copy</span></div>
    </div>
  </div>
);

const FRAGMENTS = [FragType, FragMap, FragOpen, FragKeep];

const SPAN = 100; // slider units per stage, so the thumb glides instead of jumping
const BUTTER = { type: 'spring', stiffness: 170, damping: 26, mass: 0.9 };

const HowItWorks = () => {
  const reduce = useReducedMotion();
  const last = STAGES.length - 1;
  const [pos, setPos] = useState(0); // continuous: 0 … last * SPAN
  const anim = useRef(null);
  const stage = Math.min(last, Math.max(0, Math.round(pos / SPAN)));
  const Frag = FRAGMENTS[stage];
  const s = STAGES[stage];
  const tilt = useTilt(8);

  // Glide to a stop with a soft spring (on release, on a stage name, on the keyboard).
  const glideTo = (i) => {
    const to = Math.min(last, Math.max(0, i)) * SPAN;
    anim.current?.stop();
    if (reduce) { setPos(to); return; }
    anim.current = animate(pos, to, { ...BUTTER, onUpdate: setPos });
  };
  const settle = () => glideTo(Math.round(pos / SPAN));
  const onKeyDown = (e) => {
    const map = { ArrowRight: stage + 1, ArrowUp: stage + 1, ArrowLeft: stage - 1, ArrowDown: stage - 1, Home: 0, End: last, PageUp: stage + 1, PageDown: stage - 1 };
    if (e.key in map) { e.preventDefault(); glideTo(map[e.key]); }
  };
  useEffect(() => () => anim.current?.stop(), []);

  const swap = reduce ? {} : {
    initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -14 }, transition: BUTTER,
  };
  const turn = reduce ? {} : {
    initial: { opacity: 0, rotateY: -16, x: 48, scale: 0.96 },
    animate: { opacity: 1, rotateY: 0, x: 0, scale: 1 },
    exit: { opacity: 0, rotateY: 16, x: -48, scale: 0.96 },
    transition: BUTTER,
  };
  return (
    <section id="how" className="lp-how" aria-labelledby="lp-how">
      <div className="lp-how-left">
        <h2 id="lp-how" className="lp-h2 lp-lead">How it works, from one word to a map.</h2>
        <div className="lp-how-swap">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={stage} {...swap}>
              <p className="lp-how-clause" aria-live="polite">{s.clause}</p>
              <p className="lp-how-copy">{s.copy}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="lp-how-right" {...tilt.handlers}>
        <motion.div ref={tilt.ref} className="lp-how-stage" style={tilt.style}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={stage} className="lp-how-card" style={{ transformPerspective: 1000 }} {...turn}><Frag /></motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
      <div className="lp-slider">
        <div className="lp-range-wrap">
          <span className="lp-range-fill" style={{ transform: `scaleX(${pos / (last * SPAN)})` }} />
          <input type="range" className="lp-range" min="0" max={last * SPAN} step="1" value={pos}
            onChange={(e) => { anim.current?.stop(); setPos(Number(e.target.value)); }}
            onPointerUp={settle} onTouchEnd={settle} onBlur={settle} onKeyDown={onKeyDown}
            aria-label="Stage" aria-valuetext={`${s.name}: ${s.clause}`} />
        </div>
        <div className="lp-stages">
          {STAGES.map((st, i) => (
            <button key={st.name} type="button" onClick={() => glideTo(i)} aria-current={i === stage ? 'step' : undefined}>{st.name}</button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── sources ───────────────────────────────────────── */

/** The line draws itself in from the left when it enters (a clip, so dashes keep their rhythm). */
const LineSample = ({ kind, i }) => {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id={`lp-clip-${kind}`}>
        <motion.rect x="0" y="0" height="28" width="400" initial={reduce ? false : { width: 0 }} whileInView={{ width: 400 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE, delay: 0.2 + i * 0.25 }} />
      </clipPath></defs>
      <line clipPath={`url(#lp-clip-${kind})`} x1="4" y1="14" x2="396" y2="14" stroke={kind === 'dotted' ? '#8a6414' : '#4f6238'} strokeWidth={kind === 'solid' ? 6 : 5}
        strokeDasharray={kind === 'dashed' ? '26 16' : kind === 'dotted' ? '1 16' : undefined} strokeLinecap={kind === 'dotted' ? 'round' : 'butt'} />
    </svg>
  );
};

const Sources = () => {
  const reduce = useReducedMotion();
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setLit((i) => (i + 1) % SOURCES.length), 2000);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <section id="sources" className="lp-section lp-wrap" aria-labelledby="lp-sources">
      <Reveal className="lp-grid">
        <Item className="lp-sources-text">
          <h2 id="lp-sources" className="lp-h2 lp-head">Every line names its source.</h2>
          <p className="lp-statement">
            Built from{' '}
            {SOURCES.map((name, i) => (
              <span key={name}><span className={`lp-source${i === lit ? ' is-lit' : ''}`}>{name}</span>{i < SOURCES.length - 2 ? ', ' : i === SOURCES.length - 2 ? ' and ' : '.'}</span>
            ))}
          </p>
        </Item>
        <Reveal as="ul" className="lp-lines">
          {LINES.map((l, i) => (
            <Item as="li" key={l.kind}>
              <LineSample kind={l.kind} i={i} />
              <h3>{l.title}</h3>
              <p>{l.text}</p>
            </Item>
          ))}
        </Reveal>
      </Reveal>
    </section>
  );
};

/* ── the name ──────────────────────────────────────── */

const Seer = () => {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const tilt = useTilt(7);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const drift = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-7%', '7%']);
  return (
  <section id="name" ref={ref} className="lp-section lp-wrap" aria-labelledby="lp-seer">
    <Reveal className="lp-grid">
      <Item as="figure" className="lp-seer-pic" style={{ margin: 0 }}>
        <div className="lp-seer-frame" {...tilt.handlers}>
          <motion.div ref={tilt.ref} className="lp-seer-window" style={tilt.style}>
            <motion.img style={{ y: drift }} src={`${IMG}/fuseli-tiresias.jpg`} alt="A tall veiled old man with a staff stands in a cloud of spirits while a warrior crouches below him" width="1400" height="2038" loading="lazy" />
          </motion.div>
        </div>
        <figcaption className="lp-cap">Henry Fuseli, Tiresias appears to Ulysses during the sacrifice, 1780–85</figcaption>
      </Item>
      <div className="lp-seer-text">
        <Item>
          <h2 id="lp-seer" className="lp-h2 lp-head">Named for a blind seer.</h2>
          <p>In Greek myth Tiresias was the blind prophet of Thebes, who saw what others could not. In the Odyssey, Odysseus goes down to the underworld to ask him the way home.</p>
          <p>This Tiresias does a smaller job. It shows you the way around a subject: what sits next to it, what it is part of, and which of those connections you can trust.</p>
        </Item>
        <Item as="figure">
          <img src={`${IMG}/fuseli-drawing.jpg`} alt="Ink wash drawing of Tiresias with his staff as Odysseus kneels, sword drawn, by a sacrificed ram" width="1400" height="983" loading="lazy" />
          <figcaption className="lp-cap">Henry Fuseli, Tiresias and Odysseus, from the Roman Album, 1770s</figcaption>
        </Item>
      </div>
    </Reveal>
  </section>
  );
};

/* ── the closing question ──────────────────────────── */

const Closing = ({ isAuthenticated }) => {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const wide = useMedia('(min-width: 901px)');
  const still = reduce || !wide;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start start'] });
  const xa = useTransform(scrollYProgress, [0, 1], still ? ['0vw', '0vw'] : ['-16vw', '0vw']);
  const xb = useTransform(scrollYProgress, [0, 1], still ? ['0vw', '0vw'] : ['16vw', '0vw']);
  return (
  <section ref={ref} className="lp-cta" aria-labelledby="lp-cta">
    <h2 id="lp-cta" className="lp-h2 lp-cta-q">
      <motion.span className="lp-display" style={{ x: xa }}>{isAuthenticated ? 'Map a new one,' : 'Try one now,'}</motion.span>{' '}
      <motion.span className="lp-display" style={{ x: xb }}>{isAuthenticated ? 'or reopen a map?' : 'or keep them all?'}</motion.span>
    </h2>
    <Reveal className="lp-cta-mid">
        <Item className="lp-cta-row">
          {isAuthenticated ? (
            <>
              <Link to="/explore" className="lp-btn lp-btn-quiet">Open the explorer</Link>
              <span className="lp-cta-or">or</span>
              <Link to="/graphs" className="lp-btn">Open your library</Link>
            </>
          ) : (
            <>
              <Link to="/try" className="lp-btn lp-btn-quiet">Try without an account</Link>
              <span className="lp-cta-or">or</span>
              <Link to="/register" className="lp-btn">Create a free account</Link>
            </>
          )}
        </Item>
        <Item as="p" className="lp-cta-note">A free account saves your maps, expands any concept, shares read-only links and lets you ask the AI tutor about what you mapped.</Item>
    </Reveal>
  </section>
  );
};

/* ── footer ────────────────────────────────────────── */

const Footer = ({ isAuthenticated }) => (
  <footer className="lp-footer" aria-labelledby="lp-footer">
    <div className="lp-footer-top">
      <div className="lp-notes">
        <p><strong>Tiresias</strong> maps any topic from open sources.</p>
        <p>Text from <a className="lp-link" href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA 4.0), data from <a className="lp-link" href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a> (CC0).</p>
        <p>Concept pictures come from Wikimedia Commons, each with its own credit.</p>
      </div>
      <a href="#lp-title" className="lp-link">Back to top</a>
    </div>
    <h2 id="lp-footer" className="lp-footer-big lp-h2">
      <Link to={isAuthenticated ? '/explore' : '/try'}>Start a map.</Link>
    </h2>
    <div className="lp-footer-meta">
      <nav aria-label="Footer">
        {isAuthenticated ? <Link className="lp-link" to="/dashboard">Home</Link> : <Link className="lp-link" to="/login">Sign in</Link>}
        {!isAuthenticated && <Link className="lp-link" to="/register">Create account</Link>}
        <Link className="lp-link" to="/try">Try it</Link>
      </nav>
      <span>
        Pictures: Ramon Llull (1515), Diderot (1751), John Bevis (1750) and Henry Fuseli, public domain; Planisphaerium Ptolemaicum by the Boston Public Library, CC BY 2.0. All via{' '}
        <a className="lp-link" href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>.
      </span>
      <span>© {new Date().getFullYear()} Tiresias</span>
    </div>
  </footer>
);

/* ── topics band: two rows of real starting points ─── */

const TOPICS_A = ['Byzantine Empire', 'CRISPR', 'Jazz', 'Plate tectonics', 'Ada Lovelace', 'Silk Road', 'Quantum entanglement', 'Impressionism', 'Mitochondrion'];
const TOPICS_B = ['Renaissance', 'Game theory', 'Coral reef', 'French Revolution', 'Neural network', 'Baroque music', 'Volcano', 'Printing press', 'Antibiotic'];

const TopicRow = ({ topics, reverse, to }) => (
  <div className={`lp-marquee${reverse ? ' is-reverse' : ''}`}>
    <div className="lp-marquee-track">
      {[0, 1].map((copy) => (
        <ul key={copy} className="lp-marquee-list" aria-hidden={copy === 1 ? true : undefined}>
          {topics.map((t) => (
            <li key={t}><Link to={to(t)} tabIndex={copy === 1 ? -1 : undefined} className="lp-topic">{t}</Link></li>
          ))}
        </ul>
      ))}
    </div>
  </div>
);

const TopicsBand = ({ isAuthenticated }) => {
  const to = (t) => (isAuthenticated ? `/explore?topic=${encodeURIComponent(t)}` : `/try?topic=${encodeURIComponent(t)}`);
  return (
    <section className="lp-band" aria-labelledby="lp-band">
      <Reveal className="lp-band-head lp-wrap">
        <Item as="h2" id="lp-band" className="lp-h2 lp-head">Start anywhere.</Item>
        <Item as="p" className="lp-lead">Every one of these opens as a map. So does anything else with a Wikipedia article.</Item>
      </Reveal>
      <TopicRow topics={TOPICS_A} to={to} />
      <TopicRow topics={TOPICS_B} to={to} reverse />
    </section>
  );
};

/* ── five centuries of maps: a 3D fly-through ──────── */

const DEPTH = 900;
const FLY = [...PLATES, { tiresias: true, year: 'Today', caption: 'Tiresias, a map drawn from Wikipedia and Wikidata', note: 'Tiresias draws the same kind of map for any topic in seconds, and marks where every link came from.' }];
const OFFSET = [['-16%', 14], ['14%', -12], ['-12%', 10], ['15%', -12], ['0%', 0]];

const FlyPlate = ({ p, i, progress }) => {
  const n = FLY.length - 1;
  const z = useTransform(progress, (v) => v * n * DEPTH - i * DEPTH);
  const opacity = useTransform(z, [-3 * DEPTH, -1.6 * DEPTH, 0, 160, 340], [0, 0.55, 1, 1, 0]);
  // Gone entirely once it has passed the camera, so it never crosses the text column.
  const visibility = useTransform(z, (v) => (v > 340 || v < -3 * DEPTH ? 'hidden' : 'visible'));
  const [x, ry] = OFFSET[i];
  return (
    <motion.figure className="lp-fly-plate" style={{ z, opacity, visibility, x, rotateY: ry, zIndex: 10 + i }}>
      {p.tiresias ? <div className="lp-fly-ui"><FragMap /></div> : <img src={p.src} alt={p.alt} width={p.w} height={p.h} style={{ objectPosition: p.pos }} loading="lazy" />}
    </motion.figure>
  );
};

const History = () => {
  const reduce = useReducedMotion();
  const wide = useMedia('(min-width: 901px)');
  const fly = wide && !reduce;
  const ref = useRef(null);
  const [current, setCurrent] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  // Resistance: each picture holds still for the middle of its stretch of scroll and
  // only travels near the ends, so the camera feels like it is being pushed, not flung.
  const stepped = useTransform(scrollYProgress, (raw) => {
    const n = FLY.length - 1;
    const t = Math.min(Math.max((raw - 0.04) / 0.9, 0), 1) * n;
    const i = Math.min(Math.floor(t), n - 1);
    const f = t - i;
    const hold = 0.3; // the share of each stretch spent at rest
    const m = Math.min(Math.max((f - hold / 2) / (1 - hold), 0), 1);
    const eased = m * m * (3 - 2 * m); // smoothstep: soft start, soft stop
    return (i + eased) / n;
  });
  // ...and a heavy spring on top gives it weight and inertia.
  const progress = useSpring(stepped, { stiffness: 42, damping: 18, mass: 1.4, restDelta: 0.0005 });
  useMotionValueEvent(progress, 'change', (v) => fly && setCurrent(Math.round(v * (FLY.length - 1))));
  const p = FLY[current];

  if (!fly) {
    return (
      <section id="history" className="lp-section lp-wrap" aria-labelledby="lp-history">
        <Reveal>
          <Item as="h2" id="lp-history" className="lp-h2 lp-head">Knowledge has always been a map.</Item>
          <ol className="lp-history-list">
            {FLY.map((f) => (
              <Item as="li" key={f.year}>
                {f.tiresias ? <div className="lp-fly-ui"><FragMap /></div> : <img src={f.src} alt={f.alt} width={f.w} height={f.h} style={{ objectPosition: f.pos }} loading="lazy" />}
                <p className="lp-lead" style={{ margin: '16px 0 4px' }}>{f.year}</p>
                <p style={{ margin: 0 }}>{f.note}</p>
              </Item>
            ))}
          </ol>
        </Reveal>
      </section>
    );
  }

  return (
    <section id="history" ref={ref} className="lp-fly" aria-labelledby="lp-history">
      <div className="lp-fly-stage lp-wrap">
        <div className="lp-fly-text">
          <h2 id="lp-history" className="lp-h2 lp-head">Knowledge has always been a map.</h2>
          <motion.p key={`y${current}`} className="lp-fly-year" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>{p.year}</motion.p>
          <motion.p key={`n${current}`} className="lp-fly-note" aria-live="polite" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}>{p.note}</motion.p>
          <p className="lp-cap">{p.caption}</p>
        </div>
        <div className="lp-fly-view">
          <div className="lp-fly-space">
            {FLY.map((f, i) => <FlyPlate key={f.year} p={f} i={i} progress={progress} />)}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ── questions ─────────────────────────────────────── */

const FAQ = [
  ['Is Tiresias free?', 'Yes. You can map three topics a day without an account. A free account raises that to forty maps a day, and lets you save them, expand concepts and use the AI tutor.'],
  ['Where does the information come from?', 'Concepts and links come from Wikipedia and Wikidata. Research papers come from OpenAlex, pictures from Wikimedia Commons and videos from YouTube. Each one is credited where it appears.'],
  ['What does the AI do?', 'After the sources have drawn the map, Gemini may propose extra concepts. They appear with dotted lines, and the AI never moves or relabels anything that came from a source.'],
  ['How do I know which links to trust?', 'Look at the line. Solid means a Wikidata statement connects the two. Dashed means Wikipedia lists the articles as similar. Dotted means the AI suggested it.'],
  ['Can I share a map?', 'Save it to your library and create a read-only link. Anyone with the link can open the map, no account needed.'],
  ['What topics work?', 'Anything with an English Wikipedia article: a person, a place, a period, a science, an idea or a work of art.'],
];

const Questions = () => (
  <section id="faq" className="lp-section lp-wrap" aria-labelledby="lp-faq">
    <Reveal className="lp-grid">
      <Item className="lp-faq-head">
        <h2 id="lp-faq" className="lp-h2 lp-head">Questions, answered.</h2>
        <p className="lp-muted" style={{ marginTop: 20, maxWidth: '30ch' }}>Something else? Every map says where its facts came from, so you can always check the source.</p>
      </Item>
      <Reveal className="lp-faq-list">
        {FAQ.map(([q, a]) => (
          <Item key={q}>
            <details className="lp-faq">
              <summary><span>{q}</span><span className="lp-faq-mark" aria-hidden="true" /></summary>
              <p>{a}</p>
            </details>
          </Item>
        ))}
      </Reveal>
    </Reveal>
  </section>
);

/* ── page ──────────────────────────────────────────── */

const Landing = () => {
  const { isAuthenticated } = useAuth();
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="lp-wordmark" aria-label="Tiresias home"><Mark /> <span translate="no">Tiresias</span></Link>
        <nav className="lp-nav-links" aria-label="Primary">
          <a href="#showcase" className="lp-link lp-hide-sm">Examples</a>
          <a href="#how" className="lp-link lp-hide-sm">How it works</a>
          <a href="#sources" className="lp-link lp-hide-sm">Sources</a>
          <a href="#faq" className="lp-link lp-hide-sm">Questions</a>
          {isAuthenticated
            ? <Link to="/dashboard" className="lp-btn lp-btn-sm">Open app</Link>
            : <><Link to="/login" className="lp-link">Sign in</Link><Link to="/register" className="lp-btn lp-btn-sm">Create an account</Link></>}
        </nav>
      </header>
      <Hero isAuthenticated={isAuthenticated} />
      <TopicsBand isAuthenticated={isAuthenticated} />
      <Showcase isAuthenticated={isAuthenticated} />
      <HowItWorks />
      <History />
      <Sources />
      <Seer />
      <Questions />
      <Closing isAuthenticated={isAuthenticated} />
      <Footer isAuthenticated={isAuthenticated} />
    </div>
  );
};

export default Landing;
