import { useEffect, useRef } from 'react';

/**
 * Ambient atmosphere canvas — one engine, parameterized per knowledge mode.
 * Same component everywhere (unified design language); only motion, palette
 * and structure change with the atmosphere.
 *
 * kinds: constellation | neural | embers | molecules | aurora | runes | ledger
 */
const PRESETS = {
  constellation: { count: 60, speed: 0.12, link: 130, lineOp: 0.28, twinkle: true, rise: false, orbs: 0, size: [0.6, 1.7] },
  neural:        { count: 70, speed: 0.32, link: 150, lineOp: 0.35, twinkle: false, rise: false, orbs: 0, size: [0.7, 1.8], grid: 64 },
  cartography:   { count: 40, speed: 0.2,  link: 0,   lineOp: 0,    twinkle: true, rise: true,  orbs: 0, size: [0.7, 2.0], contours: true },
  molecules:     { count: 55, speed: 0.22, link: 95,  lineOp: 0.42, twinkle: false, rise: false, orbs: 0, size: [1.0, 2.4] },
  geometry:      { count: 45, speed: 0.14, link: 120, lineOp: 0.24, twinkle: true, rise: false, orbs: 3, size: [0.6, 1.7] },
  sacred:        { count: 60, speed: 0.1,  link: 140, lineOp: 0.3,  twinkle: true, rise: false, orbs: 2, size: [0.6, 2.0], rings: true },
  ledger:        { count: 36, speed: 0.22, link: 0,   lineOp: 0,    twinkle: false, rise: true,  orbs: 0, size: [0.6, 1.6], grid: 48, chart: true },
};
// Legacy names
PRESETS.embers = PRESETS.cartography;
PRESETS.aurora = PRESETS.geometry;
PRESETS.runes = PRESETS.sacred;

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const AmbientCanvas = ({ kind = 'constellation', colorA = '#a8c08c', colorB = '#d9b36a', className = '', still = false }) => {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const preset = PRESETS[kind] || PRESETS.constellation;
    const rgbA = hexToRgb(colorA);
    const rgbB = hexToRgb(colorB);
    // Decorative loop collapses to one static frame under reduced motion
    const reducedMotion = still || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0;
    let parts = [];
    let orbs = [];

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(preset.count, Math.floor((w * h) / 16000));
      parts = Array.from({ length: n }, () => spawn(true));
      orbs = Array.from({ length: preset.orbs }, (_, i) => ({
        x: Math.random() * w, y: Math.random() * h,
        r: 120 + Math.random() * 160,
        vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
        c: i % 2 === 0 ? rgbA : rgbB, ph: Math.random() * Math.PI * 2,
      }));
    };

    const spawn = (anywhere) => {
      const c = Math.random() < 0.6 ? rgbA : rgbB;
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 6,
        vx: (Math.random() - 0.5) * preset.speed,
        vy: preset.rise ? -(0.2 + Math.random() * preset.speed) : (Math.random() - 0.5) * preset.speed,
        r: preset.size[0] + Math.random() * (preset.size[1] - preset.size[0]),
        c, ph: Math.random() * Math.PI * 2, sp: 0.5 + Math.random() * 1.5,
      };
    };

    let t = 0;
    const frame = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      if (preset.grid) {
        ctx.strokeStyle = `rgba(${rgbA[0]},${rgbA[1]},${rgbA[2]},0.05)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x += preset.grid) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = 0; y < h; y += preset.grid) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
      }
      if (preset.contours) {
        // Cartographic contour lines drifting slowly
        ctx.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          const base = (h / 6) * k + 40;
          for (let x = 0; x <= w; x += 24) {
            const y = base + Math.sin(x / 140 + k * 1.7 + t * 0.15) * 26 + Math.sin(x / 61 + k) * 8;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${rgbA[0]},${rgbA[1]},${rgbA[2]},0.05)`;
          ctx.stroke();
        }
      }
      if (preset.rings) {
        // Sacred geometry: slow concentric rings + hexagram near the top-right
        const cx = w * 0.82; const cy = h * 0.18;
        ctx.lineWidth = 1;
        for (let r = 60; r < 360; r += 60) {
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${rgbB[0]},${rgbB[1]},${rgbB[2]},0.045)`; ctx.stroke();
        }
        for (let tri = 0; tri < 2; tri++) {
          ctx.beginPath();
          for (let i = 0; i <= 3; i++) {
            const a = t * 0.02 + tri * Math.PI / 3 + (i * 2 * Math.PI) / 3;
            const x = cx + Math.cos(a) * 180; const y = cy + Math.sin(a) * 180;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${rgbB[0]},${rgbB[1]},${rgbB[2]},0.06)`; ctx.stroke();
        }
      }
      if (preset.chart) {
        // Faint financial line drifting along the lower third
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const y = h * 0.72 - Math.sin(x / 180 + t * 0.2) * 34 - Math.sin(x / 47 + t * 0.35) * 10 - (x / w) * 60;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${rgbB[0]},${rgbB[1]},${rgbB[2]},0.09)`; ctx.lineWidth = 1.4; ctx.stroke();
      }

      for (const o of orbs) {
        o.x += o.vx; o.y += o.vy; o.ph += 0.005;
        if (o.x < -o.r) o.x = w + o.r; if (o.x > w + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = h + o.r; if (o.y > h + o.r) o.y = -o.r;
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        const op = 0.10 + Math.sin(o.ph) * 0.03;
        g.addColorStop(0, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},${op})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
      }

      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.ph += 0.02 * p.sp;
        if (preset.rise && p.y < -8) Object.assign(p, spawn(false));
        else {
          if (p.x < -8) p.x = w + 8; if (p.x > w + 8) p.x = -8;
          if (p.y < -8) p.y = h + 8; if (p.y > h + 8) p.y = -8;
        }
        const a = preset.twinkle ? 0.35 + Math.abs(Math.sin(p.ph)) * 0.65 : 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
        ctx.fill();
      }

      if (preset.link > 0) {
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const dx = parts[i].x - parts[j].x, dy = parts[i].y - parts[j].y;
            const d = Math.hypot(dx, dy);
            if (d < preset.link) {
              ctx.beginPath();
              ctx.moveTo(parts[i].x, parts[i].y);
              ctx.lineTo(parts[j].x, parts[j].y);
              ctx.strokeStyle = `rgba(${rgbA[0]},${rgbA[1]},${rgbA[2]},${(1 - d / preset.link) * preset.lineOp})`;
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
      }
      raf = reducedMotion ? 0 : requestAnimationFrame(frame);
    };

    resize();
    frame();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    // Pause the loop offscreen or when the tab hides — no GPU burn
    const io = new IntersectionObserver(([entry]) => {
      if (reducedMotion) return;
      if (entry.isIntersecting) { if (!raf) frame(); }
      else { cancelAnimationFrame(raf); raf = 0; }
    });
    if (canvas.parentElement) io.observe(canvas.parentElement);
    const onVis = () => {
      if (reducedMotion) return;
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) frame();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [kind, colorA, colorB, still]);

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true" />;
};

export default AmbientCanvas;
