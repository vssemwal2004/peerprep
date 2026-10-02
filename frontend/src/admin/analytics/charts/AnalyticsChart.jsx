import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Radar, RadarChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";

const COLORS = ["#0284c7", "#7c3aed", "#059669", "#d97706", "#e11d48", "#0891b2"];
const GRID = "#cbd5e1";

const asRows = (payload) => Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.data?.rows) ? payload.data.rows : Array.isArray(payload?.data?.items) ? payload.data.items : Array.isArray(payload?.data?.points) ? payload.data.points : [];
const labelOf = (row, labelKey) => row?.[labelKey] ?? row.label ?? row.name ?? row.topic ?? row.studentName ?? row.title ?? row.subject ?? row.band ?? row.group ?? row.date ?? row.bucket ?? row.stage ?? "";
const numericKeys = (rows) => {
  const ignored = new Set(["id", "label", "name", "topic", "student", "studentName", "date", "bucket", "stage", "color"]);
  return [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !ignored.has(key) && typeof row[key] === "number")))];
};
const seriesKeys = (payload, fallback = []) => {
  const series = payload?.config?.series;
  if (!Array.isArray(series) || !series.length) return fallback;
  return series.map((item) => typeof item === "string" ? item : item.key).filter(Boolean);
};
const seriesLabel = (payload, key) => {
  const series = payload?.config?.series;
  const match = Array.isArray(series) ? series.find((item) => typeof item === "object" && item.key === key) : null;
  return match?.label || key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
};
const formatTick = (value) => String(value).length > 15 ? `${String(value).slice(0, 13)}…` : value;

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="max-w-56 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95"><p className="mb-2 font-black text-slate-800 dark:text-white">{label}</p>{payload.map((item) => <div key={`${item.name}-${item.value}`} className="mt-1 flex items-center justify-between gap-5"><span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span><span className="font-bold text-slate-800 dark:text-slate-100">{Number(item.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span></div>)}</div>;
}

function EmptyChart() {
  return <div className="flex h-[248px] items-center justify-center text-xs text-slate-400">No chart-ready evidence returned.</div>;
}

function Trend({ payload }) {
  const rows = asRows(payload); const keys = seriesKeys(payload, numericKeys(rows).slice(0, 5));
  if (!rows.length || !keys.length) return <EmptyChart />;
  return <ResponsiveContainer width="100%" height={268}><LineChart data={rows} margin={{ top: 10, right: 14, left: -16, bottom: 2 }}><CartesianGrid stroke={GRID} strokeOpacity={0.28} vertical={false} /><XAxis dataKey={(row) => labelOf(row, payload.config?.labelKey)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />{keys.map((key, index) => <Line key={key} type="monotone" dataKey={key} name={seriesLabel(payload, key)} stroke={COLORS[index % COLORS.length]} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} connectNulls />)}</LineChart></ResponsiveContainer>;
}

function Ranking({ payload }) {
  const rows = asRows(payload); const key = payload.config?.valueKey || numericKeys(rows)[0];
  if (!rows.length || !key) return <EmptyChart />;
  return <div className="overflow-x-auto"><div style={{ height: Math.max(252, rows.length * 34), minWidth: 500 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ left: 4, right: 24 }}><CartesianGrid stroke={GRID} strokeOpacity={0.25} horizontal={false} /><XAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" width={120} dataKey={(row) => labelOf(row)} tickFormatter={formatTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey={key} name={payload.config?.valueLabel || key} radius={[0, 6, 6, 0]} fill="#0284c7" /></BarChart></ResponsiveContainer></div></div>;
}

function Heatmap({ payload }) {
  const data = payload.data || {}; const rows = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : [];
  const columns = (Array.isArray(data) ? payload.config?.topics : data.columns) || [...new Set(rows.flatMap((row) => (row.cells || row.values || []).map((cell) => cell.topic || cell.label)))];
  if (!rows.length || !columns.length) return <EmptyChart />;
  const color = (value) => value == null ? "rgba(148,163,184,.12)" : value >= 75 ? "rgba(5,150,105,.8)" : value >= 50 ? "rgba(14,165,233,.7)" : value >= 25 ? "rgba(245,158,11,.7)" : "rgba(225,29,72,.68)";
  return <div className="overflow-auto pb-2"><div className="grid min-w-max gap-1" style={{ gridTemplateColumns: `140px repeat(${columns.length}, minmax(72px, 1fr))` }}><div />{columns.map((column) => <div key={column} className="truncate px-1 py-2 text-center text-[10px] font-bold text-slate-500" title={column}>{column}</div>)}{rows.flatMap((row) => { const cells = row.cells || row.values || columns.map((column) => ({ topic: column, value: row[column] })); return [<div key={`${labelOf(row)}-label`} className="flex items-center truncate pr-2 text-xs font-bold text-slate-600 dark:text-slate-300">{labelOf(row)}</div>, ...columns.map((column) => { const cell = cells.find((item) => (item.topic || item.label) === column) || {}; return <div key={`${labelOf(row)}-${column}`} title={`${labelOf(row)} · ${column}: ${cell.value == null ? "No evidence" : `${cell.value}%`}`} className="flex h-9 items-center justify-center rounded-md text-[10px] font-black text-white" style={{ background: color(cell.value) }}>{cell.value == null ? "—" : Math.round(cell.value)}</div>; })]; })}</div><div className="mt-4 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-400">{[["Strong", "#059669"], ["Developing", "#0ea5e9"], ["Watch", "#f59e0b"], ["Risk", "#e11d48"], ["No evidence", "#cbd5e1"]].map(([label, colorValue]) => <span key={label} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded" style={{ background: colorValue }} />{label}</span>)}</div></div>;
}

function MultiBar({ payload, stacked = false, horizontal = false, defaultKeys = [] }) {
  let rows = asRows(payload); let keys = seriesKeys(payload, defaultKeys.filter((key) => rows.some((row) => Number.isFinite(row[key]))));
  if (stacked && payload.config?.stackBy === "difficulty") {
    const values = new Map();
    rows.forEach((row) => { const current = values.get(labelOf(row)) || { topic: labelOf(row) }; current[row.difficulty] = row.successRate; values.set(labelOf(row), current); });
    rows = [...values.values()]; keys = ["Easy", "Medium", "Hard", "easy", "medium", "hard"].filter((key) => rows.some((row) => Number.isFinite(row[key])));
  }
  if (!rows.length || !keys.length) return <EmptyChart />;
  const height = horizontal ? Math.max(252, rows.length * 34) : 268;
  return <div className="overflow-x-auto"><div style={{ height, minWidth: Math.max(520, rows.length * 70) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 16 : -12, right: 20, bottom: horizontal ? 0 : 16 }}><CartesianGrid stroke={GRID} strokeOpacity={0.25} vertical={!horizontal} horizontal={horizontal} />{horizontal ? <><XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey={(row) => labelOf(row, payload.config?.labelKey)} width={125} tickFormatter={formatTick} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /></> : <><XAxis dataKey={(row) => labelOf(row, payload.config?.labelKey)} tickFormatter={formatTick} tick={{ fontSize: 10 }} angle={rows.length > 6 ? -22 : 0} textAnchor={rows.length > 6 ? "end" : "middle"} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /></>}<Tooltip content={<ChartTooltip />} />{keys.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />}{keys.map((key, index) => <Bar key={key} dataKey={key} name={seriesLabel(payload, key)} stackId={stacked ? "stack" : undefined} fill={COLORS[index % COLORS.length]} radius={stacked ? undefined : [5, 5, 0, 0]} maxBarSize={36} />)}</BarChart></ResponsiveContainer></div></div>;
}

function SkillRadar({ payload }) {
  const rows = asRows(payload); const key = payload.config?.valueKey || numericKeys(rows)[0];
  if (rows.length < 3 || !key) return <EmptyChart />;
  return <ResponsiveContainer width="100%" height={276}><RadarChart data={rows} outerRadius="70%"><PolarGrid stroke={GRID} strokeOpacity={0.45} /><PolarAngleAxis dataKey={(row) => labelOf(row)} tick={{ fontSize: 10 }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} /><Tooltip content={<ChartTooltip />} /><Radar dataKey={key} name={payload.config?.valueLabel || "Score"} stroke="#7c3aed" fill="#8b5cf6" fillOpacity={0.28} strokeWidth={2.25} /></RadarChart></ResponsiveContainer>;
}

function Funnel({ payload }) {
  const rows = asRows(payload); if (!rows.length) return <EmptyChart />;
  const max = Math.max(...rows.map((row) => Number(row.value ?? row.count ?? 0)), 1);
  return <div className="mx-auto max-w-4xl space-y-1.5 py-2">{rows.map((row, index) => { const value = Number(row.value ?? row.count ?? 0); return <div key={labelOf(row)} className="grid grid-cols-[82px_1fr_58px] items-center gap-2.5"><span className="text-right text-[11px] font-bold text-slate-600 dark:text-slate-300">{labelOf(row)}</span><div className="flex justify-center"><div className="flex h-8 items-center justify-center rounded-md bg-gradient-to-r from-sky-600 to-indigo-500 text-[11px] font-black text-white transition-all" style={{ width: `${Math.max(16, (value / max) * 100)}%`, opacity: 1 - index * 0.08 }}>{row.rate != null ? `${Number(row.rate).toFixed(0)}%` : ""}</div></div><span className="text-[11px] font-black text-slate-800 dark:text-white">{value.toLocaleString()}</span></div>; })}</div>;
}

function AssessmentTrend({ payload }) {
  const rows = asRows(payload); const keys = seriesKeys(payload, ["average", "median", "participationRate"].filter((key) => rows.some((row) => Number.isFinite(row[key]))));
  if (!rows.length || !keys.length) return <EmptyChart />;
  return <ResponsiveContainer width="100%" height={268}><ComposedChart data={rows} margin={{ top: 10, right: 14, left: -16, bottom: 3 }}><CartesianGrid stroke={GRID} strokeOpacity={0.25} vertical={false} /><XAxis dataKey={(row) => labelOf(row)} tickFormatter={formatTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={[0, "auto"]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />{keys.map((key, index) => index === keys.length - 1 && key.toLowerCase().includes("count") ? <Bar key={key} dataKey={key} fill={COLORS[index]} opacity={0.35} /> : <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index]} strokeWidth={2.25} dot={{ r: 2.5 }} />)}</ComposedChart></ResponsiveContainer>;
}

function Calendar({ payload }) {
  const rows = asRows(payload); if (!rows.length) return <EmptyChart />;
  const max = Math.max(...rows.map((row) => Number(row.value ?? row.count ?? row.activeStudents ?? 0)), 1);
  return <div className="overflow-x-auto pb-2"><div className="grid min-w-[720px] grid-flow-col grid-rows-7 gap-1 py-3">{rows.map((row) => { const value = Number(row.value ?? row.count ?? row.activeStudents ?? 0); const opacity = value ? 0.22 + (value / max) * 0.78 : 0.08; return <div key={row.date || labelOf(row)} title={`${row.date || labelOf(row)}: ${value} active students`} className="h-4 w-4 rounded-[4px] bg-sky-600" style={{ opacity }} />; })}</div><div className="flex items-center justify-end gap-1 text-[10px] text-slate-400">Less {[.12, .3, .5, .75, 1].map((opacity) => <span key={opacity} className="h-3 w-3 rounded-[3px] bg-sky-600" style={{ opacity }} />)} More</div></div>;
}

function ScoreScatter({ payload }) {
  const rows = asRows(payload); const keys = numericKeys(rows); const x = payload.config?.xKey || (rows.some((row) => Number.isFinite(row.effort)) ? "effort" : keys[0]); const y = payload.config?.yKey || (rows.some((row) => Number.isFinite(row.score)) ? "score" : keys[1]);
  if (rows.length < 1 || !x || !y) return <EmptyChart />;
  return <ResponsiveContainer width="100%" height={268}><ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: -10 }}><CartesianGrid stroke={GRID} strokeOpacity={0.25} /><XAxis type="number" dataKey={x} name={payload.config?.xLabel || x} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="number" dataKey={y} name={payload.config?.yLabel || y} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltip />} /><Scatter data={rows} name="Students" fill="#0284c7">{rows.map((row, index) => <Cell key={row.id || index} fill={row.isOutlier ? "#e11d48" : "#0284c7"} />)}</Scatter></ScatterChart></ResponsiveContainer>;
}

export default function AnalyticsChart({ definition, payload }) {
  const renderer = definition.renderer;
  if (renderer === "trend") return <Trend payload={payload} />;
  if (renderer === "ranking") return <Ranking payload={payload} />;
  if (renderer === "heatmap") return <Heatmap payload={payload} />;
  if (renderer === "difficulty") return <MultiBar payload={payload} stacked defaultKeys={["easy", "medium", "hard"]} />;
  if (renderer === "topic") return <MultiBar payload={payload} horizontal defaultKeys={["rate"]} />;
  if (renderer === "assessmentTopic") return <MultiBar payload={payload} horizontal defaultKeys={["score", "participationRate"]} />;
  if (renderer === "distribution") return <MultiBar payload={payload} defaultKeys={["count"]} />;
  if (renderer === "comparison") return <MultiBar payload={payload} defaultKeys={["value"]} />;
  if (renderer === "hierarchy") return <MultiBar payload={payload} horizontal defaultKeys={["completionRate", "engagementRate"]} />;
  if (renderer === "conversion") return <MultiBar payload={payload} horizontal defaultKeys={["conversionRate"]} />;
  if (renderer === "radar") return <SkillRadar payload={payload} />;
  if (renderer === "funnel") return <Funnel payload={payload} />;
  if (renderer === "assessmentTrend") return <AssessmentTrend payload={payload} />;
  if (renderer === "calendar") return <Calendar payload={payload} />;
  if (renderer === "scatter") return <ScoreScatter payload={payload} />;
  return <EmptyChart />;
}
