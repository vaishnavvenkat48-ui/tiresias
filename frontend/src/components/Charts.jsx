import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { usePrefs } from '../context/PrefsContext';

/*
 * Chart conventions (see dataviz method):
 *  - Multi-series identity uses the validated categorical order below
 *    in the sand-and-moss identity: moss, brass and a muted river blue (distinct in lightness as well as hue).
 *  - Single-series magnitude uses the active mode accent (one hue).
 *  - Text stays in text tokens; grids are hairlines; 2px lines; legends for ≥2 series.
 */
export const SERIES_BY_THEME = {
  dark: ['#a8c08c', '#d9b36a', '#8fb5c9'], // on the charcoal surface #262622
  light: ['#4f6238', '#8a6414', '#2f6b86'], // on the sand surface #e3dccd
};
const CHROME = {
  dark: { ink: '#bbb5a5', grid: 'rgba(255,246,225,0.06)', cursor: 'rgba(255,246,225,0.12)', ring: '#262622', band: 'rgba(255,246,225,0.04)' },
  light: { ink: '#4f4d45', grid: 'rgba(42,42,38,0.09)', cursor: 'rgba(42,42,38,0.18)', ring: '#e3dccd', band: 'rgba(42,42,38,0.05)' },
};
const useChartTheme = () => {
  const { theme } = usePrefs();
  return { series: SERIES_BY_THEME[theme] || SERIES_BY_THEME.dark, ...(CHROME[theme] || CHROME.dark) };
};

const TooltipBox = ({ active, payload, label, labelFormat, unit = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="surface-sm px-3 py-2 text-[12px]">
      <p className="mb-1 font-medium text-fg">{labelFormat ? labelFormat(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-fg-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium tabular-nums text-fg">{p.value}{unit}</span>
        </p>
      ))}
    </div>
  );
};

const Legend = ({ items }) => (
  <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2" aria-label="Legend">
    {items.map(([name, color]) => (
      <li key={name} className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded-full" style={{ background: color }} />{name}</li>
    ))}
  </ul>
);

const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Daily activity — searches / expansions / AI questions. */
export const ActivityChart = ({ data, height = 240 }) => {
  const { reducedMotion } = usePrefs();
  const t = useChartTheme();
  const series = [['Topic searches', 'searches'], ['Node expansions', 'expansions'], ['AI questions', 'ai']];
  return (
    <div>
      <Legend items={series.map(([n], i) => [n, t.series[i]])} />
      <div role="img" aria-label="Line chart of daily searches, node expansions and AI questions">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: t.ink, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis allowDecimals={false} tick={{ fill: t.ink, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<TooltipBox labelFormat={shortDay} />} cursor={{ stroke: t.cursor, strokeWidth: 1 }} />
            {series.map(([name, key], i) => (
              <Line key={key} type="monotone" dataKey={key} name={name} stroke={t.series[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: t.ring }} isAnimationActive={!reducedMotion} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/** Hour-of-day exploration pattern — single series, mode accent. */
export const HoursChart = ({ data, height = 200 }) => {
  const { palette } = usePrefs();
  const t = useChartTheme();
  const { reducedMotion } = usePrefs();
  const fmt = (h) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div role="img" aria-label="Bar chart of activity by hour of day">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 4, left: -22, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="hour" tickFormatter={(h) => (h % 6 === 0 ? fmt(h) : '')} interval={0} tick={{ fill: t.ink, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: t.ink, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<TooltipBox labelFormat={fmt} />} cursor={{ fill: t.band }} />
          <Bar dataKey="count" name="Events" fill={palette.accent} radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Ranked horizontal bars in plain HTML — direct-labelled, accessible, and the
 * right form for "which is largest" over a handful of categories.
 */
export const BarList = ({ items, unit = '', empty = 'No data yet.', onSelect }) => {
  if (!items?.length) return <p className="text-[13px] text-fg-3">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        const row = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-fg">{it.name}</span>
              <span className="shrink-0 tabular-nums text-fg-2">{it.value}{unit}</span>
            </div>
            <div className="progress !h-[7px]"><span style={{ width: `${(it.value / max) * 100}%` }} /></div>
          </>
        );
        return (
          <li key={it.name}>
            {onSelect ? <button type="button" className="block w-full rounded-[8px] text-left hover:opacity-90" onClick={() => onSelect(it)}>{row}</button> : row}
          </li>
        );
      })}
    </ul>
  );
};
