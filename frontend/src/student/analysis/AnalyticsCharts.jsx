import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../../context/ThemeContext";
import { CHART_COLORS } from "./analyticsUtils";
import { EmptyState } from "./AnalyticsPrimitives";

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
        Insight
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
    </div>
  );
}

export function ChartFrame({ children, minHeight = 300, empty, emptyTitle, emptyText }) {
  if (empty) return <EmptyState title={emptyTitle} text={emptyText} />;

  return (
    <div className="rounded-[16px] border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-slate-950/75">
      <div style={{ minHeight }}>{children}</div>
    </div>
  );
}

export function TrendAreaChart({ data = [], dataKey = "value", color = CHART_COLORS.sky, suffix = "%", minHeight = 320 }) {
  const chartTheme = useChartTheme();

  return (
    <ChartFrame
      minHeight={minHeight}
      empty={!data.length}
      emptyTitle="Trend not ready"
      emptyText="More tracked activity is needed before this chart becomes useful."
    >
      <ResponsiveContainer width="100%" height={minHeight}>
        <AreaChart data={data} margin={{ top: 12, right: 16, left: 6, bottom: 8 }}>
          <defs>
            <linearGradient id={`area-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" vertical={false} />
          <XAxis
            dataKey="label"
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
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={3}
            fill={`url(#area-${dataKey})`}
            dot={{ r: 3, strokeWidth: 2, fill: chartTheme.panel }}
            activeDot={{ r: 5, strokeWidth: 0, fill: color }}
            isAnimationActive
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function PremiumBarChart({ data = [], dataKey = "value", color = CHART_COLORS.sky, xKey = "label", suffix = "", minHeight = 300 }) {
  const chartTheme = useChartTheme();

  return (
    <ChartFrame
      minHeight={minHeight}
      empty={!data.length}
      emptyTitle="No bars yet"
      emptyText="This comparison appears once enough data is available."
    >
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
          <Bar dataKey={dataKey} fill={color} radius={[10, 10, 5, 5]} animationDuration={850} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function TopicMasteryChart({ data = [] }) {
  const chartTheme = useChartTheme();
  const visible = data.slice(0, 14);

  return (
    <ChartFrame
      minHeight={330}
      empty={!visible.length}
      emptyTitle="No topic signal yet"
      emptyText="Solve tagged problems to unlock topic mastery analytics."
    >
      <ResponsiveContainer width="100%" height={330}>
        <BarChart data={visible} margin={{ top: 10, right: 10, left: 4, bottom: 54 }}>
          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="4 8" vertical={false} />
          <XAxis
            dataKey="topic"
            interval={0}
            angle={-32}
            textAnchor="end"
            height={72}
            tick={{ fill: chartTheme.axis, fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <Tooltip content={<PremiumTooltip suffix="%" />} />
          <Bar dataKey="accuracy" name="Accuracy" radius={[10, 10, 5, 5]} animationDuration={900}>
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
    </ChartFrame>
  );
}

export function RadarScoreChart({ data = [], minHeight = 320 }) {
  const chartTheme = useChartTheme();

  return (
    <ChartFrame
      minHeight={minHeight}
      empty={!data.length}
      emptyTitle="Radar not ready"
      emptyText="More activity is required before this profile is meaningful."
    >
      <ResponsiveContainer width="100%" height={minHeight}>
        <RadarChart data={data} outerRadius={105}>
          <PolarGrid stroke={chartTheme.grid} />
          <PolarAngleAxis dataKey="label" tick={{ fill: chartTheme.axis, fontSize: 11, fontWeight: 800 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke={CHART_COLORS.sky}
            strokeWidth={3}
            fill={CHART_COLORS.sky}
            fillOpacity={0.22}
            isAnimationActive
            animationDuration={900}
          />
          <Tooltip content={<PremiumTooltip suffix="%" />} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function LearningMixChart({ data = [] }) {
  const chartTheme = useChartTheme();
  const colors = [CHART_COLORS.sky, CHART_COLORS.emerald, CHART_COLORS.amber];

  return (
    <ChartFrame
      minHeight={260}
      empty={!data.length}
      emptyTitle="Learning mix unavailable"
      emptyText="Watch lessons, complete topics, and solve practice to build this view."
    >
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={94}
            paddingAngle={4}
            cornerRadius={10}
            animationDuration={900}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<PremiumTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.map((item, index) => (
          <div key={item.name} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            {item.name}
            <span style={{ color: chartTheme.text }}>{item.value}</span>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}
