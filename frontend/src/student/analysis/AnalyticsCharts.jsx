import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "../../context/ThemeContext";
import { CHART_COLORS } from "./analyticsUtils";
import { EmptyState } from "./AnalyticsPrimitives";

function compactAxisLabel(value, maxLength = 17) {
  const label = String(value ?? "");
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    grid: dark ? "rgba(148, 163, 184, 0.14)" : "rgba(148, 163, 184, 0.25)",
    axis: dark ? "#94a3b8" : "#64748b",
    panel: dark ? "rgba(2, 6, 23, 0.96)" : "rgba(255, 255, 255, 0.96)",
    border: dark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.9)",
    text: dark ? "#f8fafc" : "#0f172a",
    muted: dark ? "#94a3b8" : "#64748b",
  };
}

function PremiumTooltip({ active, payload, label, suffix = "" }) {
  const chartTheme = useChartTheme();
  if (!active || !payload?.length) return null;

  return (
    <div
      className="min-w-[150px] rounded-2xl px-3 py-3 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.55)] backdrop-blur-xl"
      style={{ background: chartTheme.panel, border: `1px solid ${chartTheme.border}` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: chartTheme.muted }}>
        Details
      </div>
      <div className="mt-1 text-xs font-bold" style={{ color: chartTheme.text }}>
        {payload[0]?.payload?.topic || payload[0]?.payload?.name || label}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey || entry.name} className="mt-2 flex items-center gap-2 text-xs" style={{ color: chartTheme.muted }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="font-semibold">{entry.name || entry.dataKey}</span>
          <span className="ml-auto font-bold" style={{ color: chartTheme.text }}>
            {Math.round(Number(entry.value || 0))}
            {suffix}
          </span>
        </div>
      ))}
      {payload[0]?.payload?.attempts !== undefined ? (
        <div className="mt-2 border-t pt-2 text-xs font-semibold" style={{ borderColor: chartTheme.border, color: chartTheme.muted }}>
          {Number(payload[0].payload.attempts || 0)} attempts
        </div>
      ) : null}
    </div>
  );
}

function AccessibleDataTable({ caption, data = [], columns = [] }) {
  if (!data.length) return null;
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((item, index) => (
          <tr key={`${item.label || item.topic || item.name || "row"}-${index}`}>
            {columns.map((column) => (
              <td key={column.key}>{column.format ? column.format(item[column.key], item) : item[column.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartFrame({ children, minHeight = 300, empty, emptyTitle, emptyText }) {
  if (empty) return <EmptyState title={emptyTitle} text={emptyText} />;

  return (
    <div className="rounded-[16px] border border-slate-200 bg-white p-2.5 sm:p-3.5 dark:border-slate-700/70 dark:bg-slate-950/75">
      <div style={{ minHeight }}>{children}</div>
    </div>
  );
}

export function TrendAreaChart({ data = [], dataKey = "value", color = CHART_COLORS.sky, suffix = "%", minHeight = 320, domain }) {
  const chartTheme = useChartTheme();
  const reduceMotion = useReducedMotion();

  return (
    <ChartFrame
      minHeight={minHeight}
      empty={!data.length}
      emptyTitle="Trend not ready"
      emptyText="More tracked activity is needed before this chart becomes useful."
    >
      <div role="img" aria-label="Performance trend chart">
      <ResponsiveContainer width="100%" height={minHeight}>
        <AreaChart data={data} margin={{ top: 12, right: 16, left: 6, bottom: 8 }}>
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={12}
          />
          <YAxis
            domain={domain}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <Tooltip content={<PremiumTooltip suffix={suffix} />} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={3}
            fill={color}
            fillOpacity={0.1}
            dot={{ r: 3, strokeWidth: 2, fill: chartTheme.panel }}
            activeDot={{ r: 5, strokeWidth: 0, fill: color }}
            isAnimationActive={!reduceMotion}
            animationDuration={reduceMotion ? 0 : 700}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <AccessibleDataTable caption="Performance trend data" data={data} columns={[{ key: "label", label: "Period" }, { key: dataKey, label: "Value", format: (value) => `${Math.round(Number(value || 0))}${suffix}` }]} />
    </ChartFrame>
  );
}

export function PremiumBarChart({ data = [], dataKey = "value", color = CHART_COLORS.sky, xKey = "label", suffix = "", minHeight = 300 }) {
  const chartTheme = useChartTheme();
  const reduceMotion = useReducedMotion();

  return (
    <ChartFrame
      minHeight={minHeight}
      empty={!data.length}
      emptyTitle="No bars yet"
      emptyText="This comparison appears once enough data is available."
    >
      <div role="img" aria-label="Bar chart comparison">
      <ResponsiveContainer width="100%" height={minHeight}>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 6, bottom: 8 }} barCategoryGap="28%">
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={12}
          />
          <YAxis
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <Tooltip content={<PremiumTooltip suffix={suffix} />} />
          <Bar dataKey={dataKey} fill={color} radius={[10, 10, 5, 5]} isAnimationActive={!reduceMotion} animationDuration={reduceMotion ? 0 : 700} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <AccessibleDataTable caption="Bar chart data" data={data} columns={[{ key: xKey, label: "Category" }, { key: dataKey, label: "Value", format: (value) => `${Math.round(Number(value || 0))}${suffix}` }]} />
    </ChartFrame>
  );
}

export function TopicMasteryChart({ data = [] }) {
  const chartTheme = useChartTheme();
  const reduceMotion = useReducedMotion();
  const visible = [...data]
    .filter((item) => Number(item.attempts || 0) > 0)
    .sort((a, b) => Number(b.accuracy || 0) - Number(a.accuracy || 0))
    .slice(0, 10);
  const chartHeight = Math.max(280, visible.length * 42);

  return (
    <ChartFrame
      minHeight={chartHeight}
      empty={!visible.length}
      emptyTitle="No topic signal yet"
      emptyText="Solve tagged problems to unlock topic-level accuracy analytics."
    >
      <div role="img" aria-label="Topic accuracy and attempt volume">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={visible} layout="vertical" margin={{ top: 8, right: 18, left: 6, bottom: 8 }} barCategoryGap="30%">
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: chartTheme.axis, fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="topic"
            width={108}
            tickFormatter={(value) => compactAxisLabel(value)}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={6}
          />
          <Tooltip content={<PremiumTooltip suffix="%" />} />
          <Bar dataKey="accuracy" name="Accuracy" radius={[0, 8, 8, 0]} isAnimationActive={!reduceMotion} animationDuration={reduceMotion ? 0 : 650} maxBarSize={18}>
            {visible.map((entry) => (
              <Cell
                key={entry.topic}
                fill={
                  entry.accuracy >= 75
                    ? CHART_COLORS.emerald
                    : entry.accuracy >= 55
                    ? CHART_COLORS.sky
                    : CHART_COLORS.amber
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
      <AccessibleDataTable caption="Topic accuracy data" data={visible} columns={[{ key: "topic", label: "Topic" }, { key: "accuracy", label: "Accuracy", format: (value) => `${Math.round(Number(value || 0))}%` }, { key: "attempts", label: "Attempts" }]} />
    </ChartFrame>
  );
}

export function AssessmentScoreChart({ data = [], minHeight = 320 }) {
  const chartTheme = useChartTheme();
  const reduceMotion = useReducedMotion();
  const visible = data.filter((item) => item && (item.rawScore !== undefined || item.adjustedScore !== undefined));

  return (
    <ChartFrame
      minHeight={minHeight}
      empty={!visible.length}
      emptyTitle="No score history yet"
      emptyText="Submitted assessments will appear here with raw and adjusted scores."
    >
      <div role="img" aria-label="Assessment raw and adjusted score history">
      <ResponsiveContainer width="100%" height={minHeight}>
        <LineChart data={visible} margin={{ top: 12, right: 16, left: 2, bottom: 8 }}>
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={12}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <Tooltip content={<PremiumTooltip suffix="%" />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ color: chartTheme.muted, fontSize: 11, fontWeight: 700, paddingTop: 8 }}
          />
          <Line
            type="monotone"
            dataKey="rawScore"
            name="Raw score"
            stroke={CHART_COLORS.skySoft}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, fill: chartTheme.panel, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduceMotion}
            animationDuration={reduceMotion ? 0 : 650}
          />
          <Line
            type="monotone"
            dataKey="adjustedScore"
            name="Adjusted score"
            stroke={CHART_COLORS.sky}
            strokeWidth={3}
            dot={{ r: 3, fill: chartTheme.panel, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduceMotion}
            animationDuration={reduceMotion ? 0 : 700}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
      <AccessibleDataTable caption="Assessment score history" data={visible} columns={[{ key: "label", label: "Attempt" }, { key: "rawScore", label: "Raw score", format: (value) => `${Math.round(Number(value || 0))}%` }, { key: "adjustedScore", label: "Adjusted score", format: (value) => `${Math.round(Number(value || 0))}%` }, { key: "integrityScore", label: "Reliability", format: (value) => `${Math.round(Number(value || 0))}%` }]} />
    </ChartFrame>
  );
}

export function HorizontalMetricChart({ data = [], dataKey = "value", suffix = "", color = CHART_COLORS.sky, minHeight = 280, domain }) {
  const chartTheme = useChartTheme();
  const reduceMotion = useReducedMotion();
  const visible = data.filter((item) => item && item.label);
  const chartHeight = Math.max(minHeight, visible.length * 44);

  return (
    <ChartFrame
      minHeight={chartHeight}
      empty={!visible.length}
      emptyTitle="No comparison available"
      emptyText="More tracked evidence is needed for this view."
    >
      <div role="img" aria-label="Horizontal metric comparison">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={visible} layout="vertical" margin={{ top: 8, right: 18, left: 4, bottom: 8 }} barCategoryGap="32%">
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" horizontal={false} />
          <XAxis
            type="number"
            domain={domain}
            tick={{ fill: chartTheme.axis, fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={105}
            tickFormatter={(value) => compactAxisLabel(value)}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<PremiumTooltip suffix={suffix} />} />
          <Bar dataKey={dataKey} name="Value" fill={color} radius={[0, 8, 8, 0]} maxBarSize={18} isAnimationActive={!reduceMotion} animationDuration={reduceMotion ? 0 : 650} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <AccessibleDataTable caption="Metric comparison data" data={visible} columns={[{ key: "label", label: "Metric" }, { key: dataKey, label: "Value", format: (value) => `${Math.round(Number(value || 0))}${suffix}` }]} />
    </ChartFrame>
  );
}

export function BenchmarkComparisonChart({ data = [], minHeight = 260 }) {
  const chartTheme = useChartTheme();
  const reduceMotion = useReducedMotion();
  const visible = data.filter((item) => item && item.label);
  const chartHeight = Math.max(minHeight, visible.length * 60);

  return (
    <ChartFrame
      minHeight={chartHeight}
      empty={!visible.length}
      emptyTitle="Benchmark unavailable"
      emptyText="Select a company with comparable performance requirements."
    >
      <div role="img" aria-label="Current performance compared with required benchmark">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={visible} layout="vertical" margin={{ top: 8, right: 18, left: 4, bottom: 8 }} barCategoryGap="24%">
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: chartTheme.axis, fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={92}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<PremiumTooltip suffix="%" />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ color: chartTheme.muted, fontSize: 11, fontWeight: 700, paddingTop: 8 }}
          />
          <Bar dataKey="current" name="Current" fill={CHART_COLORS.sky} radius={[0, 7, 7, 0]} maxBarSize={13} isAnimationActive={!reduceMotion} animationDuration={reduceMotion ? 0 : 650} />
          <Bar dataKey="target" name="Required" fill={CHART_COLORS.slate} radius={[0, 7, 7, 0]} maxBarSize={13} isAnimationActive={!reduceMotion} animationDuration={reduceMotion ? 0 : 700} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <AccessibleDataTable caption="Company benchmark comparison" data={visible} columns={[{ key: "label", label: "Metric" }, { key: "current", label: "Current", format: (value) => `${Math.round(Number(value || 0))}%` }, { key: "target", label: "Required", format: (value) => `${Math.round(Number(value || 0))}%` }]} />
    </ChartFrame>
  );
}
