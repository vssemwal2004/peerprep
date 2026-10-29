import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ReferenceArea, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { useEffect, useRef, useState } from "react";
import { useIsDark } from "./useIsDark";
import { PACE } from "./reportModel";

// Recharts pieces of the Analysis tab, loaded on demand (React.lazy) so the report page does not carry the
// chart library until the tab opens. "Your score" is the brand blue; the cohort average is orange and
// dashed (blue / orange stays distinct for colour-blind readers, and the legend names both).

export const SERIES = Object.freeze({
  light: { you: "#0284c7", cohort: "#ea580c", grid: "#e2e8f0", axis: "#64748b", ink: "#0f172a", surface: "#ffffff", band: "#10b981" },
  dark: { you: "#0891d4", cohort: "#ea580c", grid: "rgba(255,255,255,0.1)", axis: "#a1a1aa", ink: "#fafafa", surface: "#242424", band: "#34d399" },
});

function TooltipBox({ title, rows }) {
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-[#2e2e2e]">
    {title && <p className="mb-1 max-w-[16rem] font-semibold text-slate-900 dark:text-zinc-50">{title}</p>}
    {rows.map(([label, value, color]) => <p key={label} className="flex items-center gap-2 tabular-nums text-slate-600 dark:text-zinc-300">
      {color && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />}{label}<span className="ml-auto pl-3 font-semibold text-slate-900 dark:text-zinc-50">{value}</span>
    </p>)}
  </div>;
}

/** Short axis labels: long skill names wrap onto two lines. */
function AngleTick({ x, y, textAnchor, payload, color, narrow = false }) {
  const max = narrow ? 12 : 14;
  // On phones a long single word (Professionalism) breaks with a hyphen so it fits beside the chart.
  const words = String(payload.value).split(" ").flatMap((word) => (narrow && word.length > max ? [`${word.slice(0, max - 1)}-`, word.slice(max - 1)] : [word]));
  const lines = [];
  for (const word of words) {
    if (lines.length && !lines.at(-1).endsWith("-") && `${lines.at(-1)} ${word}`.length <= max) lines[lines.length - 1] = `${lines.at(-1)} ${word}`;
    else lines.push(word);
  }
  return <text x={x} y={y} textAnchor={textAnchor} fill={color} fontSize={narrow ? 9.5 : 11} fontWeight={600}>
    {lines.slice(0, 2).map((line, index) => <tspan key={line} x={x} dy={index ? 13 : lines.length > 1 ? -4 : 4}>{line}</tspan>)}
  </text>;
}

/** The element's width (ResizeObserver), so the radar leaves room for its labels on narrow screens. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function RadarPlot({ rows, cohort = false, label }) {
  const c = SERIES[useIsDark() ? "dark" : "light"];
  const [ref, width] = useWidth();
  // Room on each side for the axis labels (less on phones, where long labels wrap); never taller than the plot.
  const narrow = width > 0 && width < 400;
  const radius = width ? Math.max(48, Math.min(112, (width - (narrow ? 120 : 184)) / 2)) : 100;
  return <div ref={ref} className="h-72 w-full [&_svg]:overflow-visible" style={narrow ? { height: Math.round(radius * 2 + 64) } : undefined} role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={rows} outerRadius={radius} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <PolarGrid stroke={c.grid} />
        <PolarAngleAxis dataKey="label" tick={(props) => <AngleTick {...props} color={c.axis} narrow={narrow} />} />
        <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={false} axisLine={false} />
        {cohort && <Radar name="Cohort average" dataKey="cohort" stroke={c.cohort} strokeWidth={2} strokeDasharray="5 4" fill={c.cohort} fillOpacity={0.06} isAnimationActive={false} />}
        <Radar name="Your score" dataKey="you" stroke={c.you} strokeWidth={2} fill={c.you} fillOpacity={0.18} dot={{ r: 3.5, fill: c.you, stroke: c.surface, strokeWidth: 1.5 }} isAnimationActive={false} />
        <Tooltip cursor={false} content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={payload[0].payload.label}
          rows={payload.map((entry) => [entry.name, `${entry.value}%`, entry.color])} /> : null)} />
      </RadarChart>
    </ResponsiveContainer>
  </div>;
}

export function PacePlot({ rows, onSelect }) {
  const c = SERIES[useIsDark() ? "dark" : "light"];
  const low = Math.max(0, Math.floor(Math.min(PACE.min - 30, ...rows.map((row) => row.wpm - 15)) / 10) * 10);
  const high = Math.ceil(Math.max(PACE.max + 30, ...rows.map((row) => row.wpm + 15)) / 10) * 10;
  return <div className="h-60 w-full" role="img" aria-label={`Speaking pace by question: ${rows.map((row) => `${row.label} ${row.wpm} words a minute`).join(", ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <ReferenceArea y1={PACE.min} y2={PACE.max} fill={c.band} fillOpacity={0.1} stroke="none" ifOverflow="extendDomain" />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: c.grid }} tick={{ fill: c.axis, fontSize: 11 }} />
        <YAxis domain={[low, high]} ticks={[low, PACE.min, PACE.max, high]} tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} width={44} />
        <Tooltip cursor={{ stroke: c.grid }} content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={payload[0].payload.label}
          rows={[["Pace", `${payload[0].payload.wpm} wpm`, c.you], ["", payload[0].payload.pace?.label || ""]]} /> : null)} />
        <Line type="linear" dataKey="wpm" stroke={c.you} strokeWidth={2} isAnimationActive={false}
          dot={{ r: 4.5, fill: c.you, stroke: c.surface, strokeWidth: 2, cursor: "pointer" }}
          activeDot={{ r: 6, fill: c.you, stroke: c.surface, strokeWidth: 2, cursor: "pointer", onClick: (_, entry) => onSelect?.(entry?.payload?.index ?? rows[entry?.index]?.index) }} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export function FillerPlot({ rows, onSelect }) {
  const c = SERIES[useIsDark() ? "dark" : "light"];
  return <div className="h-60 w-full" role="img" aria-label={`Filler words by question: ${rows.map((row) => `${row.label} ${row.count}`).join(", ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: -20 }} barCategoryGap="32%">
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: c.grid }} tick={{ fill: c.axis, fontSize: 11 }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} width={44} />
        <Tooltip cursor={{ fill: c.grid, fillOpacity: 0.5 }} content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={payload[0].payload.label}
          rows={[["Filler words", payload[0].payload.count, c.you], ...(payload[0].payload.rate !== null ? [["Per 100 words", payload[0].payload.rate]] : [])]} /> : null)} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} cursor="pointer" onClick={(_, position) => onSelect?.(rows[position]?.index)}>
          {rows.map((row) => <Cell key={row.key} fill={c.you} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
