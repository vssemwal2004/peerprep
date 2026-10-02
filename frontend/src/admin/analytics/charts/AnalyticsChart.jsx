import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";

const COLORS = ["#0369a1", "#7c3aed", "#047857", "#b45309", "#be123c", "#0e7490"];
const GRID = "#cbd5e1";
const AXIS = "#64748b";
const axisTick = { fill: AXIS, fontSize: 10, fontWeight: 600 };
const axisLine = { stroke: "#94a3b8", strokeWidth: 1 };
const axisLabel = (value, position, angle = 0) => ({ value, position, angle, fill: "#475569", fontSize: 10, fontWeight: 700 });

const asRows = (payload) => Array.isArray(payload?.data)
  ? payload.data
  : Array.isArray(payload?.data?.rows)
    ? payload.data.rows
    : Array.isArray(payload?.data?.items)
      ? payload.data.items
      : Array.isArray(payload?.data?.points) ? payload.data.points : [];

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

const formatTick = (value, max = 16) => String(value).length > max ? `${String(value).slice(0, max - 1)}…` : value;
const isBoundedMetric = (definition) => definition.unit === "%" || definition.unit === "score";

function niceCeiling(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function numericDomain(rows, keys, definition) {
  if (isBoundedMetric(definition)) return [0, 100];
  const values = rows.flatMap((row) => keys.map((key) => Number(row[key]))).filter(Number.isFinite);
  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [min < 0 ? Math.floor(min * 1.08) : 0, niceCeiling(max * 1.08)];
}

function formatValue(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "—");
  const formatted = number.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return unit === "%" ? `${formatted}%` : formatted;
}

function tooltipUnit(item, defaultUnit) {
  const name = String(item?.name || "").toLowerCase();
  if (name.includes("event") || name.includes("student") || name.includes("attempt") || name.includes("completed") || name.includes("solved")) return "count";
  return defaultUnit;
}

function ChartTooltip({ active, payload, label, unit, title }) {
  if (!active || !payload?.length) return null;
  const resolvedLabel = label ?? payload[0]?.payload?.name ?? payload[0]?.payload?.label;
  return <div className="min-w-44 max-w-64 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-[11px] shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
    <p className="mb-1.5 border-b border-slate-100 pb-1.5 font-bold text-slate-800 dark:border-white/10 dark:text-white">{resolvedLabel || title}</p>
    {payload.map((item) => <div key={`${item.name}-${item.value}`} className="mt-1 flex items-center justify-between gap-5"><span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full" style={{ background: item.color || item.fill }} />{item.name}</span><span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatValue(item.value, tooltipUnit(item, unit))}</span></div>)}
  </div>;
}

function EmptyChart() {
  return <div className="flex h-[228px] items-center justify-center rounded-lg bg-slate-50 text-xs font-medium text-slate-400 dark:bg-white/[.02]">No chart-ready evidence returned.</div>;
}

function Trend({ definition, payload, expanded }) {
  const rows = asRows(payload);
  const keys = seriesKeys(payload, numericKeys(rows).slice(0, 5));
  if (!rows.length || !keys.length) return <EmptyChart />;
  const height = expanded ? 460 : 244;
  return <div className="overflow-x-auto"><div style={{ height, minWidth: expanded ? 760 : 470 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 10, right: 18, left: 8, bottom: 34 }}><CartesianGrid stroke={GRID} strokeOpacity={0.55} vertical={false} strokeDasharray="3 3" /><XAxis dataKey={(row) => labelOf(row, payload.config?.labelKey)} tick={axisTick} axisLine={axisLine} tickLine={axisLine} minTickGap={20} label={axisLabel(definition.xAxis, "insideBottom")} /><YAxis width={48} domain={numericDomain(rows, keys, definition)} tick={axisTick} axisLine={axisLine} tickLine={axisLine} allowDecimals={false} label={axisLabel(definition.yAxis, "insideLeft", -90)} /><Tooltip content={<ChartTooltip unit={definition.unit} title={definition.title} />} /><Legend verticalAlign="top" align="right" iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingBottom: 8 }} />{keys.map((key, index) => <Line key={key} type="monotone" dataKey={key} name={seriesLabel(payload, key)} stroke={COLORS[index % COLORS.length]} strokeWidth={2.25} dot={rows.length <= 12 ? { r: 2.5, fill: "white", strokeWidth: 2 } : false} activeDot={{ r: 4 }} connectNulls />)}</LineChart></ResponsiveContainer></div></div>;
}

function Ranking({ definition, payload, expanded }) {
  const rows = asRows(payload);
  const key = payload.config?.valueKey || numericKeys(rows)[0];
  if (!rows.length || !key) return <EmptyChart />;
  const viewportHeight = expanded ? Math.min(520, Math.max(340, rows.length * 34 + 62)) : 252;
  const chartHeight = Math.max(viewportHeight, rows.length * 32 + 60);
  return <div className="overflow-auto" style={{ maxHeight: viewportHeight }}><div style={{ height: chartHeight, minWidth: expanded ? 720 : 455 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 4, bottom: 30 }}><CartesianGrid stroke={GRID} strokeOpacity={0.55} horizontal={false} strokeDasharray="3 3" /><XAxis type="number" domain={numericDomain(rows, [key], definition)} tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={axisLabel(definition.xAxis, "insideBottom")} /><YAxis type="category" width={122} dataKey={(row) => labelOf(row)} tickFormatter={(value) => formatTick(value, 18)} tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={axisLabel(definition.yAxis, "insideLeft", -90)} /><Tooltip content={<ChartTooltip unit={definition.unit} title={definition.title} />} /><Bar dataKey={key} name={payload.config?.valueLabel || seriesLabel(payload, key)} radius={[0, 5, 5, 0]} fill={COLORS[0]} maxBarSize={20} /></BarChart></ResponsiveContainer></div></div>;
}

function Heatmap({ definition, payload, expanded }) {
  const data = payload.data || {};
  const rows = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : [];
  const columns = (Array.isArray(data) ? payload.config?.topics : data.columns) || [...new Set(rows.flatMap((row) => (row.cells || row.values || []).map((cell) => cell.topic || cell.label)))];
  if (!rows.length || !columns.length) return <EmptyChart />;
  const color = (value) => value == null ? "#e2e8f0" : value >= 75 ? "#047857" : value >= 50 ? "#0284c7" : value >= 25 ? "#d97706" : "#be123c";
  const viewportHeight = expanded ? 560 : 250;
  return <div className="overflow-auto" style={{ maxHeight: viewportHeight }}><div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-slate-500"><span className="text-violet-700">Y · {definition.yAxis}</span><span>↓</span><span className="ml-auto">{definition.xAxis} · X →</span></div><div className="grid min-w-max gap-1" style={{ gridTemplateColumns: `130px repeat(${columns.length}, minmax(64px, 1fr))` }}><div className="sticky left-0 top-0 z-20 bg-white dark:bg-gray-900" />{columns.map((column) => <div key={column} className="sticky top-0 z-10 truncate bg-white px-1 py-2 text-center text-[10px] font-bold text-slate-600 dark:bg-gray-900 dark:text-slate-300" title={column}>{column}</div>)}{rows.flatMap((row) => {
    const cells = row.cells || row.values || columns.map((column) => ({ topic: column, value: row[column] }));
    return [<div key={`${labelOf(row)}-label`} className="sticky left-0 z-10 flex items-center truncate bg-white pr-2 text-[10px] font-bold text-slate-700 dark:bg-gray-900 dark:text-slate-200">{labelOf(row)}</div>, ...columns.map((column) => {
      const cell = cells.find((item) => (item.topic || item.label) === column) || {};
      return <div key={`${labelOf(row)}-${column}`} title={`${labelOf(row)} · ${column}: ${cell.value == null ? "No evidence" : `${cell.value}%`}`} className="flex h-8 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: color(cell.value), color: cell.value == null ? "#64748b" : "white" }}>{cell.value == null ? "—" : Math.round(cell.value)}</div>;
    })];
  })}</div><div className="mt-3 flex flex-wrap gap-2.5 text-[9px] font-semibold text-slate-500">{[["Strong 75–100", "#047857"], ["Developing 50–74", "#0284c7"], ["Watch 25–49", "#d97706"], ["Risk 0–24", "#be123c"], ["No evidence", "#e2e8f0"]].map(([label, colorValue]) => <span key={label} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm ring-1 ring-slate-200" style={{ background: colorValue }} />{label}</span>)}</div></div>;
}

function MultiBar({ definition, payload, expanded, stacked = false, horizontal = false, defaultKeys = [] }) {
  let rows = asRows(payload);
  let keys = seriesKeys(payload, defaultKeys.filter((key) => rows.some((row) => Number.isFinite(row[key]))));
  if (stacked && payload.config?.stackBy === "difficulty") {
    const values = new Map();
    rows.forEach((row) => { const current = values.get(labelOf(row)) || { topic: labelOf(row) }; current[row.difficulty] = row.successRate; values.set(labelOf(row), current); });
    rows = [...values.values()];
    keys = ["Easy", "Medium", "Hard", "easy", "medium", "hard"].filter((key) => rows.some((row) => Number.isFinite(row[key])));
  }
  if (!rows.length || !keys.length) return <EmptyChart />;
  const viewportHeight = expanded ? Math.min(540, Math.max(360, rows.length * 34 + 70)) : 252;
  const chartHeight = horizontal ? Math.max(viewportHeight, rows.length * 32 + 66) : expanded ? 460 : 252;
  const minWidth = Math.max(expanded ? 720 : 455, horizontal ? 0 : rows.length * 64);
  const domain = numericDomain(rows, keys, definition);
  return <div className="overflow-auto" style={{ maxHeight: viewportHeight }}><div style={{ height: chartHeight, minWidth }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: keys.length > 1 ? 28 : 8, right: 20, bottom: 34, left: horizontal ? 4 : 8 }}><CartesianGrid stroke={GRID} strokeOpacity={0.55} vertical={horizontal} horizontal={!horizontal} strokeDasharray="3 3" />{horizontal ? <><XAxis type="number" domain={domain} tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={axisLabel(definition.xAxis, "insideBottom")} /><YAxis type="category" dataKey={(row) => labelOf(row, payload.config?.labelKey)} width={124} tickFormatter={(value) => formatTick(value, 18)} tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={axisLabel(definition.yAxis, "insideLeft", -90)} /></> : <><XAxis dataKey={(row) => labelOf(row, payload.config?.labelKey)} tickFormatter={(value) => formatTick(value, 13)} tick={axisTick} angle={rows.length > 6 ? -20 : 0} textAnchor={rows.length > 6 ? "end" : "middle"} interval={0} axisLine={axisLine} tickLine={axisLine} height={rows.length > 6 ? 54 : 38} label={axisLabel(definition.xAxis, "insideBottom")} /><YAxis width={48} domain={domain} tick={axisTick} axisLine={axisLine} tickLine={axisLine} allowDecimals={false} label={axisLabel(definition.yAxis, "insideLeft", -90)} /></>}<Tooltip content={<ChartTooltip unit={definition.unit} title={definition.title} />} />{keys.length > 1 && <Legend verticalAlign="top" align="right" iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, top: 0 }} />}{keys.map((key, index) => <Bar key={key} dataKey={key} name={seriesLabel(payload, key)} stackId={stacked ? "stack" : undefined} fill={COLORS[index % COLORS.length]} radius={stacked ? undefined : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 28} />)}</BarChart></ResponsiveContainer></div></div>;
}

function SkillRadar({ definition, payload, expanded }) {
  const rows = asRows(payload);
  const key = payload.config?.valueKey || numericKeys(rows)[0];
  if (rows.length < 3 || !key) return <EmptyChart />;
  return <ResponsiveContainer width="100%" height={expanded ? 500 : 252}><RadarChart data={rows} outerRadius={expanded ? "72%" : "65%"}><PolarGrid stroke={GRID} strokeOpacity={0.8} /><PolarAngleAxis dataKey={(row) => labelOf(row)} tick={axisTick} /><PolarRadiusAxis domain={[0, 100]} tick={axisTick} tickCount={6} axisLine={axisLine} /><Tooltip content={<ChartTooltip unit={definition.unit} title={definition.title} />} /><Radar dataKey={key} name={payload.config?.valueLabel || "Skill score"} stroke={COLORS[1]} fill="#8b5cf6" fillOpacity={0.22} strokeWidth={2.5} /></RadarChart></ResponsiveContainer>;
}

function Funnel({ definition, payload, expanded }) {
  const rows = asRows(payload);
  if (!rows.length) return <EmptyChart />;
  const max = Math.max(...rows.map((row) => Number(row.value ?? row.count ?? 0)), 1);
  return <div className={`mx-auto max-w-5xl ${expanded ? "space-y-3 py-5" : "space-y-2 py-2"}`}><div className="grid grid-cols-[82px_1fr_58px] gap-2 text-[9px] font-bold uppercase tracking-wide text-slate-400"><span className="text-right">Stage</span><span className="text-center">Relative retention</span><span>Students</span></div>{rows.map((row, index) => {
    const value = Number(row.value ?? row.count ?? 0);
    const previous = index ? Number(rows[index - 1].value ?? rows[index - 1].count ?? 0) : value;
    const retention = row.rate != null ? Number(row.rate) : previous ? (value / previous) * 100 : 0;
    return <div key={labelOf(row)} className="grid grid-cols-[82px_1fr_58px] items-center gap-2.5"><span className="truncate text-right text-[10px] font-bold text-slate-700 dark:text-slate-300" title={labelOf(row)}>{labelOf(row)}</span><div className="flex justify-center rounded bg-slate-100 dark:bg-slate-800"><div className={`${expanded ? "h-10" : "h-8"} flex items-center justify-center rounded bg-gradient-to-r from-sky-700 to-indigo-600 text-[10px] font-bold text-white transition-all`} style={{ width: `${Math.max(12, (value / max) * 100)}%`, opacity: 1 - index * 0.07 }}>{retention.toFixed(0)}%</div></div><span className="text-[10px] font-bold tabular-nums text-slate-900 dark:text-white">{value.toLocaleString()}</span></div>;
  })}<p className="text-center text-[9px] font-semibold text-slate-400">{definition.xAxis} → · bar width represents {definition.yAxis.toLowerCase()}</p></div>;
}

function AssessmentTrend({ definition, payload, expanded }) {
  const rows = asRows(payload);
  const keys = seriesKeys(payload, ["average", "median", "participationRate"].filter((key) => rows.some((row) => Number.isFinite(row[key]))));
  if (!rows.length || !keys.length) return <EmptyChart />;
  const height = expanded ? 460 : 252;
  return <div className="overflow-x-auto"><div style={{ height, minWidth: expanded ? 760 : 480 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 30, right: 18, left: 8, bottom: 38 }}><CartesianGrid stroke={GRID} strokeOpacity={0.55} vertical={false} strokeDasharray="3 3" /><XAxis dataKey={(row) => labelOf(row)} tickFormatter={(value) => formatTick(value, 14)} tick={axisTick} axisLine={axisLine} tickLine={axisLine} interval={0} angle={rows.length > 5 ? -18 : 0} textAnchor={rows.length > 5 ? "end" : "middle"} height={rows.length > 5 ? 56 : 38} label={axisLabel(definition.xAxis, "insideBottom")} /><YAxis width={48} domain={[0, 100]} tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={axisLabel(definition.yAxis, "insideLeft", -90)} /><Tooltip content={<ChartTooltip unit={definition.unit} title={definition.title} />} /><Legend verticalAlign="top" align="right" iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, top: 0 }} />{keys.map((key, index) => <Line key={key} type="monotone" dataKey={key} name={seriesLabel(payload, key)} stroke={COLORS[index]} strokeWidth={2.25} dot={{ r: 2.5, fill: "white", strokeWidth: 2 }} connectNulls />)}</ComposedChart></ResponsiveContainer></div></div>;
}

function Calendar({ definition, payload, expanded }) {
  const sourceRows = asRows(payload);
  if (!sourceRows.length) return <EmptyChart />;
  const byDate = new Map(sourceRows.map((row) => [row.date || labelOf(row), row]));
  const start = new Date(`${sourceRows[0].date || labelOf(sourceRows[0])}T00:00:00Z`);
  const end = new Date(`${sourceRows[sourceRows.length - 1].date || labelOf(sourceRows[sourceRows.length - 1])}T00:00:00Z`);
  const rows = [];
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      rows.push(byDate.get(date) || { date, activeStudents: 0 });
    }
  } else rows.push(...sourceRows);
  const max = Math.max(...rows.map((row) => Number(row.value ?? row.count ?? row.activeStudents ?? 0)), 1);
  const firstDate = new Date(`${rows[0].date || labelOf(rows[0])}T00:00:00Z`);
  const leading = Number.isNaN(firstDate.getTime()) ? 0 : (firstDate.getUTCDay() + 6) % 7;
  const cells = [...Array.from({ length: leading }, (_, index) => ({ spacer: true, id: `spacer-${index}` })), ...rows];
  const cellSize = expanded ? "h-6 w-6" : "h-4 w-4";
  return <div className="overflow-x-auto py-2"><div className="mb-2 flex min-w-[620px] items-center justify-between text-[9px] font-bold uppercase tracking-wide text-slate-400"><span>{definition.yAxis} ↓</span><span>{definition.xAxis} →</span></div><div className="flex min-w-[620px] gap-2"><div className={`grid grid-rows-7 gap-1 text-[9px] font-semibold text-slate-500 ${expanded ? "leading-6" : "leading-4"}`}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="grid flex-1 grid-flow-col grid-rows-7 justify-start gap-1">{cells.map((row) => {
    if (row.spacer) return <span key={row.id} className={cellSize} />;
    const value = Number(row.value ?? row.count ?? row.activeStudents ?? 0);
    const opacity = value ? 0.18 + (value / max) * 0.82 : 0.07;
    return <div key={row.date || labelOf(row)} title={`${row.date || labelOf(row)} · ${value} active students`} className={`${cellSize} rounded-[3px] bg-sky-700 ring-1 ring-inset ring-sky-900/5`} style={{ opacity }} />;
  })}</div></div><div className="mt-3 flex min-w-[620px] items-center justify-end gap-1 text-[9px] font-semibold text-slate-500"><span className="mr-1">Active students</span>Less {[.1, .3, .5, .75, 1].map((opacity) => <span key={opacity} className="h-3 w-3 rounded-[3px] bg-sky-700" style={{ opacity }} />)} More</div></div>;
}

function Donut({ definition, payload, expanded }) {
  const rows = asRows(payload);
  const valueKey = payload.config?.valueKey || "value";
  const total = rows.reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0);
  if (!rows.length || total <= 0) return <EmptyChart />;
  return <div className={`grid items-center ${expanded ? "gap-8 md:grid-cols-[minmax(0,1fr)_240px]" : "gap-2"}`}>
    <div className="relative">
      <ResponsiveContainer width="100%" height={expanded ? 430 : 218}>
        <PieChart>
          <Pie data={rows} dataKey={valueKey} nameKey={payload.config?.labelKey || "label"} cx="50%" cy="50%" innerRadius={expanded ? 92 : 54} outerRadius={expanded ? 152 : 84} paddingAngle={2} stroke="#fff" strokeWidth={2} labelLine={false} label={({ percent }) => percent >= 0.06 ? `${(percent * 100).toFixed(0)}%` : ""}>
            {rows.map((row, index) => <Cell key={row.key || row.label || index} fill={COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip unit="events" title={definition.title} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className={`${expanded ? "text-2xl" : "text-lg"} font-bold tabular-nums text-slate-950 dark:text-white`}>{total.toLocaleString()}</strong><span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">events</span></div>
    </div>
    <div className={`grid gap-1.5 ${expanded ? "content-center" : "grid-cols-3"}`}>{rows.map((row, index) => <div key={row.key || row.label} className="flex min-w-0 items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 dark:bg-white/[.03]"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[index % COLORS.length] }} /><span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-600 dark:text-slate-300">{row.label}</span><span className="text-[10px] font-bold tabular-nums text-slate-900 dark:text-white">{((Number(row[valueKey]) / total) * 100).toFixed(0)}%</span></div>)}</div>
  </div>;
}

function ScoreScatter({ definition, payload, expanded }) {
  const rows = asRows(payload);
  const keys = numericKeys(rows);
  const x = payload.config?.xKey || (rows.some((row) => Number.isFinite(row.effort)) ? "effort" : keys[0]);
  const y = payload.config?.yKey || (rows.some((row) => Number.isFinite(row.score)) ? "score" : keys[1]);
  if (!rows.length || !x || !y) return <EmptyChart />;
  const xDefinition = { ...definition, unit: "events" };
  return <ResponsiveContainer width="100%" height={expanded ? 480 : 252}><ScatterChart margin={{ top: 12, right: 18, bottom: 38, left: 10 }}><CartesianGrid stroke={GRID} strokeOpacity={0.6} strokeDasharray="3 3" /><XAxis type="number" dataKey={x} name={payload.config?.xLabel || x} domain={numericDomain(rows, [x], xDefinition)} tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={axisLabel(payload.config?.xLabel || definition.xAxis, "insideBottom")} /><YAxis type="number" dataKey={y} name={payload.config?.yLabel || y} domain={numericDomain(rows, [y], definition)} width={48} tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={axisLabel(payload.config?.yLabel || definition.yAxis, "insideLeft", -90)} /><Tooltip cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} content={<ChartTooltip unit={definition.unit} title={definition.title} />} /><Scatter data={rows} name="Students" fill={COLORS[0]}>{rows.map((row, index) => <Cell key={row.id || index} fill={row.isOutlier ? COLORS[4] : COLORS[0]} stroke="white" strokeWidth={1.5} />)}</Scatter></ScatterChart></ResponsiveContainer>;
}

export default function AnalyticsChart({ definition, payload, expanded = false }) {
  const renderer = definition.renderer;
  if (renderer === "trend") return <Trend definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "ranking") return <Ranking definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "heatmap") return <Heatmap definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "difficulty") return <MultiBar definition={definition} payload={payload} expanded={expanded} defaultKeys={["easy", "medium", "hard"]} />;
  if (renderer === "topic") return <MultiBar definition={definition} payload={payload} expanded={expanded} horizontal defaultKeys={["rate"]} />;
  if (renderer === "assessmentTopic") return <MultiBar definition={definition} payload={payload} expanded={expanded} horizontal defaultKeys={["score", "participationRate"]} />;
  if (renderer === "distribution") return <MultiBar definition={definition} payload={payload} expanded={expanded} defaultKeys={["count"]} />;
  if (renderer === "comparison") return <MultiBar definition={definition} payload={payload} expanded={expanded} defaultKeys={["value"]} />;
  if (renderer === "hierarchy") return <MultiBar definition={definition} payload={payload} expanded={expanded} horizontal defaultKeys={["completionRate", "engagementRate"]} />;
  if (renderer === "conversion") return <MultiBar definition={definition} payload={payload} expanded={expanded} horizontal defaultKeys={["conversionRate"]} />;
  if (renderer === "radar") return <SkillRadar definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "funnel") return <Funnel definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "assessmentTrend") return <AssessmentTrend definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "calendar") return <Calendar definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "scatter") return <ScoreScatter definition={definition} payload={payload} expanded={expanded} />;
  if (renderer === "donut") return <Donut definition={definition} payload={payload} expanded={expanded} />;
  return <EmptyChart />;
}
