import { memo } from 'react';
import { useStore } from '@xyflow/react';

/** Point where the ray from a node's centre toward (tx,ty) leaves its rectangle. */
const borderPoint = (cx, cy, w, h, tx, ty, gap = 4) => {
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? (w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (h / 2 + gap) / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
};

const curve = (a, b, related) => {
  const [scx, scy, sw, sh] = a;
  const [tcx, tcy, tw, th] = b;
  const [sx, sy] = borderPoint(scx, scy, sw, sh, tcx, tcy);
  const [tx, ty] = borderPoint(tcx, tcy, tw, th, scx, scy);
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(36, len * 0.12) * (related ? -1 : 1); // gentle, organic bow
  const cx = (sx + tx) / 2 - (dy / len) * bow;
  const cy = (sy + ty) / 2 + (dx / len) * bow;
  return { d: `M${sx.toFixed(1)},${sy.toFixed(1)}Q${cx.toFixed(1)},${cy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`, sx, sy, tx, ty };
};

/** Line style encodes provenance: solid = verified, dashed = related by search, dotted = AI. */
const provClass = (p) => (p === 'ai_suggested' ? 'prov-ai' : p === 'search_related' ? 'prov-search' : 'prov-verified');

const selTransform = (s) => s.transform;
const selNodes = (s) => s.nodes;
const selLookup = (s) => s.nodeLookup;

/**
 * All graph edges in one SVG, synced to the React Flow viewport.
 *
 * Performance: resting edges of the same style are merged into ONE <path>
 * (a single paint op), so physics frames repaint ~3 elements instead of one
 * element per edge. Only the few highlighted / newly-created edges are drawn
 * individually (gradient stroke, draw-in animation).
 *
 * Nodes use nodeOrigin [0.5, 0.5], so node.position is the node centre.
 */
const EdgeLayer = ({ edges }) => {
  const [x, y, zoom] = useStore(selTransform);
  useStore(selNodes); // re-render whenever node positions change
  const lookup = useStore(selLookup);

  const box = (id) => {
    const n = lookup.get(id);
    if (!n) return null;
    return [n.position.x, n.position.y, n.measured?.width ?? 120, n.measured?.height ?? 34];
  };

  // One merged <path> per visual style: kind (branch vs cross-link) × provenance × dimmed
  const groups = new Map();
  const special = [];
  for (const e of edges) {
    const a = box(e.source);
    const b = box(e.target);
    if (!a || !b) continue;
    const related = e.kind === 'related';
    const c = curve(a, b, related);
    if (e.state === 'is-hl' || e.isNew) { special.push({ ...e, ...c, related }); continue; }
    const cls = `kg-edge kind-${related ? 'related' : 'subtopic'} ${provClass(e.prov)}${e.state === 'is-dim' ? ' is-dim' : ''}`;
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls).push(c.d);
  }

  return (
    <svg className="kg-edges pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <g transform={`translate(${x},${y}) scale(${zoom})`}>
        {[...groups].map(([cls, ds]) => <path key={cls} className={cls} d={ds.join('')} />)}
        {special.map((e) => {
          const gid = `kg-g-${e.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const hot = e.state === 'is-hl';
          return (
            <g key={e.id}>
              {hot && (
                <defs>
                  <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={e.sx} y1={e.sy} x2={e.tx} y2={e.ty}>
                    <stop offset="0%" style={{ stopColor: e.related ? 'var(--accent-2)' : 'var(--accent)', stopOpacity: 0.95 }} />
                    <stop offset="100%" style={{ stopColor: e.related ? 'var(--accent-2)' : 'var(--accent-3)', stopOpacity: 0.7 }} />
                  </linearGradient>
                </defs>
              )}
              <path
                d={e.d}
                className={`kg-edge kind-${e.related ? 'related' : 'subtopic'} ${provClass(e.prov)}${hot ? ' is-hl' : ''}${e.isNew ? ' is-new' : ''}`}
                style={hot ? { stroke: `url(#${gid})` } : undefined}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export default memo(EdgeLayer);
