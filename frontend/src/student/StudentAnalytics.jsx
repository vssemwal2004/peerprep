import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Clock,
  Code2,
  GraduationCap,
  Layers3,
  MessageSquare,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../utils/api";

void motion;

const TOP_TABS = [
  { key: "problems", label: "Problems" },
  { key: "assessments", label: "Assessments" },
  { key: "interviews", label: "Interviews" },
  { key: "learning", label: "Learning" },
];

const PROBLEM_VIEWS = [
  { key: "topics", label: "Topics Covered" },
  { key: "solved", label: "Questions Solved" },
  { key: "accuracy", label: "Accuracy" },
  { key: "balance", label: "Strong vs Weak" },
];

const STATUS_STYLES = {
  Ready: {
    pill: "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  "Almost Ready": {
    pill: "bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  Improving: {
    pill: "bg-amber-500/12 text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  "Not Ready": {
    pill: "bg-rose-500/12 text-rose-700 ring-1 ring-rose-500/20 dark:text-rose-300",
    dot: "bg-rose-500",
  },
};

const PIE_COLORS = ["#38bdf8", "#22c55e", "#f59e0b"];

function statusLabel(score = 0) {
  if (score >= 85) return "Ready";
  if (score >= 70) return "Almost Ready";
  if (score >= 50) return "Improving";
  return "Not Ready";
}

function averageValues(items = []) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + item.value, 0) / items.length;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function titleize(value = "") {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay },
  };
}

function cardTone(tone = "sky") {
  if (tone === "emerald") {
    return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (tone === "amber") {
    return "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (tone === "slate") {
    return "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300";
  }
  return "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300";
}

function insightTone(tone = "sky") {
  if (tone === "emerald") {
    return "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10";
  }
  if (tone === "amber") {
    return "border-amber-200/80 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10";
  }
  if (tone === "rose") {
    return "border-rose-200/80 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/10";
  }
  return "border-sky-200/80 bg-sky-50/70 dark:border-sky-500/20 dark:bg-sky-500/10";
}

function SectionCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-[28px] border border-slate-200/80 bg-white/90 shadow-sm dark:border-gray-700/70 dark:bg-gray-900/60 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle, action = null }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-gray-500">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
      {text}
    </div>
  );
}

function StatCard({ label, value, helper, Icon, tone = "sky" }) {
  void Icon;

  return (
    <motion.div
      {...fadeUp(0)}
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700/70 dark:bg-gray-900/55"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">
            {label}
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {value}
          </div>
          {helper ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">{helper}</div>
          ) : null}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${cardTone(tone)}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}

function InsightCard({ title, text, tone = "sky" }) {
  return (
    <div className={`rounded-2xl border p-5 ${insightTone(tone)}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">
        {title}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-gray-200">{text}</p>
    </div>
  );
}

function Badge({ children, tone = "slate" }) {
  const classes =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "amber"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : tone === "rose"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

function ProgressBar({ value = 0, colorClass = "bg-sky-500" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
      <motion.div
        className={`h-full rounded-full ${colorClass}`}
        initial={{ width: 0 }}
        animate={{ width: `${clamp(value)}%` }}
        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function ScoreRing({ score = 0, size = 104, stroke = 8, color = "#38bdf8" }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(score) / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-slate-100 dark:stroke-gray-800"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

function ChartTooltip({ active, payload, label, suffix = "" }) {
  if (!active || !payload?.length) return null;
  const title = label || payload[0]?.name || payload[0]?.payload?.name || "Value";

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.35)] backdrop-blur dark:border-gray-700/80 dark:bg-gray-950/95">
      <div className="text-xs font-semibold text-slate-900 dark:text-white">{title}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">
        <span className="font-bold text-slate-900 dark:text-white">{payload[0]?.value}</span>
        {suffix}
      </div>
    </div>
  );
}

function CompareMeter({
  label,
  current = 0,
  target = 0,
  currentLabel = "Current",
  targetLabel = "Target",
  suffix = "%",
}) {
  const maxValue = Math.max(current, target, 1);
  const currentWidth = (current / maxValue) * 100;
  const targetWidth = (target / maxValue) * 100;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-gray-700/70 dark:bg-gray-900/55">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
        <div className="text-xs text-slate-500 dark:text-gray-400">
          Gap {Math.max(0, Math.round(target - current))}
          {suffix}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-gray-400">{currentLabel}</span>
            <span className="font-semibold text-slate-800 dark:text-gray-100">
              {Math.round(current)}
              {suffix}
            </span>
          </div>
          <ProgressBar value={currentWidth} colorClass="bg-sky-500" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-gray-400">{targetLabel}</span>
            <span className="font-semibold text-slate-800 dark:text-gray-100">
              {Math.round(target)}
              {suffix}
            </span>
          </div>
          <ProgressBar value={targetWidth} colorClass="bg-slate-700 dark:bg-gray-300" />
        </div>
      </div>
    </div>
  );
}

function ProblemsTab({
  problems,
  topicData,
  strongTopics,
  weakTopics,
  lowVolumeTopics,
  highErrorTopics,
  mostPracticed,
  leastPracticed,
  highestAccuracyTopic,
  problemView,
  setProblemView,
}) {
  const panelContent = {
    topics: (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Topics Covered" value={topicData.length} helper="Unique topic areas" Icon={Layers3} tone="sky" />
        <StatCard label="Questions Solved" value={problems.solved || 0} helper="Accepted solutions" Icon={CheckCircle2} tone="emerald" />
        <StatCard label="Overall Accuracy" value={`${Math.round(problems.accuracy || 0)}%`} helper="Across all problems" Icon={Target} tone="amber" />
        <StatCard label="Weak Topics" value={weakTopics.length} helper="Need focused revision" Icon={AlertTriangle} tone="slate" />
      </div>
    ),
    solved: (
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-gray-700/70 dark:bg-gray-900/55">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Low attempt topics</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
            These topics need more problem volume before the system can trust the accuracy signal.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {lowVolumeTopics.length ? (
              lowVolumeTopics.map((topic) => (
                <Badge key={topic.topic} tone="amber">
                  {topic.topic} - {topic.attempts} attempts
                </Badge>
              ))
            ) : (
              <Badge tone="emerald">Coverage looks balanced</Badge>
            )}
          </div>
        </div>
        <InsightCard
          title="Coach Note"
          tone="sky"
          text={
            problems.solved
              ? `You have solved ${problems.solved} problems so far. Grow weaker coverage before jumping only to new hard topics.`
              : "Start solving consistently so the dashboard can detect real topic patterns."
          }
        />
      </div>
    ),
    accuracy: (
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-gray-700/70 dark:bg-gray-900/55">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">High error topics</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
            These are the biggest accuracy drags in your current DSA profile.
          </p>
          <div className="mt-4 space-y-3">
            {highErrorTopics.length ? (
              highErrorTopics.map((topic) => (
                <div
                  key={topic.topic}
                  className="flex items-center justify-between rounded-2xl bg-rose-50/80 px-4 py-3 dark:bg-rose-500/10"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{topic.topic}</div>
                    <div className="text-xs text-slate-500 dark:text-gray-400">{topic.attempts} attempts</div>
                  </div>
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-300">{topic.accuracy}%</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                No major accuracy-risk topic detected right now.
              </div>
            )}
          </div>
        </div>
        <InsightCard
          title="Accuracy Insight"
          tone={highErrorTopics.length ? "rose" : "emerald"}
          text={
            highestAccuracyTopic
              ? `Your best topic is ${highestAccuracyTopic.topic}. Use that confidence as an anchor while rebuilding areas like ${highErrorTopics[0]?.topic || "lower-performing topics"}.`
              : "Solve a few topic-tagged problems to unlock topic accuracy guidance."
          }
        />
      </div>
    ),
    balance: (
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-gray-700/70 dark:bg-gray-900/55">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Strong topics</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Use these to maintain momentum and confidence.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {strongTopics.length ? (
              strongTopics.map((topic) => (
                <Badge key={topic.topic} tone="emerald">
                  {topic.topic} - {topic.accuracy}%
                </Badge>
              ))
            ) : (
              <Badge>No strong topics yet</Badge>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-gray-700/70 dark:bg-gray-900/55">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Weak topics</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Start the next revision sprint from these areas.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {weakTopics.length ? (
              weakTopics.map((topic) => (
                <Badge key={topic.topic} tone="rose">
                  {topic.topic} - {topic.accuracy}%
                </Badge>
              ))
            ) : (
              <Badge tone="emerald">No weak topics right now</Badge>
            )}
          </div>
        </div>
      </div>
    ),
  };

  return (
    <>
      <SectionCard className="p-6">
        <SectionHeader
          eyebrow="Problems Analysis"
          title="Topic-level DSA view"
          subtitle="This chart shows how your accuracy changes across topics. The goal is to spot weak zones fast, not drown you in numbers."
          action={
            <div className="flex flex-wrap gap-2">
              <Badge tone="amber">Most practiced: {mostPracticed?.topic || "None"}</Badge>
              <Badge tone="slate">Least practiced: {leastPracticed?.topic || "None"}</Badge>
              <Badge tone="emerald">Best accuracy: {highestAccuracyTopic?.topic || "None"}</Badge>
            </div>
          }
        />
        <div className="mt-6 h-[380px]">
          {topicData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="topicStrong" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#4ade80" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                  <linearGradient id="topicMedium" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                  <linearGradient id="topicWeak" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#e11d48" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.14} vertical={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="topic" type="category" width={142} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip suffix="%" />} cursor={{ fill: "rgba(56,189,248,0.05)" }} />
                <Bar dataKey="accuracy" radius={[12, 12, 12, 12]} maxBarSize={18} isAnimationActive animationDuration={850}>
                  {topicData.map((topic) => (
                    <Cell
                      key={topic.topic}
                      fill={
                        topic.level === "strong"
                          ? "url(#topicStrong)"
                          : topic.level === "medium"
                          ? "url(#topicMedium)"
                          : "url(#topicWeak)"
                      }
                    />
                  ))}
                  <LabelList dataKey="accuracy" position="right" formatter={(value) => `${value}%`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Start solving topic-tagged problems to unlock DSA analysis." />
          )}
        </div>
      </SectionCard>

      <SectionCard className="p-6">
        <SectionHeader
          eyebrow="Problem Insights"
          title="Focused views"
          subtitle="Switch between the most useful insight layers depending on what you want to fix next."
          action={
            <div className="flex flex-wrap gap-2">
              {PROBLEM_VIEWS.map((view) => (
                <button
                  key={view.key}
                  onClick={() => setProblemView(view.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    problemView === view.key
                      ? "bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/20"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="mt-6">{panelContent[problemView]}</div>
      </SectionCard>
    </>
  );
}

function AssessmentsTab({ assessments, progressScores, assessmentImprovement }) {
  const scoreSpread = progressScores.length
    ? Math.max(...progressScores.map((item) => item.value)) - Math.min(...progressScores.map((item) => item.value))
    : 0;
  const consistencyLabel = scoreSpread <= 12 ? "Stable performance" : "Needs more stability";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assessments" value={assessments.attempts || 0} helper="Submitted attempts" Icon={ClipboardList} tone="sky" />
        <StatCard label="Average Score" value={`${Math.round(assessments.avgScore || 0)}%`} helper="Current baseline" Icon={TrendingUp} tone="emerald" />
        <StatCard label="Highest Score" value={`${Math.round(assessments.highestScore || 0)}%`} helper="Best test so far" Icon={Award} tone="amber" />
        <StatCard label="Improvement" value={assessmentImprovement !== null ? `${assessmentImprovement}%` : "N/A"} helper="Last 5 vs previous 5" Icon={BarChart3} tone="slate" />
      </div>

      <SectionCard className="p-6">
        <SectionHeader
          eyebrow="Assessments Analysis"
          title="Score trend over time"
          subtitle="This tells you whether your performance is rising steadily or still swinging too much from one test to another."
        />
        <div className="mt-6 h-[320px]">
          {progressScores.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={progressScores}>
                <defs>
                  <linearGradient id="assessmentArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.14} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip suffix="%" />} />
                <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={3} fill="url(#assessmentArea)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Submit more assessments to unlock trend analysis." />
          )}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <SectionCard className="p-6">
          <SectionHeader title="Score distribution" subtitle="Each bar shows one assessment result." />
          <div className="mt-6 h-[260px]">
            {progressScores.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progressScores}>
                  <defs>
                    <linearGradient id="assessmentBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.82" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.14} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip suffix="%" />} />
                  <Bar dataKey="value" fill="url(#assessmentBar)" radius={[10, 10, 0, 0]} maxBarSize={42}>
                    <LabelList dataKey="value" position="top" formatter={(value) => `${value}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No assessment score distribution yet." />
            )}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <InsightCard
            title="Assessment Insight"
            tone={assessments.avgScore >= 75 ? "emerald" : "amber"}
            text={
              assessments.avgScore >= 75
                ? "Your average is already in a healthy zone. The next step is making that level repeatable under pressure."
                : `Your average score is ${Math.round(assessments.avgScore || 0)}%. Reaching 75% will make top-company readiness much more stable.`
            }
          />
          <InsightCard
            title="Consistency Insight"
            tone={scoreSpread <= 12 ? "emerald" : "rose"}
            text={
              progressScores.length
                ? `${consistencyLabel}. Score spread across recent tests is ${Math.round(scoreSpread)} points.`
                : "Complete a few assessments to unlock consistency analysis."
            }
          />
        </div>
      </div>
    </>
  );
}

function InterviewsTab({ interviews, categoryData, lowestCategory }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Interviews" value={interviews.total || 0} helper="Completed sessions" Icon={MessageSquare} tone="sky" />
        <StatCard label="Average Rating" value={Math.round(interviews.avgScore || 0)} helper="Overall feedback score" Icon={TrendingUp} tone="emerald" />
        <StatCard label="Pending" value={interviews.pending || 0} helper="Upcoming interviews" Icon={Clock} tone="amber" />
        <StatCard label="Focus Area" value={lowestCategory?.label || "N/A"} helper="Lowest interview category" Icon={BrainCircuit} tone="slate" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <SectionCard className="p-6">
          <SectionHeader
            eyebrow="Interviews Analysis"
            title="Rating distribution"
            subtitle="See how your interview feedback is spread across score ranges."
          />
          <div className="mt-6 h-[320px]">
            {interviews.ratingDistribution?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={interviews.ratingDistribution}>
                  <defs>
                    <linearGradient id="interviewBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="0.82" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.14} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" fill="url(#interviewBar)" radius={[10, 10, 0, 0]} maxBarSize={42}>
                    <LabelList dataKey="value" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No interview ratings available yet." />
            )}
          </div>
        </SectionCard>

        <SectionCard className="p-6">
          <SectionHeader
            title="Feedback breakdown"
            subtitle="Communication, explanation quality, and preparedness all matter here."
          />
          <div className="mt-6 h-[320px]">
            {categoryData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.14} vertical={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="label" type="category" width={138} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip suffix="%" />} />
                  <Bar dataKey="value" fill="#38bdf8" radius={[12, 12, 12, 12]} maxBarSize={20}>
                    <LabelList dataKey="value" position="right" formatter={(value) => `${value}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Feedback category data appears after interview reviews." />
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <SectionCard className="p-6">
          <SectionHeader title="Feedback tags" subtitle="Quick themes extracted from interview reviews." />
          <div className="mt-4 flex flex-wrap gap-2">
            {(interviews.tags || ["No feedback yet"]).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </SectionCard>

        <InsightCard
          title="Coach Insight"
          tone={lowestCategory ? "amber" : "sky"}
          text={
            lowestCategory
              ? `Your ${lowestCategory.label.toLowerCase()} score needs the most work right now. Practice clearer explanations before the next mock round.`
              : "Once interview feedback comes in, this space will point out your weakest speaking and problem-solving areas."
          }
        />
      </div>
    </>
  );
}

function LearningTab({ learning, timeline, mixData, consistencyScore }) {
  const practiceConversion = learning.videosWatched
    ? Math.round((learning.practiceSolved / learning.videosWatched) * 100)
    : 0;
  const quietDays = timeline.filter((item) => item.count === 0).length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses" value={learning.coursesEnrolled || 0} helper="Modules started" Icon={GraduationCap} tone="sky" />
        <StatCard label="Videos Watched" value={learning.videosWatched || 0} helper="Learning engagement" Icon={Activity} tone="emerald" />
        <StatCard label="Topics Done" value={learning.completedTopics || 0} helper="Completed curriculum" Icon={CheckCircle2} tone="amber" />
        <StatCard label="Practice Solved" value={learning.practiceSolved || 0} helper="Applied learning" Icon={Target} tone="slate" />
      </div>

      <SectionCard className="p-6">
        <SectionHeader
          eyebrow="Learning Analysis"
          title="Learning activity over time"
          subtitle="The goal is steady progress, not random spikes followed by long gaps."
        />
        <div className="mt-6 h-[320px]">
          {timeline.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.14} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={3} dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Learning activity will appear after module usage starts." />
          )}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <SectionCard className="p-6">
          <SectionHeader
            title="Learning distribution"
            subtitle="How your current effort is split across watching, completing, and practicing."
          />
          <div className="mt-6 h-[280px]">
            {mixData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={100} paddingAngle={3}>
                    {mixData.map((item, index) => (
                      <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Learning mix appears once enough activity exists." />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {mixData.map((item, index) => (
              <span
                key={item.name}
                className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-300"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                {item.name}
              </span>
            ))}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard className="p-6">
            <SectionHeader
              title="Completion and consistency"
              subtitle="These bars make the learning state easy to scan."
            />
            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700 dark:text-gray-300">Course completion</span>
                  <span className="font-black text-slate-900 dark:text-white">{Math.round(learning.completionPercent || 0)}%</span>
                </div>
                <ProgressBar value={learning.completionPercent || 0} colorClass="bg-emerald-500" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700 dark:text-gray-300">Practice conversion</span>
                  <span className="font-black text-slate-900 dark:text-white">{practiceConversion}%</span>
                </div>
                <ProgressBar value={practiceConversion} colorClass="bg-sky-500" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700 dark:text-gray-300">Consistency score</span>
                  <span className="font-black text-slate-900 dark:text-white">{consistencyScore || 0}%</span>
                </div>
                <ProgressBar value={consistencyScore || 0} colorClass="bg-amber-500" />
              </div>
            </div>
          </SectionCard>

          <InsightCard
            title="Behavior Insight"
            tone={practiceConversion < 70 ? "amber" : "emerald"}
            text={
              practiceConversion < 70
                ? `You are learning more than you are applying right now. Add small practice blocks after each module. Quiet days this week: ${quietDays}.`
                : "Your learning and practice balance looks healthy. Keep the same steady rhythm."
            }
          />
        </div>
      </div>
    </>
  );
}

function AnalyzePanel({
  open,
  onClose,
  overallScore,
  overallStatus,
  categories,
  companies,
  selectedCompany,
  selectedCategory,
  onCompanyChange,
  onCategoryChange,
  readiness,
  loadingReadiness,
  comparison,
  consistency,
  problems,
}) {
  const activeStatus = comparison ? statusLabel(comparison.current) : overallStatus;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] overflow-y-auto bg-black/45 px-4 py-8 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-6xl overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_35px_120px_-50px_rgba(15,23,42,0.55)] dark:border-gray-700/70 dark:bg-gray-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 bg-gradient-to-r from-sky-50 via-white to-slate-50 px-6 py-6 dark:border-gray-800 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 sm:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                    <Bot className="h-3.5 w-3.5" />
                    AI Coach
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                    Personalized performance analysis
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-gray-300">
                    This panel turns your analytics into simple readiness signals, gap analysis, and clear next steps.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6 sm:px-8">
              <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
                <SectionCard className="p-6">
                  <SectionHeader
                    eyebrow="Overall Performance"
                    title="Readiness snapshot"
                    subtitle="A single score to show where you stand right now."
                  />
                  <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                    <div className="relative flex h-[122px] w-[122px] items-center justify-center">
                      <ScoreRing score={overallScore} size={122} stroke={10} />
                      <div className="absolute text-center">
                        <div className="text-3xl font-black text-slate-900 dark:text-white">{overallScore}%</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">
                          Overall
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[overallStatus].pill}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[overallStatus].dot}`} />
                        {overallStatus}
                      </div>
                      <p className="max-w-sm text-sm leading-relaxed text-slate-600 dark:text-gray-300">
                        This combines problem solving, assessments, interviews, and learning consistency into one easy score.
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {categories.map((item) => {
                    const itemStatus = statusLabel(item.score);
                    const gap = Math.max(0, Math.round(item.target - item.score));
                    return (
                      <SectionCard key={item.label} className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">
                              {item.label}
                            </div>
                            <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{item.score}%</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">{item.helper}</div>
                          </div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                            <item.Icon className="h-4 w-4" />
                          </div>
                        </div>
                        <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[itemStatus].pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[itemStatus].dot}`} />
                          {itemStatus}
                        </div>
                        <div className="mt-3 text-xs text-slate-500 dark:text-gray-400">Gap to target: {gap}%</div>
                      </SectionCard>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <SectionCard className="p-6">
                  <SectionHeader
                    eyebrow="Company Comparison"
                    title="Benchmark vs current performance"
                    subtitle="Pick a company and category to see exactly where the gap is."
                  />
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <select
                      value={selectedCompany}
                      onChange={(event) => onCompanyChange(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      <option value="">Select company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.companyName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedCategory}
                      onChange={(event) => onCategoryChange(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      <option value="overall">Overall</option>
                      <option value="dsa">DSA</option>
                      <option value="interview">Interview</option>
                      <option value="assessment">Assessment</option>
                    </select>
                  </div>

                  <div className="mt-5">
                    {loadingReadiness ? (
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
                        Analyzing readiness...
                      </div>
                    ) : null}

                    {!loadingReadiness && readiness && comparison ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/50">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">
                                Selected Benchmark
                              </div>
                              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                                {readiness.company.companyName}
                              </div>
                              <p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-gray-400">
                                {comparison.note}
                              </p>
                            </div>
                            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[activeStatus].pill}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[activeStatus].dot}`} />
                              {activeStatus}
                            </div>
                          </div>
                        </div>

                        <CompareMeter label={comparison.label} current={comparison.current} target={comparison.target} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <CompareMeter
                            label="Problem Attempts"
                            current={problems.attempts || 0}
                            target={readiness.company?.minQuestionAttempts || 0}
                            currentLabel="Current volume"
                            targetLabel="Required volume"
                            suffix=""
                          />
                          <CompareMeter
                            label="Consistency Streak"
                            current={consistency.currentStreak || 0}
                            target={readiness.company?.minStreak || 0}
                            currentLabel="Current streak"
                            targetLabel="Required streak"
                            suffix="d"
                          />
                        </div>
                      </div>
                    ) : null}

                    {!loadingReadiness && !readiness ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                        Select a company to see current vs required performance, gap percentage, and readiness guidance.
                      </div>
                    ) : null}
                  </div>
                </SectionCard>

                <div className="space-y-6">
                  <SectionCard className="p-6">
                    <SectionHeader
                      eyebrow="Gap Analysis"
                      title="What is weak and why it matters"
                      subtitle="This is the part that tells you exactly what to fix next."
                    />
                    <div className="mt-5 space-y-3">
                      {readiness?.report?.gapAnalysis?.length ? (
                        readiness.report.gapAnalysis.map((gap) => (
                          <div
                            key={gap.type}
                            className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/50"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white">{gap.type}</div>
                                <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">{gap.message}</p>
                                <div className="mt-2 text-xs text-slate-400 dark:text-gray-500">
                                  Required {gap.required} | Current {gap.current}
                                </div>
                              </div>
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          You currently meet or exceed the selected benchmark.
                        </div>
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard className="p-6">
                    <SectionHeader title="Topic feedback" subtitle="Required topics that still need more confidence or coverage." />
                    <div className="mt-4 flex flex-wrap gap-2">
                      {readiness?.report?.topicFeedback?.length ? (
                        readiness.report.topicFeedback.map((item) => (
                          <Badge key={`${item.topic}-${item.current}`} tone="rose">
                            {item.topic}: {Math.round(item.current)}% / {Math.round(item.required)}%
                          </Badge>
                        ))
                      ) : (
                        <Badge tone="emerald">No topic-specific gaps detected</Badge>
                      )}
                    </div>
                  </SectionCard>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
                <SectionCard className="p-6">
                  <SectionHeader
                    eyebrow="Action Plan"
                    title="Next best steps"
                    subtitle="A practical plan built from your current gaps."
                  />
                  <div className="mt-5 space-y-3">
                    {(readiness?.report?.actionPlan || [
                      "Focus on weak topics first and maintain a daily practice streak.",
                    ]).map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/50"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <p className="text-sm text-slate-700 dark:text-gray-200">{item}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <div className="space-y-6">
                  <InsightCard
                    title="Time Estimation"
                    tone="sky"
                    text={readiness?.report?.timeEstimate || "Estimated time to reach readiness: 2-3 weeks"}
                  />
                  <InsightCard
                    title="Coach Summary"
                    tone="amber"
                    text={
                      readiness
                        ? `Now you know the exact gap. Focus on the action plan above and protect consistency every day.`
                        : "Choose a company benchmark to turn this page into a targeted readiness plan."
                    }
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function StudentAnalytics() {
  const [activeTab, setActiveTab] = useState("problems");
  const [problemView, setProblemView] = useState("topics");
  const [analysis, setAnalysis] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAnalyze, setShowAnalyze] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("overall");
  const [readiness, setReadiness] = useState(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const [analysisRes, companiesRes] = await Promise.all([
          api.getStudentAnalysis(),
          api.listStudentCompanies(),
        ]);
        if (!mounted) return;
        setAnalysis(analysisRes?.analysis || null);
        setCompanies(companiesRes?.companies || []);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const overview = analysis?.overview || {};
  const problems = analysis?.problems || {};
  const assessments = analysis?.assessments || {};
  const interviews = analysis?.interviews || {};
  const learning = analysis?.learning || {};
  const consistency = analysis?.consistency || {};
  const derived = analysis?.derived || {};

  const topicData = useMemo(
    () => [...(problems.topics || [])].sort((a, b) => b.attempts - a.attempts),
    [problems.topics]
  );
  const strongTopics = useMemo(
    () => topicData.filter((topic) => topic.level === "strong"),
    [topicData]
  );
  const weakTopics = useMemo(
    () => topicData.filter((topic) => topic.level === "weak"),
    [topicData]
  );
  const mostPracticed = useMemo(
    () => topicData.reduce((best, topic) => (topic.attempts > (best?.attempts || 0) ? topic : best), null),
    [topicData]
  );
  const leastPracticed = useMemo(
    () => topicData.reduce((best, topic) => (best === null || topic.attempts < best.attempts ? topic : best), null),
    [topicData]
  );
  const highestAccuracyTopic = useMemo(
    () => topicData.reduce((best, topic) => (topic.accuracy > (best?.accuracy || 0) ? topic : best), null),
    [topicData]
  );

  const averageTopicAttempts = topicData.length
    ? topicData.reduce((sum, topic) => sum + topic.attempts, 0) / topicData.length
    : 0;
  const lowVolumeTopics = useMemo(
    () =>
      topicData
        .filter((topic) => topic.attempts > 0 && topic.attempts <= Math.max(3, Math.floor(averageTopicAttempts * 0.6)))
        .slice(0, 4),
    [averageTopicAttempts, topicData]
  );
  const highErrorTopics = useMemo(
    () => topicData.filter((topic) => topic.accuracy < 55).sort((a, b) => a.accuracy - b.accuracy).slice(0, 4),
    [topicData]
  );

  const progressScores = assessments.progress || [];
  const lastFive = progressScores.slice(-5);
  const previousFive = progressScores.slice(-10, -5);
  const recentAverage = averageValues(lastFive);
  const previousAverage = averageValues(previousFive);
  const assessmentImprovement = previousAverage
    ? Math.round(((recentAverage - previousAverage) / previousAverage) * 100)
    : null;

  const interviewCategoryData = useMemo(
    () =>
      Object.entries(interviews.categoryScores || {}).map(([key, value]) => ({
        label: titleize(key),
        value: Math.round((value || 0) * 20),
      })),
    [interviews.categoryScores]
  );

  const lowestInterviewCategory = useMemo(() => {
    if (!interviewCategoryData.length) return null;
    return [...interviewCategoryData].sort((a, b) => a.value - b.value)[0];
  }, [interviewCategoryData]);

  const learningTimeline = useMemo(
    () =>
      (consistency.weeklyActivity || []).map((item) => ({
        ...item,
        label: item.date
          ? new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : item.date,
      })),
    [consistency.weeklyActivity]
  );

  const learningMix = useMemo(
    () =>
      [
        { name: "Videos Watched", value: learning.videosWatched || 0 },
        { name: "Topics Completed", value: learning.completedTopics || 0 },
        { name: "Practice Solved", value: learning.practiceSolved || 0 },
      ].filter((item) => item.value > 0),
    [learning.completedTopics, learning.practiceSolved, learning.videosWatched]
  );

  const overallScore = useMemo(() => {
    const values = [
      problems.accuracy,
      assessments.avgScore,
      interviews.avgScore,
      learning.completionPercent,
    ].filter((value) => typeof value === "number" && value > 0);

    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [assessments.avgScore, interviews.avgScore, learning.completionPercent, problems.accuracy]);

  const overallStatus = statusLabel(overallScore);

  const handleCompanyChange = async (companyId) => {
    setSelectedCompany(companyId);
    if (!companyId) {
      setReadiness(null);
      return;
    }

    try {
      setLoadingReadiness(true);
      const result = await api.getCompanyReadiness(companyId);
      setReadiness(result);
    } finally {
      setLoadingReadiness(false);
    }
  };

  const comparison = useMemo(() => {
    if (!readiness) return null;

    if (selectedCategory === "dsa") {
      return {
        label: "DSA",
        current: problems.accuracy || 0,
        target: readiness.company?.dsaAccuracyRequired || 0,
        note: "Compared against the DSA accuracy benchmark set by admin.",
      };
    }

    if (selectedCategory === "interview") {
      return {
        label: "Interview",
        current: interviews.avgScore || 0,
        target: readiness.company?.interviewScore || 0,
        note: "Compared against the interview minimum score benchmark.",
      };
    }

    if (selectedCategory === "assessment") {
      return {
        label: "Assessment",
        current: assessments.avgScore || 0,
        target: readiness.company?.dsaAccuracyRequired || 0,
        note: "Using the company DSA target as the closest benchmark for assessment strength.",
      };
    }

    return {
      label: "Overall Readiness",
      current: readiness.report?.readinessScore || 0,
      target: 85,
      note: "Inside the coach model, 85% and above is treated as ready.",
    };
  }, [assessments.avgScore, interviews.avgScore, problems.accuracy, readiness, selectedCategory]);

  const coachCategories = [
    {
      label: "Problem Solving",
      score: Math.round(problems.accuracy || 0),
      target: readiness?.company?.dsaAccuracyRequired || 75,
      helper: "Topic strength and solving quality",
      Icon: Code2,
    },
    {
      label: "Assessments",
      score: Math.round(assessments.avgScore || 0),
      target: readiness?.company?.dsaAccuracyRequired || 70,
      helper: "Structured test execution",
      Icon: ClipboardList,
    },
    {
      label: "Interviews",
      score: Math.round(interviews.avgScore || 0),
      target: readiness?.company?.interviewScore || 75,
      helper: "Communication and explanation",
      Icon: MessageSquare,
    },
    {
      label: "Learning",
      score: Math.round(learning.completionPercent || 0),
      target: 70,
      helper: "Consistency in modules",
      Icon: GraduationCap,
    },
  ];

  let tabContent = null;
  if (activeTab === "problems") {
    tabContent = (
      <ProblemsTab
        problems={problems}
        topicData={topicData}
        strongTopics={strongTopics}
        weakTopics={weakTopics}
        lowVolumeTopics={lowVolumeTopics}
        highErrorTopics={highErrorTopics}
        mostPracticed={mostPracticed}
        leastPracticed={leastPracticed}
        highestAccuracyTopic={highestAccuracyTopic}
        problemView={problemView}
        setProblemView={setProblemView}
      />
    );
  } else if (activeTab === "assessments") {
    tabContent = (
      <AssessmentsTab
        assessments={assessments}
        progressScores={progressScores}
        assessmentImprovement={assessmentImprovement}
      />
    );
  } else if (activeTab === "interviews") {
    tabContent = (
      <InterviewsTab
        interviews={interviews}
        categoryData={interviewCategoryData}
        lowestCategory={lowestInterviewCategory}
      />
    );
  } else {
    tabContent = (
      <LearningTab
        learning={learning}
        timeline={learningTimeline}
        mixData={learningMix}
        consistencyScore={derived.consistencyScore || 0}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50/70 via-white to-slate-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 pt-20 pb-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionCard className="overflow-hidden">
          <div className="relative px-6 py-6 sm:px-8">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-sky-100/60 to-transparent blur-3xl dark:from-sky-500/10" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  Student Analysis
                </div>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                  Understand your performance without the noise
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-gray-300 sm:text-base">
                  A simpler, startup-style analytics page that shows what you are good at, what is weak, and what to do next.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative flex h-[96px] w-[96px] items-center justify-center">
                  <ScoreRing score={overallScore} size={96} stroke={8} />
                  <div className="absolute text-center">
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{overallScore}%</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">
                      Overall
                    </div>
                  </div>
                </div>
                <motion.button
                  onClick={() => setShowAnalyze(true)}
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 px-5 py-3 text-sm font-bold text-white ring-1 ring-white/20 shadow-[0_18px_45px_-32px_rgba(2,132,199,0.65)]"
                >
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-white/8 to-transparent" />
                  <Bot className="relative z-10 h-4 w-4 text-white/90" />
                  <span className="relative z-10">Analyze Performance</span>
                  <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </motion.button>
              </div>
            </div>

            <div className="relative mt-7 flex flex-col gap-4 border-t border-slate-200/70 pt-5 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-6">
                {TOP_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative pb-3 text-sm font-semibold transition-colors ${
                      activeTab === tab.key
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.key ? (
                      <motion.span
                        layoutId="analysisUnderline"
                        className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-sky-500"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone="emerald">Streak {overview.streak || 0}d</Badge>
                <Badge tone="amber">Consistency {derived.consistencyScore || 0}%</Badge>
                <Badge>{overallStatus}</Badge>
              </div>
            </div>
          </div>
        </SectionCard>

        <motion.div {...fadeUp(0.05)} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Attempts" value={overview.totalAttempts || 0} helper="Problems and assessments" Icon={Target} tone="sky" />
          <StatCard label="Average Score" value={`${Math.round(overview.avgScore || 0)}%`} helper="Across active modules" Icon={TrendingUp} tone="emerald" />
          <StatCard label="Interview Score" value={Math.round(overview.interviewScore || 0)} helper="Feedback average" Icon={MessageSquare} tone="amber" />
          <StatCard label="Learning Progress" value={`${Math.round(learning.completionPercent || 0)}%`} helper="Module completion" Icon={GraduationCap} tone="slate" />
        </motion.div>

        {loading ? (
          <SectionCard className="mt-6 flex h-64 items-center justify-center p-6 text-sm text-slate-500 dark:text-gray-400">
            Loading analytics...
          </SectionCard>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="mt-6 space-y-6"
            >
              {tabContent}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AnalyzePanel
        open={showAnalyze}
        onClose={() => setShowAnalyze(false)}
        overallScore={overallScore}
        overallStatus={overallStatus}
        categories={coachCategories}
        companies={companies}
        selectedCompany={selectedCompany}
        selectedCategory={selectedCategory}
        onCompanyChange={handleCompanyChange}
        onCategoryChange={setSelectedCategory}
        readiness={readiness}
        loadingReadiness={loadingReadiness}
        comparison={comparison}
        consistency={consistency}
        problems={problems}
      />
    </div>
  );
}
