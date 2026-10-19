import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MODULE_META, formatNumber, shortDay } from './overviewModel';

const axis = { fontSize: 11, fill: '#94a3b8' };

function TooltipCard({ active, payload, label, labelFormatter = shortDay }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
      <p className="mb-1 font-semibold text-slate-900 dark:text-white">{labelFormatter(label)}</p>
      {payload.map((row) => (
        <p key={row.dataKey} className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />{row.name}</span>
          <span className="font-semibold tabular-nums">{formatNumber(row.value)}</span>
        </p>
      ))}
      {payload.length > 1 ? <p className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-900 dark:border-white/10 dark:text-white"><span>Total</span><span>{formatNumber(total)}</span></p> : null}
    </div>
  );
}

// Stacked daily activity per module. Legend chips hide or show a series.
export function ActivityTrendChart({ data = [], series = [], height = 260 }) {
  const [hidden, setHidden] = useState(() => new Set());
  const visible = series.filter((key) => !hidden.has(key));
  const toggle = (key) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else if (series.length - next.size > 1) next.add(key);
    return next;
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {series.map((key) => (
          <button key={key} type="button" aria-pressed={!hidden.has(key)} onClick={() => toggle(key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${hidden.has(key) ? 'text-slate-400 ring-slate-200 dark:ring-white/10' : MODULE_META[key].soft}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hidden.has(key) ? '#cbd5e1' : MODULE_META[key].color }} />
            {MODULE_META[key].label}
          </button>
        ))}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              {series.map((key) => (
                <linearGradient key={key} id={`trend-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MODULE_META[key].color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={MODULE_META[key].color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
            <XAxis dataKey="date" tickFormatter={shortDay} tick={axis} axisLine={false} tickLine={false} minTickGap={18} />
            <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<TooltipCard />} cursor={{ stroke: '#0284c7', strokeOpacity: 0.25 }} />
            {visible.map((key) => (
              <Area key={key} type="monotone" dataKey={key} name={MODULE_META[key].label} stackId="activity"
                stroke={MODULE_META[key].color} strokeWidth={2} fill={`url(#trend-${key})`} animationDuration={600} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Ring with a centred headline value; slices are [{ label, value, color }].
export function DonutChart({ slices = [], centre, caption, size = 148 }) {
  const total = slices.reduce((sum, slice) => sum + (Number(slice.value) || 0), 0);
  const data = total ? slices : [{ label: 'None', value: 1, color: '#e2e8f0' }];
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="100%" paddingAngle={total ? 2 : 0} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
              {data.map((slice) => <Cell key={slice.label} fill={slice.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-semibold text-slate-950 dark:text-white">{centre}</span>
          {caption ? <span className="text-[10px] text-slate-500 dark:text-slate-400">{caption}</span> : null}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-slate-600 dark:text-slate-300"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} /><span className="truncate">{slice.label}</span></span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{formatNumber(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Vertical bars for a distribution, e.g. score bands. bars = [{ label, value }].
export function BandChart({ bars = [], color = '#0284c7', height = 170, unit = 'students' }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={44} />
          <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload, label }) => (active && payload?.length
            ? <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-slate-900/95"><p className="font-semibold text-slate-900 dark:text-white">{label}</p><p className="text-slate-600 dark:text-slate-300">{formatNumber(payload[0].value)} {unit}</p></div>
            : null)} />
          <Bar dataKey="value" radius={[8, 8, 2, 2]} maxBarSize={46} fill={color} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Stacked daily bars for several series. series = [{ key, label, color }].
export function StackedBars({ data = [], series = [], height = 220 }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
          <XAxis dataKey="date" tickFormatter={shortDay} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<TooltipCard />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          {series.map((item, index) => (
            <Bar key={item.key} dataKey={item.key} name={item.label} stackId="stack" fill={item.color} maxBarSize={18}
              radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} animationDuration={600} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Horizontal comparison rows (no chart library needed). rows = [{ label, value, max?, color, hint }].
export function BarRows({ rows = [], format = formatNumber }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.max ?? row.value) || 0));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-slate-700 dark:text-slate-200">{row.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{row.hint ?? format(row.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(row.value ? 3 : 0, ((Number(row.value) || 0) / (Number(row.max) || max)) * 100)}%`, backgroundColor: row.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
