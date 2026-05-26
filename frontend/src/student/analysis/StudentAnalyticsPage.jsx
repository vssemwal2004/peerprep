import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Code2,
  Compass,
  Gauge,
  GraduationCap,
  LineChart,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Video,
  X,
  Zap,
} from "lucide-react";
import { useStudentAnalyticsData } from "./useStudentAnalyticsData";
import {
  ActivityDots,
  DataChip,
  EmptyState,
  ErrorBanner,
  IconBadge,
  LoadingScreen,
  MetricCard,
  MiniMetric,
  ProgressBar,
  ScoreRing,
  SectionHeader,
  Surface,
  TonePill,
} from "./AnalyticsPrimitives";
import {
  LearningMixChart,
  PremiumBarChart,
  RadarScoreChart,
  TopicMasteryChart,
  TrendAreaChart,
} from "./AnalyticsCharts";
import {
  buildAssessmentMovement,
  buildHealthScore,
  buildInsightText,
  buildLearningMix,
  buildModuleScores,
  buildReadinessScore,
  buildTopicAnalytics,
  CHART_COLORS,
  clamp,
  formatPercent,
  getScoreTone,
  makeComparison,
  statusLabel,
  STATUS_STYLES,
  toInterviewCategoryData,
  toLearningTimeline,
} from "./analyticsUtils";

const SECTIONS = [
  { id: "overview", label: "Overview", eyebrow: "Readiness", Icon: Gauge },
  { id: "dsa", label: "Coding", eyebrow: "Intelligence", Icon: Code2 },
  { id: "assessments", label: "Assessment", eyebrow: "Tests", Icon: ClipboardList },
  { id: "interviews", label: "Interview", eyebrow: "Mock", Icon: MessageSquare },
  { id: "learning", label: "Learning", eyebrow: "Study", Icon: BookOpen },
  { id: "readiness", label: "Placement", eyebrow: "Company fit", Icon: BriefcaseBusiness },
];

const MotionSection = motion.section;
const MotionDiv = motion.div;

function normalizeAnalysis(analysis) {
  return {
    overview: analysis?.overview || {},
    problems: analysis?.problems || {},
    assessments: analysis?.assessments || {},
    interviews: analysis?.interviews || {},
    learning: analysis?.learning || {},
    consistency: analysis?.consistency || {},
    derived: analysis?.derived || {},
    explanations: analysis?.explanations || {},
  };
}

function PageBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-white dark:bg-slate-950">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_42%,#ffffff_100%)] transition-colors duration-500 dark:bg-[linear-gradient(180deg,#020617_0%,#08111f_50%,#020617_100%)]" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(14,165,233,0.1),transparent)] dark:opacity-70" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.045)_1px,transparent_1px)] bg-[size:64px_64px] opacity-55 dark:bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)]" />
    </div>
  );
}

function SectionShell({ id, children, className = "" }) {
  return (
    <MotionSection
      id={id}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </MotionSection>
  );
}

function explanationTone(tone) {
  if (tone === "positive") return "emerald";
  if (tone === "attention") return "amber";
  if (tone === "risk") return "rose";
  return "sky";
}

function ScoreExplanationPanel({ title = "Why this score?", explanations = [], compact = false }) {
  const items = (explanations || []).filter(Boolean).slice(0, compact ? 2 : 4);
  if (!items.length) return null;

  return (
    <div className={compact ? "rounded-[20px] border border-slate-200 bg-slate-50/75 p-4 dark:border-white/10 dark:bg-white/[0.03]" : ""}>
      <SectionHeader
        eyebrow="Score explainability"
        title={title}
        subtitle="Clear reasons, evidence, and the next action behind this analytics signal."
      />
      <div className={`mt-4 grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
        {items.map((item) => {
          const tone = explanationTone(item.tone);
          return (
            <div
              key={item.id || item.title}
              className="group rounded-[18px] border border-slate-200 bg-white/75 p-4 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_46px_-36px_rgba(14,165,233,0.72)] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-sky-400/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-950 dark:text-white">{item.title}</div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{item.summary}</p>
                </div>
                <TonePill tone={tone}>{formatPercent(item.score)}</TonePill>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(item.evidence || []).slice(0, 3).map((evidence) => (
                  <TonePill key={evidence} tone="slate">
                    {evidence}
                  </TonePill>
                ))}
              </div>
              {item.action ? (
                <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-xs font-semibold leading-5 text-sky-800 transition group-hover:bg-sky-100 dark:bg-sky-400/10 dark:text-sky-200">
                  {item.action}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StickySectionNav({ activeSection, onChange }) {
  return (
    <div className="sticky top-[72px] z-30 mb-6 rounded-[18px] border border-slate-200 bg-white px-3 py-2 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-slate-950">
      <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Analysis workspace">
        {SECTIONS.map(({ id, label, eyebrow, Icon: SectionIcon }) => {
          const active = activeSection === id;
          const NavIcon = SectionIcon;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(id)}
              className={[
                "group relative flex min-w-fit items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition",
                active
                  ? "border-sky-600 bg-sky-600 text-white shadow-[0_14px_30px_-24px_rgba(14,165,233,0.9)]"
                  : "border-transparent bg-transparent text-slate-600 hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-sky-400/20 dark:hover:bg-sky-400/10 dark:hover:text-white",
              ].join(" ")}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "bg-white/15" : "bg-slate-100 text-slate-600 dark:bg-white/8"}`}>
                <NavIcon className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="hidden text-[9px] font-semibold uppercase tracking-[0.14em] opacity-65 sm:block">{eyebrow}</span>
                <span className="block text-xs font-bold">{label}</span>
              </span>
              <span className={`absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-sky-500 transition ${active ? "opacity-100" : "opacity-0 group-hover:opacity-45"}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExecutiveHero({
  analytics,
  overallScore,
  overallStatus,
  healthScore,
  activeModules,
  weeklyMomentum,
  topicAnalytics,
  refreshing,
  onRefresh,
  onNavigate,
}) {
  const statusMeta = STATUS_STYLES[overallStatus] || STATUS_STYLES.Improving;
  const confidence = Math.round(overallScore * 0.62 + healthScore * 0.38);
  const streak = analytics.consistency.currentStreak || analytics.overview.streak || 0;
  const placementReadiness = Math.round(analytics.derived.placementSignal || ((overallScore * 0.5) + (analytics.derived.consistencyScore || 0) * 0.2 + (analytics.interviews.avgScore || 0) * 0.3));
  const heroStats = [
    { label: "Weekly momentum", value: weeklyMomentum, helper: "tracked actions", Icon: CalendarCheck, tone: weeklyMomentum ? "emerald" : "amber" },
    { label: "Consistency", value: Math.round(analytics.derived.consistencyScore || 0), suffix: "%", helper: `${analytics.consistency.activeDays || 0} active days`, Icon: Activity, tone: getScoreTone(analytics.derived.consistencyScore) },
    { label: "Current streak", value: streak, helper: "days", Icon: Zap, tone: streak >= 5 ? "emerald" : "amber" },
  ];

  return (
    <SectionShell id="overview">
      <Surface className="relative overflow-hidden p-0">
        <div className="absolute inset-x-0 top-0 h-1 bg-sky-500" />
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(14,165,233,0.09),transparent)]" />
        <div className="relative grid gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <TonePill tone={statusMeta.tone}>{overallStatus}</TonePill>
              <TonePill tone="sky">{activeModules}/4 modules active</TonePill>
              <TonePill tone="slate">{formatPercent(confidence)} confidence</TonePill>
            </div>

            <div className="mt-5 max-w-3xl">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
                PeerPrep Analysis Overview
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Your preparation command center.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                A focused student-profile style view of readiness, weekly rhythm, consistency, and the next best action.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {heroStats.map((item, index) => (
                <MetricCard key={item.label} {...item} compact delay={index * 0.04} />
              ))}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <button
                type="button"
                onClick={() => onNavigate(topicAnalytics.weakest ? "dsa" : "assessments")}
                className="group flex items-center justify-between gap-4 rounded-[18px] border border-sky-100 bg-sky-50/70 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:shadow-[0_18px_44px_-34px_rgba(14,165,233,0.75)] dark:border-sky-400/15 dark:bg-sky-400/10 dark:hover:bg-sky-400/15"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">
                    Current focus
                  </span>
                  <span className="mt-1 block truncate text-base font-bold text-slate-950 dark:text-white">
                    {analytics.overview.currentFocus || topicAnalytics.weakest?.topic || "Build more tracked attempts"}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {analytics.assessments.integrityScore < 85
                      ? `${Math.round(analytics.assessments.integrityScore)}% assessment integrity needs attention`
                      : topicAnalytics.weakest
                      ? `${Math.round(topicAnalytics.weakest.accuracy)}% accuracy below target`
                      : "Add tagged practice to unlock stronger recommendations"}
                  </span>
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition group-hover:scale-105">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>

              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700 hover:shadow-[0_18px_44px_-36px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh data
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/[0.03] xl:border-l xl:border-t-0">
            <div className="flex h-full flex-col justify-between gap-5">
              <div className="flex justify-center">
                <ScoreRing score={overallScore} size={164} stroke={11} tone={getScoreTone(overallScore)} label="Ready" />
              </div>
              <div className="space-y-3">
                <ProgressBar label="Readiness" value={overallScore} tone={getScoreTone(overallScore)} />
                <ProgressBar label="Health" value={healthScore} tone={getScoreTone(healthScore)} />
                <ProgressBar label="Placement" value={placementReadiness} tone={getScoreTone(placementReadiness)} />
              </div>
              <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold leading-6 text-slate-600 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
                {statusMeta.description}
              </p>
            </div>
          </div>
        </div>
      </Surface>
    </SectionShell>
  );
}

function SnapshotGrid({ analytics, assessmentMovement }) {
  const { problems, assessments, interviews } = analytics;
  const cards = [
    { label: "Problems solved", value: problems.solved || 0, helper: `${problems.attempts || 0} attempts`, Icon: Code2, tone: "sky" },
    { label: "DSA accuracy", value: Math.round(problems.accuracy || 0), suffix: "%", helper: "accepted quality", Icon: TrendingUp, tone: getScoreTone(problems.accuracy) },
    { label: "Assessment average", value: Math.round(assessments.adjustedAvgScore || assessments.avgScore || 0), suffix: "%", helper: `${assessments.attempts || 0} attempts`, Icon: ClipboardList, tone: getScoreTone(assessments.adjustedAvgScore || assessments.avgScore) },
    { label: "Interview rating", value: Math.round(interviews.avgScore || 0), helper: `${interviews.total || 0} reviewed`, Icon: MessageSquare, tone: getScoreTone(interviews.avgScore) },
  ];

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
            Smart snapshot
          </div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950 dark:text-white">
            Key signals without the noise
          </h2>
        </div>
        <TonePill tone={assessmentMovement.movement === null ? "sky" : assessmentMovement.movement >= 0 ? "emerald" : "rose"}>
          {assessmentMovement.movement === null ? "Trend warming up" : `${assessmentMovement.movement >= 0 ? "+" : ""}${assessmentMovement.movement}% test trend`}
        </TonePill>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {cards.map((card, index) => (
          <div key={card.label} className="min-w-[225px] snap-start sm:min-w-0">
            <MetricCard {...card} compact delay={index * 0.025} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadinessOperatingSystem({ analytics, moduleScores, topicAnalytics, healthScore, overallScore, weeklyMomentum }) {
  const { consistency } = analytics;
  const focusScore = Math.round((healthScore * 0.4) + (overallScore * 0.35) + (Math.min(100, weeklyMomentum * 12) * 0.25));
  const rhythmScore = Math.min(100, (consistency.activeDays || 0) * 14 + Math.min(30, weeklyMomentum * 3));
  const lowestModule = [...moduleScores].sort((a, b) => a.value - b.value)[0];
  const goalItems = moduleScores.map((item) => ({
    ...item,
    Icon: item.id === "problems" ? Code2 : item.id === "assessments" ? ClipboardList : item.id === "interviews" ? MessageSquare : BookOpen,
  }));

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <Surface>
        <SectionHeader
          eyebrow="Preparation architecture"
          title="Goal completion tracker"
          subtitle="Every lane contributes to one readiness score, but each lane stays easy to inspect."
          action={<TonePill tone={getScoreTone(overallScore)}>{formatPercent(overallScore)} overall</TonePill>}
        />
        <div className="mt-5 grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)] lg:items-center">
          <div className="flex justify-center">
            <ScoreRing score={focusScore} size={158} stroke={11} tone={getScoreTone(focusScore)} label="Focus" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {goalItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconBadge Icon={item.Icon} tone={item.tone} className="h-9 w-9 rounded-xl" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.label}</div>
                      <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{item.helper}</div>
                    </div>
                  </div>
                  <TonePill tone={getScoreTone(item.value)}>{formatPercent(item.value)}</TonePill>
                </div>
                <ProgressBar value={item.value} tone={getScoreTone(item.value)} />
              </div>
            ))}
          </div>
        </div>
      </Surface>

      <Surface>
        <SectionHeader
          eyebrow="Productivity intelligence"
          title="What separates steady prep from bursts"
          subtitle="A fast read on cadence, balance, and where attention should go next."
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <MiniMetric label="Focus score" value={formatPercent(focusScore)} helper="Readiness, health, and weekly effort" tone={getScoreTone(focusScore)} Icon={Target} />
          <MiniMetric label="Study rhythm" value={formatPercent(rhythmScore)} helper={`${consistency.activeDays || 0} active days`} tone={getScoreTone(rhythmScore)} Icon={Activity} />
          <MiniMetric label="Growth lane" value={lowestModule?.label || "Balanced"} helper="Lowest module score" tone="amber" Icon={TrendingUp} />
          <MiniMetric label="Strength" value={topicAnalytics.strongest?.topic || "Emerging"} helper={topicAnalytics.strongest ? `${Math.round(topicAnalytics.strongest.accuracy)}% topic accuracy` : "More data needed"} tone={topicAnalytics.strongest ? "emerald" : "sky"} Icon={Award} />
        </div>
        <div className="mt-5 space-y-4">
          <ProgressBar label="Preparation health" value={healthScore} tone={getScoreTone(healthScore)} />
          <ProgressBar label="Rhythm quality" value={rhythmScore} tone={getScoreTone(rhythmScore)} helper="Built from active days and tracked actions." />
        </div>
      </Surface>
    </div>
  );
}

function SmartInsightsSection({ insights, topicAnalytics, onNavigate }) {
  const priority = insights[0];
  const recommendationQueue = [
    topicAnalytics.weakest
      ? `Practice ${topicAnalytics.weakest.topic} in short sets until accuracy crosses 65%.`
      : "Solve more tagged problems to create stronger topic intelligence.",
    "Keep one small daily action to protect your consistency score.",
    "Review assessment mistakes before attempting the next timed test.",
  ];

  return (
    <SectionShell id="insights" className="mt-4">
      <Surface className="overflow-hidden">
        <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="relative overflow-hidden rounded-[18px] border border-sky-200 bg-sky-50 p-5 dark:border-sky-400/15 dark:bg-sky-400/10">
            <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <IconBadge Icon={Sparkles} tone="sky" className="h-11 w-11" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                  Smart insights
                </div>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                  {priority.title}
                </h2>
              </div>
            </div>
            <p className="relative mt-4 text-sm leading-6 text-slate-700 dark:text-slate-200">{priority.text}</p>
            <button
              type="button"
              onClick={() => onNavigate(topicAnalytics.weakest ? "dsa" : "assessments")}
              className="relative mt-4 inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-sky-500"
            >
              Review focus area
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {insights.slice(1, 7).map((insight) => (
              <div key={insight.title} className="rounded-[22px] border border-slate-200 bg-white/70 p-4 transition hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-950 dark:text-white">{insight.title}</div>
                  <TonePill tone={insight.tone}>{insight.tone === "emerald" ? "Healthy" : "Focus"}</TonePill>
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {recommendationQueue.map((item, index) => (
            <div key={item} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                {index + 1}
              </div>
              <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </Surface>
    </SectionShell>
  );
}

function PerformanceHeatmap({ points = [], tone = "sky" }) {
  const source = points.length ? points : Array.from({ length: 28 }, (_, index) => ({ label: `D${index + 1}`, count: 0 }));
  const max = Math.max(1, ...source.map((point) => Number(point.count || point.value || 0)));
  const toneClass = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-sky-500";

  return (
    <Surface>
      <SectionHeader
        eyebrow="Practice heatmap"
        title="Activity density"
        subtitle="Darker cells show stronger activity. The goal is a pattern students can understand at a glance."
      />
      <div className="mt-5 grid grid-cols-7 gap-2 sm:[grid-template-columns:repeat(14,minmax(0,1fr))]">
        {source.slice(-28).map((point, index) => {
          const value = Number(point.count || point.value || 0);
          const intensity = value ? 0.22 + (value / max) * 0.78 : 0.08;
          return (
            <div key={`${point.date || point.label}-${index}`} className="group relative">
              <div
                className={`aspect-square rounded-xl ${toneClass} transition duration-200 group-hover:-translate-y-1 group-hover:ring-4 group-hover:ring-sky-200 dark:group-hover:ring-sky-400/20`}
                style={{ opacity: intensity }}
                title={`${point.date || point.label || "Activity"}: ${value}`}
              />
              <div className="mt-1 truncate text-center text-[10px] font-bold text-slate-400 dark:text-slate-500">
                {point.label || ""}
              </div>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}

function MetricStrip({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <MetricCard key={item.label} {...item} compact delay={index * 0.04} />
      ))}
    </div>
  );
}

function TopicFocusQueue({ topicAnalytics }) {
  const focusTopics = (topicAnalytics.weak.length ? topicAnalytics.weak : topicAnalytics.lowVolume).slice(0, 5);

  return (
    <Surface>
      <SectionHeader eyebrow="Focus queue" title="Topics to practice next" />
      <div className="mt-4 space-y-3">
        {focusTopics.length ? (
          focusTopics.map((topic) => (
            <div key={topic.topic} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{topic.topic}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{topic.attempts} attempts</div>
                </div>
                <TonePill tone={topic.accuracy < 55 ? "amber" : "sky"}>{formatPercent(topic.accuracy)}</TonePill>
              </div>
              <div className="mt-3">
                <ProgressBar value={topic.accuracy} tone={topic.accuracy < 55 ? "amber" : "sky"} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No urgent DSA gap" text="Keep solving tagged problems to sharpen this queue." />
        )}
      </div>
    </Surface>
  );
}

function DsaIntelligenceSection({ analytics, topicAnalytics }) {
  const { problems, consistency } = analytics;
  const radarData = [
    { label: "Accuracy", value: Math.round(problems.accuracy || 0) },
    { label: "Coverage", value: Math.min(100, topicAnalytics.active.length * 12) },
    { label: "Volume", value: Math.min(100, (problems.attempts || 0) * 4) },
    { label: "Strength", value: Math.min(100, topicAnalytics.strong.length * 16) },
    { label: "Routine", value: Math.min(100, (consistency.activeDays || 0) * 16) },
  ];

  return (
    <SectionShell id="dsa" className="mt-4">
      <Surface className="overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-white/65 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <SectionHeader
            eyebrow="Coding intelligence"
            title="DSA performance students can act on"
            subtitle="Topic mastery, accuracy, solved volume, routine, and weak areas without congested charts."
            action={<TonePill tone={getScoreTone(problems.accuracy)}>{formatPercent(problems.accuracy)} accuracy</TonePill>}
          />
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <MetricStrip
            items={[
              { label: "Attempts", value: problems.attempts || 0, helper: "submitted attempts", Icon: Gauge, tone: "sky" },
              { label: "Solved", value: problems.solved || 0, helper: "accepted problems", Icon: CheckCircle2, tone: "emerald" },
              { label: "Accuracy", value: Math.round(problems.accuracy || 0), suffix: "%", helper: "current DSA quality", Icon: TrendingUp, tone: getScoreTone(problems.accuracy) },
              { label: "Weak topics", value: topicAnalytics.weak.length, helper: "need revision", Icon: Target, tone: topicAnalytics.weak.length ? "amber" : "emerald" },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Surface>
              <SectionHeader
                eyebrow="Topic mastery"
                title="Strong vs weak topic analysis"
                subtitle="High bars are reliable topics. Low bars are practice targets."
              />
              <div className="mt-4">
                <TopicMasteryChart data={topicAnalytics.normalized} />
              </div>
            </Surface>
            <Surface>
              <SectionHeader eyebrow="Skill confidence" title="DSA profile" />
              <div className="mt-4">
                <RadarScoreChart data={radarData} minHeight={300} />
              </div>
            </Surface>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <TopicFocusQueue topicAnalytics={topicAnalytics} />
            <PerformanceHeatmap points={consistency.weeklyActivity || []} tone="sky" />
          </div>
        </div>
      </Surface>
    </SectionShell>
  );
}

function AssessmentIntelligenceSection({ analytics, assessmentMovement }) {
  const { assessments } = analytics;
  const progress = (assessments.progress || []).map((item, index) => ({
    label: item.label || `Test ${index + 1}`,
    value: Number(item.value || 0),
  }));
  const adjustedAverage = assessments.adjustedAvgScore || assessments.avgScore || 0;
  const timeline = progress.slice(-6);

  return (
    <SectionShell id="assessments" className="mt-4">
      <Surface className="overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-white/65 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <SectionHeader
            eyebrow="Assessment intelligence"
            title="Score trend, stability, and improvement"
            subtitle="A premium test analytics view that explains whether performance is rising, dropping, or unstable."
            action={<TonePill tone={getScoreTone(adjustedAverage)}>{formatPercent(adjustedAverage)} adjusted average</TonePill>}
          />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <MetricStrip
            items={[
              { label: "Attempts", value: assessments.attempts || 0, helper: `${assessments.violationAttempts || 0} flagged`, Icon: ClipboardList, tone: assessments.violationAttempts ? "amber" : "sky" },
              { label: "Adjusted avg", value: Math.round(adjustedAverage || 0), suffix: "%", helper: "score after integrity", Icon: TrendingUp, tone: getScoreTone(adjustedAverage) },
              { label: "Highest", value: Math.round(assessments.highestScore || 0), suffix: "%", helper: "best score", Icon: Award, tone: "emerald" },
              { label: "Integrity", value: Math.round(assessments.integrityScore ?? 100), suffix: "%", helper: assessments.securityRisk ? `${assessments.securityRisk} risk` : "proctoring signal", Icon: LineChart, tone: getScoreTone(assessments.integrityScore ?? 100) },
            ]}
          />

          <ScoreExplanationPanel title="Why assessment score changed" explanations={analytics.explanations.assessment} />

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Surface>
              <SectionHeader
                eyebrow="Performance trend"
                title="Assessment score movement"
                subtitle="The simplest way to understand improvement over recent submissions."
              />
              <div className="mt-4">
                <TrendAreaChart data={progress} color={CHART_COLORS.sky} />
              </div>
            </Surface>
            <Surface>
              <SectionHeader eyebrow="Consistency" title="Time and score stability" />
              <div className="mt-5 space-y-5">
                <MiniMetric
                  label="Recent movement"
                  value={assessmentMovement.movement === null ? "Need data" : `${assessmentMovement.movement >= 0 ? "+" : ""}${assessmentMovement.movement}%`}
                  helper="Last five vs previous five tests"
                  tone={assessmentMovement.movement === null ? "sky" : assessmentMovement.movement >= 0 ? "emerald" : "rose"}
                  Icon={BarChart3}
                />
                <ProgressBar
                  label="Score stability"
                  value={assessments.stabilityScore || Math.max(0, 100 - assessmentMovement.spread)}
                  tone={(assessments.stabilityScore || Math.max(0, 100 - assessmentMovement.spread)) >= 75 ? "emerald" : "amber"}
                />
                <ProgressBar
                  label="Assessment integrity"
                  value={assessments.integrityScore ?? 100}
                  tone={getScoreTone(assessments.integrityScore ?? 100)}
                />
              </div>
            </Surface>
          </div>

          <Surface>
            <SectionHeader eyebrow="History timeline" title="Recent assessment checkpoints" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {timeline.length ? (
                timeline.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</div>
                      <TonePill tone={getScoreTone(item.value)}>{formatPercent(item.value)}</TonePill>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={item.value} tone={getScoreTone(item.value)} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No submitted assessments yet" text="Assessment history appears after submitted tests." />
              )}
            </div>
          </Surface>
        </div>
      </Surface>
    </SectionShell>
  );
}

function InterviewIntelligenceSection({ analytics, categoryData }) {
  const { interviews } = analytics;
  const lowestCategory = categoryData.length ? [...categoryData].sort((a, b) => a.value - b.value)[0] : null;

  return (
    <SectionShell id="interviews" className="mt-4">
      <Surface className="overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-white/65 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <SectionHeader
            eyebrow="Interview intelligence"
            title="Recruiter-focused mock interview analytics"
            subtitle="Communication, problem solving, confidence, feedback themes, and category-wise readiness."
            action={<TonePill tone={getScoreTone(interviews.avgScore)}>{formatPercent(interviews.avgScore)} readiness</TonePill>}
          />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <MetricStrip
            items={[
              { label: "Completed", value: interviews.total || 0, helper: "reviewed mocks", Icon: MessageSquare, tone: "sky" },
              { label: "Rating", value: Math.round(interviews.avgScore || 0), helper: "feedback average", Icon: TrendingUp, tone: getScoreTone(interviews.avgScore) },
              { label: "Pending", value: interviews.pending || 0, helper: "upcoming sessions", Icon: CalendarCheck, tone: "amber" },
              { label: "Focus", value: lowestCategory?.value || 0, suffix: "%", helper: lowestCategory?.label || "No category yet", Icon: Target, tone: lowestCategory ? getScoreTone(lowestCategory.value) : "slate" },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Surface>
              <SectionHeader eyebrow="Interview profile" title="Feedback radar" />
              <div className="mt-4">
                <RadarScoreChart data={categoryData} minHeight={310} />
              </div>
            </Surface>
            <Surface>
              <SectionHeader eyebrow="Rating distribution" title="Mock interview scores" />
              <div className="mt-4">
                <PremiumBarChart data={interviews.ratingDistribution || []} color={CHART_COLORS.amber} minHeight={310} />
              </div>
            </Surface>
          </div>

          <Surface>
            <SectionHeader eyebrow="Feedback visualization" title="What to improve before the next mock" />
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.85fr]">
              <div className="grid gap-4 sm:grid-cols-2">
                {categoryData.length ? (
                  categoryData.map((item) => (
                    <ProgressBar key={item.label} label={item.label} value={item.value} tone={getScoreTone(item.value)} />
                  ))
                ) : (
                  <EmptyState title="No feedback categories yet" text="Reviewed mock interviews will create this breakdown." />
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {lowestCategory ? `${lowestCategory.label} is the current interview lever.` : "Interview insight will unlock after feedback."}
                </div>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                  Use feedback themes to turn mock interviews into visible readiness gains.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(interviews.tags?.length ? interviews.tags : ["No feedback yet"]).map((tag) => (
                    <TonePill key={tag} tone={interviews.tags?.length ? "sky" : "slate"}>
                      {tag}
                    </TonePill>
                  ))}
                </div>
              </div>
            </div>
          </Surface>
        </div>
      </Surface>
    </SectionShell>
  );
}

function LearningMomentumSection({ analytics, timeline, mixData }) {
  const { learning } = analytics;
  const practiceConversion = learning.videosWatched
    ? Math.round(((learning.practiceSolved || 0) / learning.videosWatched) * 100)
    : 0;

  return (
    <SectionShell id="learning" className="mt-4">
      <Surface className="overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-white/65 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <SectionHeader
            eyebrow="Learning analytics"
            title="Motivating study progress and consistency"
            subtitle="Course progress, topic completion, learning behavior, and practice conversion in a calm visual system."
            action={<TonePill tone={getScoreTone(learning.completionPercent)}>{formatPercent(learning.completionPercent)} complete</TonePill>}
          />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <MetricStrip
            items={[
              { label: "Courses", value: learning.coursesEnrolled || 0, helper: "started modules", Icon: GraduationCap, tone: "sky" },
              { label: "Videos", value: learning.videosWatched || 0, helper: "watched lessons", Icon: Video, tone: "sky" },
              { label: "Topics done", value: learning.completedTopics || 0, helper: `${learning.totalTopics || 0} tracked`, Icon: CheckCircle2, tone: "amber" },
              { label: "Practice", value: learning.practiceSolved || 0, helper: "applied learning", Icon: Target, tone: "sky" },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Surface>
              <SectionHeader eyebrow="Study rhythm" title="Learning activity over time" />
              <div className="mt-4">
                <TrendAreaChart data={timeline} color={CHART_COLORS.sky} suffix="" />
              </div>
            </Surface>
            <Surface>
              <SectionHeader eyebrow="Effort mix" title="Learning distribution" />
              <div className="mt-4">
                <LearningMixChart data={mixData} />
              </div>
            </Surface>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Surface>
              <SectionHeader eyebrow="Completion" title="Course progress and practice conversion" />
              <div className="mt-5 space-y-5">
                <ProgressBar label="Topic completion" value={learning.completionPercent || 0} tone={getScoreTone(learning.completionPercent)} />
                <ProgressBar label="Practice conversion" value={practiceConversion} tone={practiceConversion >= 70 ? "emerald" : "amber"} />
              </div>
            </Surface>
            <Surface>
              <SectionHeader eyebrow="Weekly rhythm" title="Learning heatmap" />
              <div className="mt-5">
                <ActivityDots points={timeline} tone="sky" />
              </div>
            </Surface>
          </div>
        </div>
      </Surface>
    </SectionShell>
  );
}

function CompanyReadinessSection({ companies, selectedCompany, onCompanyChange, readiness, loadingReadiness, comparison, onOpenReadiness }) {
  return (
    <SectionShell id="readiness" className="mt-4">
      <Surface>
        <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div>
            <SectionHeader
              eyebrow="Placement intelligence"
              title="Company readiness"
              subtitle="Select a company benchmark and compare your current score with target expectations."
            />
            <label className="mt-4 block">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Company</span>
              <select
                value={selectedCompany}
                onChange={(event) => onCompanyChange(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:ring-sky-400/10"
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company._id || company.id} value={company._id || company.id}>
                    {company.companyName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loadingReadiness ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl bg-slate-50 text-sm font-bold text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating readiness
            </div>
          ) : readiness && comparison ? (
            <div className="grid gap-4 xl:grid-cols-[0.62fr_1.38fr]">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-center dark:border-white/10 dark:bg-white/[0.03]">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  {readiness.company?.companyName}
                </div>
                <div className="mt-4 flex justify-center">
                  <ScoreRing score={readiness.report?.readinessScore || 0} size={142} stroke={10} tone={getScoreTone(readiness.report?.readinessScore)} label="Fit" />
                </div>
                <button
                  type="button"
                  onClick={onOpenReadiness}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                >
                  Open roadmap
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <MiniMetric
                  label={comparison.label}
                  value={`${Math.round(comparison.current)} / ${Math.round(comparison.target)}`}
                  helper={comparison.helper}
                  tone={comparison.current >= comparison.target ? "emerald" : "amber"}
                  Icon={Compass}
                />
                <ProgressBar label="Current" value={comparison.current} tone={getScoreTone(comparison.current)} />
                <ProgressBar label="Target" value={comparison.target} tone="slate" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <DataChip label="DSA" value={formatPercent(readiness.report?.breakdown?.dsa)} tone="sky" />
                  <DataChip label="Consistency" value={formatPercent(readiness.report?.breakdown?.consistency)} tone="emerald" />
                  <DataChip label="Interview" value={formatPercent(readiness.report?.breakdown?.interview)} tone="amber" />
                </div>
                <ScoreExplanationPanel title="Why this company fit score" explanations={readiness.report?.explanations} compact />
              </div>
            </div>
          ) : (
            <EmptyState title="No company selected" text="Choose a benchmark to see placement readiness." Icon={BriefcaseBusiness} />
          )}
        </div>
      </Surface>
    </SectionShell>
  );
}

function valueText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(Math.round(value));
  if (value.label) return value.label;
  if (value.message) return value.message;
  if (value.topic) return value.topic;
  return "";
}

function ReadinessModal({ open, onClose, readiness, analytics, comparison }) {
  if (!open) return null;

  const gapAnalysis = readiness?.report?.gapAnalysis || [];
  const topicFeedback = readiness?.report?.topicFeedback || [];
  const actionPlan = readiness?.report?.actionPlan || [];
  const benchmarkData = comparison
    ? [
        { label: "Current", value: Math.round(comparison.current) },
        { label: "Target", value: Math.round(comparison.target) },
      ]
    : [];

  return (
    <MotionDiv className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/78 p-4 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <MotionDiv
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_40px_130px_-65px_rgba(0,0,0,0.9)] dark:bg-slate-950"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-white/10">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
              Placement roadmap
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
              {readiness?.company?.companyName || "Company readiness"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            aria-label="Close readiness roadmap"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Surface>
            <SectionHeader eyebrow="Fit score" title="Hiring confidence" />
            <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row">
              <ScoreRing score={readiness?.report?.readinessScore || 0} tone={getScoreTone(readiness?.report?.readinessScore)} size={150} label="Fit" />
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <DataChip label="DSA" value={formatPercent(readiness?.report?.breakdown?.dsa)} tone="sky" />
                <DataChip label="Consistency" value={formatPercent(readiness?.report?.breakdown?.consistency)} tone="emerald" />
                <DataChip label="Interview" value={formatPercent(readiness?.report?.breakdown?.interview)} tone="amber" />
                <DataChip label="Attempts" value={analytics.problems.attempts || 0} tone="sky" />
              </div>
            </div>
          </Surface>

          <Surface>
            <SectionHeader eyebrow="Benchmark" title={comparison?.label || "Current vs target"} />
            <div className="mt-5">
              <PremiumBarChart data={benchmarkData} color={CHART_COLORS.sky} suffix="%" minHeight={250} />
            </div>
          </Surface>
        </div>

        <div className="px-5 pb-5">
          <ScoreExplanationPanel title="Why this fit score" explanations={readiness?.report?.explanations} />
        </div>

        <div className="grid gap-5 px-5 pb-5 lg:grid-cols-3">
          <Surface>
            <SectionHeader eyebrow="Missing skills" title="Topic feedback" />
            <div className="mt-4 flex flex-wrap gap-2">
              {topicFeedback.length ? (
                topicFeedback.map((item, index) => (
                  <TonePill key={`${valueText(item)}-${index}`} tone="amber">
                    {valueText(item)}
                  </TonePill>
                ))
              ) : (
                <TonePill tone="emerald">No major topic gap</TonePill>
              )}
            </div>
          </Surface>

          <Surface>
            <SectionHeader eyebrow="Gap analysis" title="What to fix" />
            <div className="mt-4 space-y-3">
              {gapAnalysis.length ? (
                gapAnalysis.map((item, index) => (
                  <div key={`${valueText(item)}-${index}`} className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700 dark:bg-white/[0.03] dark:text-slate-200">
                    {valueText(item)}
                  </div>
                ))
              ) : (
                <EmptyState title="No major blocker" text="The benchmark engine did not find a large readiness gap." />
              )}
            </div>
          </Surface>

          <Surface>
            <SectionHeader eyebrow="Time" title="Estimate" />
            <div className="mt-4 rounded-2xl bg-sky-50 p-4 dark:bg-sky-400/10">
              <div className="text-2xl font-bold text-slate-950 dark:text-white">
                {readiness?.report?.timeEstimate || "2-3 weeks"}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Estimated time to close the current benchmark gap.
              </p>
            </div>
          </Surface>
        </div>

        <div className="px-5 pb-5">
          <Surface>
            <SectionHeader eyebrow="Roadmap" title="Next steps" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(actionPlan.length ? actionPlan : ["Practice weak DSA topics", "Keep a daily activity streak", "Schedule one reviewed mock interview"]).map((step, index) => (
                <div key={`${valueText(step)}-${index}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                    {index + 1}
                  </div>
                  <div className="text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{valueText(step)}</div>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </MotionDiv>
    </MotionDiv>
  );
}

export default function StudentAnalyticsPage() {
  const {
    analysis,
    companies,
    readiness,
    selectedCompany,
    loading,
    refreshing,
    loadingReadiness,
    error,
    reload,
    changeCompany,
  } = useStudentAnalyticsData();
  const [activeSection, setActiveSection] = useState("overview");
  const [showOverviewDetails, setShowOverviewDetails] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);

  const analytics = useMemo(() => normalizeAnalysis(analysis), [analysis]);
  const topicAnalytics = useMemo(() => buildTopicAnalytics(analytics.problems.topics || []), [analytics.problems.topics]);
  const assessmentMovement = useMemo(
    () => buildAssessmentMovement(analytics.assessments.progress || []),
    [analytics.assessments.progress]
  );
  const categoryData = useMemo(
    () => toInterviewCategoryData(analytics.interviews.categoryScores || {}),
    [analytics.interviews.categoryScores]
  );
  const learningTimeline = useMemo(
    () => toLearningTimeline(analytics.consistency.weeklyActivity || []),
    [analytics.consistency.weeklyActivity]
  );
  const learningMix = useMemo(() => buildLearningMix(analytics.learning), [analytics.learning]);
  const overallScore = useMemo(() => buildReadinessScore(analytics), [analytics]);
  const overallStatus = statusLabel(overallScore);
  const moduleScores = useMemo(() => buildModuleScores(analytics), [analytics]);
  const activeModules = moduleScores.filter((item) => item.value > 0).length;
  const weeklyMomentum = (analytics.consistency.weeklyActivity || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
  const healthScore = buildHealthScore({
    readinessScore: overallScore,
    consistencyScore: analytics.derived.consistencyScore || 0,
    activeModules,
    weeklyActivity: weeklyMomentum,
  });
  const insights = useMemo(
    () =>
      buildInsightText({
        topicAnalytics,
        assessmentMovement,
        interviews: analytics.interviews,
        learning: analytics.learning,
        consistency: analytics.consistency,
      }),
    [analytics.consistency, analytics.interviews, analytics.learning, assessmentMovement, topicAnalytics]
  );
  const comparison = useMemo(() => makeComparison(readiness, "overall", analytics), [analytics, readiness]);

  const refresh = useCallback(() => reload({ forceRefresh: true }), [reload]);
  const changeWorkspace = useCallback((id) => {
    setActiveSection(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen pb-12 pt-24 text-slate-950 transition-colors duration-500 dark:text-white">
      <PageBackground />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ErrorBanner error={error} onRetry={refresh} />
        <StickySectionNav activeSection={activeSection} onChange={changeWorkspace} />

        {activeSection === "overview" ? (
          <>
            <ExecutiveHero
              analytics={analytics}
              overallScore={overallScore}
              overallStatus={overallStatus}
              healthScore={healthScore}
              activeModules={activeModules}
              weeklyMomentum={weeklyMomentum}
              topicAnalytics={topicAnalytics}
              refreshing={refreshing}
              onRefresh={refresh}
              onNavigate={changeWorkspace}
            />

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowOverviewDetails((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 shadow-[0_14px_35px_-28px_rgba(14,165,233,0.8)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 dark:border-sky-400/20 dark:bg-slate-950 dark:text-sky-200 dark:hover:bg-sky-400/10"
              >
                {showOverviewDetails ? "Hide readiness details" : "Open readiness details"}
                <ArrowRight className={`h-4 w-4 transition ${showOverviewDetails ? "rotate-90" : ""}`} />
              </button>
            </div>

            {showOverviewDetails ? (
              <div className="mt-4 space-y-4">
                <SnapshotGrid analytics={analytics} assessmentMovement={assessmentMovement} />
                <ScoreExplanationPanel title="Why your readiness looks this way" explanations={analytics.explanations.overview} />
                <ReadinessOperatingSystem
                  analytics={analytics}
                  moduleScores={moduleScores}
                  topicAnalytics={topicAnalytics}
                  healthScore={healthScore}
                  overallScore={overallScore}
                  weeklyMomentum={weeklyMomentum}
                />
                <SmartInsightsSection insights={insights} topicAnalytics={topicAnalytics} onNavigate={changeWorkspace} />
              </div>
            ) : null}
          </>
        ) : null}

        {activeSection === "dsa" ? <DsaIntelligenceSection analytics={analytics} topicAnalytics={topicAnalytics} /> : null}

        {activeSection === "assessments" ? (
          <AssessmentIntelligenceSection analytics={analytics} assessmentMovement={assessmentMovement} />
        ) : null}

        {activeSection === "interviews" ? <InterviewIntelligenceSection analytics={analytics} categoryData={categoryData} /> : null}

        {activeSection === "learning" ? <LearningMomentumSection analytics={analytics} timeline={learningTimeline} mixData={learningMix} /> : null}

        {activeSection === "readiness" ? (
          <CompanyReadinessSection
            companies={companies}
            selectedCompany={selectedCompany}
            onCompanyChange={changeCompany}
            readiness={readiness}
            loadingReadiness={loadingReadiness}
            comparison={comparison}
            onOpenReadiness={() => setReadinessOpen(true)}
          />
        ) : null}
      </main>

      <ReadinessModal
        open={readinessOpen}
        onClose={() => setReadinessOpen(false)}
        readiness={readiness}
        analytics={analytics}
        comparison={comparison}
      />
    </div>
  );
}

