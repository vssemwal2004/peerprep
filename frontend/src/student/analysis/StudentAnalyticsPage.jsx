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
  ShieldCheck,
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

const WORKSPACES = [
  {
    id: "problems",
    label: "DSA",
    title: "Problem Solving",
    description: "Topic mastery, accuracy, solved volume, and weak areas.",
    Icon: Code2,
    tone: "sky",
  },
  {
    id: "assessments",
    label: "Tests",
    title: "Assessments",
    description: "Score trend, stability, test accuracy, and improvement.",
    Icon: ClipboardList,
    tone: "emerald",
  },
  {
    id: "interviews",
    label: "Interviews",
    title: "Mock Interviews",
    description: "Feedback distribution, category ratings, and readiness gaps.",
    Icon: MessageSquare,
    tone: "amber",
  },
  {
    id: "learning",
    label: "Learning",
    title: "Learning Progress",
    description: "Study consistency, topic completion, and practice conversion.",
    Icon: BookOpen,
    tone: "violet",
  },
];

function normalizeAnalysis(analysis) {
  return {
    overview: analysis?.overview || {},
    problems: analysis?.problems || {},
    assessments: analysis?.assessments || {},
    interviews: analysis?.interviews || {},
    learning: analysis?.learning || {},
    consistency: analysis?.consistency || {},
    derived: analysis?.derived || {},
  };
}

function PageBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-slate-50 dark:bg-slate-950">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#f8fafc_0%,#eef6ff_42%,#f8fafc_100%)] dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_50%,#020617_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60 dark:bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)]" />
      <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-sky-200/45 blur-3xl dark:bg-sky-500/10" />
      <div className="absolute right-0 top-16 h-80 w-80 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-500/10" />
    </div>
  );
}

function DashboardHeader({
  overallScore,
  overallStatus,
  healthScore,
  activeModules,
  weeklyMomentum,
  topicAnalytics,
  refreshing,
  onRefresh,
}) {
  const statusMeta = STATUS_STYLES[overallStatus] || STATUS_STYLES.Improving;
  const confidence = Math.round(overallScore * 0.68 + healthScore * 0.32);

  return (
    <Surface className="overflow-hidden border-slate-200 bg-white p-0 dark:bg-slate-950">
      <div className="grid gap-0 lg:grid-cols-[270px_minmax(0,1fr)]">
        <div className="border-b border-slate-200 bg-slate-950 p-5 text-white dark:border-white/10 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">
                Readiness
              </div>
              <div className="mt-1 text-xl font-black tracking-tight">{overallStatus}</div>
            </div>
            <TonePill tone={statusMeta.tone}>{formatPercent(overallScore)}</TonePill>
          </div>
          <div className="mt-5 flex justify-center">
            <ScoreRing score={overallScore} size={136} stroke={10} tone={getScoreTone(overallScore)} label="Ready" />
          </div>
          <p className="mt-4 text-center text-sm leading-6 text-slate-300">{statusMeta.description}</p>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                PeerPrep Student Analysis
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                Understand your preparation in one workspace.
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                A focused analytics console for DSA, tests, interviews, learning progress, and company readiness.
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric
              label="Confidence"
              value={formatPercent(confidence)}
              helper="Readiness + health"
              tone={getScoreTone(confidence)}
              Icon={ShieldCheck}
            />
            <MiniMetric
              label="Health"
              value={formatPercent(healthScore)}
              helper={`${activeModules}/4 active modules`}
              tone={getScoreTone(healthScore)}
              Icon={Gauge}
            />
            <MiniMetric
              label="Weekly Momentum"
              value={weeklyMomentum}
              helper="Tracked actions"
              tone={weeklyMomentum > 0 ? "emerald" : "amber"}
              Icon={CalendarCheck}
            />
            <MiniMetric
              label="Focus Area"
              value={topicAnalytics.weakest?.topic || "Balanced"}
              helper={topicAnalytics.weakest ? `${Math.round(topicAnalytics.weakest.accuracy)}% accuracy` : "No urgent gap"}
              tone={topicAnalytics.weakest ? "amber" : "emerald"}
              Icon={Target}
            />
          </div>
        </div>
      </div>
    </Surface>
  );
}

function RestoredHero({
  overallScore,
  overallStatus,
  healthScore,
  activeModules,
  weeklyMomentum,
  topicAnalytics,
  refreshing,
  onRefresh,
  onOpenReadiness,
}) {
  const statusMeta = STATUS_STYLES[overallStatus] || STATUS_STYLES.Improving;
  const confidence = Math.round(overallScore * 0.62 + healthScore * 0.38);
  const tone = getScoreTone(overallScore);

  return (
    <section id="overview">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Surface className="relative overflow-hidden border-white/70 bg-white/76 p-0 backdrop-blur-2xl dark:bg-slate-950/70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(16,185,129,0.12),transparent_28%)]" />
          <div className="relative grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_170px] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <TonePill tone={statusMeta.tone}>{overallStatus}</TonePill>
                <TonePill tone="emerald">{activeModules}/4 active modules</TonePill>
                <TonePill tone="slate">{weeklyMomentum} weekly actions</TonePill>
              </div>

              <div className="mt-5">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
                  PeerPrep intelligence
                </div>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl lg:text-4xl">
                  Student readiness, made easy to understand.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  A focused view of DSA, assessments, interviews, learning progress, and placement readiness without overwhelming the student.
                </p>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <MiniMetric
                  label="Confidence"
                  value={formatPercent(confidence)}
                  helper="Readiness + health"
                  tone={getScoreTone(confidence)}
                  Icon={ShieldCheck}
                />
                <MiniMetric
                  label="Health"
                  value={formatPercent(healthScore)}
                  helper="Preparation balance"
                  tone={getScoreTone(healthScore)}
                  Icon={Gauge}
                />
                <MiniMetric
                  label="Focus"
                  value={topicAnalytics.weakest?.topic || "Balanced"}
                  helper={topicAnalytics.weakest ? `${Math.round(topicAnalytics.weakest.accuracy)}% accuracy` : "No urgent gap"}
                  tone={topicAnalytics.weakest ? "amber" : "emerald"}
                  Icon={Target}
                />
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onOpenReadiness}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-[0_20px_55px_-34px_rgba(15,23,42,0.75)] transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                >
                  Open placement readiness
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="flex justify-center">
              <ScoreRing score={overallScore} size={150} stroke={10} tone={tone} label="Ready" />
            </div>
          </div>
        </Surface>

        <Surface compact>
          <SectionHeader eyebrow="Module profile" title="Four readiness signals" subtitle={statusMeta.description} />
          <div className="mt-5 space-y-4">
            <ProgressBar label="Overall readiness" value={overallScore} tone={tone} />
            <ProgressBar label="Preparation health" value={healthScore} tone={getScoreTone(healthScore)} />
            <ProgressBar label="Weekly momentum" value={Math.min(100, weeklyMomentum * 10)} tone={weeklyMomentum ? "emerald" : "amber"} />
          </div>
        </Surface>
      </div>
    </section>
  );
}

function SnapshotCards({ analytics, topicAnalytics, assessmentMovement, weeklyMomentum }) {
  const { problems, assessments, interviews, learning, derived } = analytics;
  const cards = [
    { label: "Problems Solved", value: problems.solved || 0, helper: `${problems.attempts || 0} attempts`, Icon: Code2, tone: "sky" },
    { label: "Assessment Accuracy", value: Math.round(assessments.avgAccuracy || assessments.avgScore || 0), suffix: "%", helper: `${assessments.attempts || 0} tests`, Icon: ClipboardList, tone: "emerald" },
    { label: "Interview Readiness", value: Math.round(interviews.avgScore || 0), helper: `${interviews.total || 0} sessions`, Icon: BriefcaseBusiness, tone: "amber" },
    { label: "Learning Progress", value: Math.round(learning.completionPercent || 0), suffix: "%", helper: `${learning.completedTopics || 0}/${learning.totalTopics || 0} topics`, Icon: GraduationCap, tone: "violet" },
    { label: "Weekly Consistency", value: weeklyMomentum, helper: `${Math.round(derived.consistencyScore || 0)}% consistency`, Icon: Activity, tone: "slate" },
    { label: "Strongest Skill", value: topicAnalytics.strongest?.accuracy || 0, suffix: "%", helper: topicAnalytics.strongest?.topic || "More attempts needed", Icon: Award, tone: "emerald" },
    { label: "Weakest Area", value: topicAnalytics.weakest?.accuracy || 0, suffix: "%", helper: topicAnalytics.weakest?.topic || "No weak topic found", Icon: Target, tone: topicAnalytics.weakest ? "amber" : "emerald" },
  ];

  return (
    <section className="mt-4">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
            Smart snapshot
          </div>
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">
            Key signals first
          </h2>
        </div>
        <TonePill tone={assessmentMovement.movement === null ? "sky" : assessmentMovement.movement >= 0 ? "emerald" : "rose"}>
          {assessmentMovement.movement === null ? "Trend warming up" : `${assessmentMovement.movement >= 0 ? "+" : ""}${assessmentMovement.movement}% test trend`}
        </TonePill>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((card) => (
          <div key={card.label} className="min-w-[220px] snap-start sm:min-w-0">
            <MetricCard {...card} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightLayer({ insights, onFocus }) {
  const priority = insights[0];
  const rest = insights.slice(1, 5);

  return (
    <section className="mt-4">
      <Surface compact>
        <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="rounded-[22px] border border-sky-200 bg-sky-50 p-4 dark:border-sky-400/15 dark:bg-sky-400/10">
            <div className="flex items-center gap-3">
              <IconBadge Icon={Zap} tone="sky" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                  Priority insight
                </div>
                <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">{priority.title}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-700 dark:text-slate-200">{priority.text}</p>
            <button
              type="button"
              onClick={onFocus}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white hover:bg-sky-500"
            >
              Review focus view
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">
            {rest.map((insight) => (
              <div key={insight.title} className="min-w-[240px] sm:min-w-0">
                <MiniMetric
                  label={insight.title}
                  value={insight.tone === "emerald" ? "Healthy" : insight.tone === "rose" ? "Needs action" : "Watch"}
                  helper={insight.text}
                  tone={insight.tone}
                  Icon={LineChart}
                />
              </div>
            ))}
          </div>
        </div>
      </Surface>
    </section>
  );
}

function AnalysisStudio({ active, onChange, moduleScores, analytics, topicAnalytics, assessmentMovement, categoryData, learningTimeline, learningMix }) {
  const selected = WORKSPACES.find((item) => item.id === active) || WORKSPACES[0];

  return (
    <section id="analysis-studio" className="mt-4 scroll-mt-28">
      <Surface className="overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-white/65 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader
              eyebrow="Analysis studio"
              title="One focused view at a time"
              subtitle="Switch modules in place instead of scrolling through a long report."
            />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:overflow-visible lg:px-0">
              {WORKSPACES.map((item) => {
                const score = moduleScores.find((scoreItem) => scoreItem.id === item.id)?.value || 0;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange(item.id)}
                    className={[
                      "flex min-w-[170px] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                      isActive
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.9)] dark:border-white dark:bg-white dark:text-slate-950"
                        : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200",
                    ].join(" ")}
                  >
                    <IconBadge Icon={item.Icon} tone={isActive ? "slate" : item.tone} className="h-9 w-9 rounded-xl" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{item.label}</span>
                      <span className={`mt-0.5 block text-xs font-semibold ${isActive ? "text-white/70 dark:text-slate-600" : "text-slate-400 dark:text-slate-500"}`}>
                        {score}%
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <motion.div
          key={active}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="p-4 sm:p-5"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <IconBadge Icon={selected.Icon} tone={selected.tone} className="h-11 w-11 rounded-2xl" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                  Active analysis
                </div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">{selected.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{selected.description}</p>
              </div>
            </div>
            <TonePill tone={selected.tone}>Focused</TonePill>
          </div>

          {active === "problems" ? <DsaWorkspace analytics={analytics} topicAnalytics={topicAnalytics} /> : null}
          {active === "assessments" ? <AssessmentWorkspace analytics={analytics} assessmentMovement={assessmentMovement} /> : null}
          {active === "interviews" ? <InterviewWorkspace analytics={analytics} categoryData={categoryData} /> : null}
          {active === "learning" ? <LearningWorkspace analytics={analytics} timeline={learningTimeline} mixData={learningMix} /> : null}
        </motion.div>
      </Surface>
    </section>
  );
}

function CompanyReadinessBlock({ companies, selectedCompany, onCompanyChange, readiness, loadingReadiness, comparison, onOpenReadiness }) {
  return (
    <section className="mt-4">
      <Surface>
        <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
          <div>
            <SectionHeader
              eyebrow="Placement intelligence"
              title="Company readiness"
              subtitle="Select a company benchmark and get a clear current-vs-target view."
            />
            <label className="mt-4 block">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Company</span>
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
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl bg-slate-50 text-sm font-bold text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating readiness
            </div>
          ) : readiness && comparison ? (
            <div className="grid gap-4 xl:grid-cols-[0.65fr_1.35fr]">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-center dark:border-white/10 dark:bg-white/[0.03]">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  {readiness.company?.companyName}
                </div>
                <div className="mt-4 flex justify-center">
                  <ScoreRing score={readiness.report?.readinessScore || 0} size={140} stroke={10} tone={getScoreTone(readiness.report?.readinessScore)} label="Fit" />
                </div>
                <button
                  type="button"
                  onClick={onOpenReadiness}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
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
              </div>
            </div>
          ) : (
            <EmptyState title="No company selected" text="Choose a benchmark to see placement readiness." Icon={BriefcaseBusiness} />
          )}
        </div>
      </Surface>
    </section>
  );
}

function WorkspaceRail({ active, onChange, moduleScores }) {
  const scoreMap = Object.fromEntries(moduleScores.map((item) => [item.id, item]));

  return (
    <Surface className="p-3">
      <div className="mb-3 px-2">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          Analyze
        </div>
        <div className="mt-1 text-sm font-black text-slate-950 dark:text-white">Choose one area</div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {WORKSPACES.map((item) => {
          const selected = active === item.id;
          const score = scoreMap[item.id]?.value || 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={[
                "group flex min-w-[210px] items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200 lg:min-w-0",
                selected
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.95)] dark:border-white dark:bg-white dark:text-slate-950"
                  : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-sky-200 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]",
              ].join(" ")}
            >
              <IconBadge Icon={item.Icon} tone={selected ? "slate" : item.tone} className="h-10 w-10 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{item.title}</span>
                <span className={`mt-0.5 block truncate text-xs font-semibold ${selected ? "text-white/70 dark:text-slate-600" : "text-slate-400 dark:text-slate-500"}`}>
                  {item.description}
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                  <span
                    className={`block h-full rounded-full ${
                      item.tone === "emerald"
                        ? "bg-emerald-500"
                        : item.tone === "amber"
                        ? "bg-amber-500"
                        : item.tone === "violet"
                        ? "bg-violet-500"
                        : "bg-sky-500"
                    }`}
                    style={{ width: `${clamp(score)}%` }}
                  />
                </span>
              </span>
              <span className="text-sm font-black">{score}%</span>
            </button>
          );
        })}
      </div>
    </Surface>
  );
}

function MetricStrip({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <MetricCard key={item.label} {...item} compact />
      ))}
    </div>
  );
}

function DsaWorkspace({ analytics, topicAnalytics }) {
  const { problems, consistency } = analytics;
  const radarData = [
    { label: "Accuracy", value: Math.round(problems.accuracy || 0) },
    { label: "Coverage", value: Math.min(100, topicAnalytics.active.length * 12) },
    { label: "Volume", value: Math.min(100, (problems.attempts || 0) * 4) },
    { label: "Strength", value: Math.min(100, topicAnalytics.strong.length * 16) },
    { label: "Routine", value: Math.min(100, (consistency.activeDays || 0) * 16) },
  ];

  return (
    <div className="space-y-4">
      <MetricStrip
        items={[
          { label: "Attempts", value: problems.attempts || 0, helper: "Submitted attempts", Icon: Gauge, tone: "sky" },
          { label: "Solved", value: problems.solved || 0, helper: "Accepted problems", Icon: CheckCircle2, tone: "emerald" },
          { label: "Accuracy", value: Math.round(problems.accuracy || 0), suffix: "%", helper: "Current DSA quality", Icon: TrendingUp, tone: getScoreTone(problems.accuracy) },
          { label: "Weak Topics", value: topicAnalytics.weak.length, helper: "Need revision", Icon: Target, tone: topicAnalytics.weak.length ? "amber" : "emerald" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <SectionHeader
            eyebrow="Topic mastery"
            title="Strength and weakness by topic"
            subtitle="Use this first: high bars are reliable topics, low bars are practice targets."
          />
          <div className="mt-4">
            <TopicMasteryChart data={topicAnalytics.normalized} />
          </div>
        </Surface>
        <Surface>
          <SectionHeader eyebrow="Skill shape" title="DSA profile" />
          <div className="mt-4">
            <RadarScoreChart data={radarData} minHeight={290} />
          </div>
        </Surface>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface>
          <SectionHeader eyebrow="Routine" title="Weekly practice rhythm" />
          <div className="mt-4">
            <ActivityDots points={consistency.weeklyActivity || []} tone="sky" />
          </div>
        </Surface>
        <Surface>
          <SectionHeader eyebrow="Focus queue" title="Topics to practice next" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(topicAnalytics.weak.length ? topicAnalytics.weak : topicAnalytics.lowVolume).slice(0, 4).map((topic) => (
              <div key={topic.topic} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-black text-slate-900 dark:text-white">{topic.topic}</div>
                  <span className="text-xs font-black text-slate-500 dark:text-slate-400">{Math.round(topic.accuracy)}%</span>
                </div>
                <div className="mt-3">
                  <ProgressBar value={topic.accuracy} tone={topic.accuracy < 55 ? "amber" : "sky"} />
                </div>
              </div>
            ))}
            {!topicAnalytics.weak.length && !topicAnalytics.lowVolume.length ? (
              <EmptyState title="No urgent DSA gap" text="Keep solving tagged problems to sharpen this queue." />
            ) : null}
          </div>
        </Surface>
      </div>
    </div>
  );
}

function AssessmentWorkspace({ analytics, assessmentMovement }) {
  const { assessments } = analytics;
  const progress = (assessments.progress || []).map((item, index) => ({
    label: item.label || `Test ${index + 1}`,
    value: Number(item.value || 0),
  }));
  const prediction = assessmentMovement.recentAverage
    ? clamp(assessmentMovement.recentAverage + Math.max(-8, Math.min(8, assessmentMovement.movement || 0)))
    : assessments.latestScore || assessments.avgScore || 0;

  return (
    <div className="space-y-4">
      <MetricStrip
        items={[
          { label: "Submitted", value: assessments.attempts || 0, helper: "Completed tests", Icon: ClipboardList, tone: "sky" },
          { label: "Average", value: Math.round(assessments.avgScore || 0), suffix: "%", helper: "Current baseline", Icon: TrendingUp, tone: getScoreTone(assessments.avgScore) },
          { label: "Highest", value: Math.round(assessments.highestScore || 0), suffix: "%", helper: "Best score", Icon: Award, tone: "emerald" },
          { label: "Prediction", value: Math.round(prediction || 0), suffix: "%", helper: "Next-score estimate", Icon: LineChart, tone: "violet" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <SectionHeader
            eyebrow="Performance trend"
            title="Assessment score movement"
            subtitle="A simple timeline to show whether test performance is rising or unstable."
          />
          <div className="mt-4">
            <TrendAreaChart data={progress} color={CHART_COLORS.emerald} />
          </div>
        </Surface>
        <Surface>
          <SectionHeader eyebrow="Stability" title="Test consistency" />
          <div className="mt-5 space-y-5">
            <MiniMetric
              label="Recent movement"
              value={assessmentMovement.movement === null ? "Not enough data" : `${assessmentMovement.movement >= 0 ? "+" : ""}${assessmentMovement.movement}%`}
              helper="Last five vs previous five tests"
              tone={assessmentMovement.movement === null ? "sky" : assessmentMovement.movement >= 0 ? "emerald" : "rose"}
              Icon={BarChart3}
            />
            <ProgressBar
              label="Score stability"
              value={Math.max(0, 100 - assessmentMovement.spread)}
              tone={assessmentMovement.spread <= 12 ? "emerald" : "amber"}
            />
            <ProgressBar
              label="Average accuracy"
              value={assessments.avgAccuracy || assessments.avgScore || 0}
              tone={getScoreTone(assessments.avgAccuracy || assessments.avgScore)}
            />
          </div>
        </Surface>
      </div>
    </div>
  );
}

function InterviewWorkspace({ analytics, categoryData }) {
  const { interviews } = analytics;
  const lowestCategory = categoryData.length ? [...categoryData].sort((a, b) => a.value - b.value)[0] : null;

  return (
    <div className="space-y-4">
      <MetricStrip
        items={[
          { label: "Completed", value: interviews.total || 0, helper: "Reviewed mocks", Icon: MessageSquare, tone: "sky" },
          { label: "Rating", value: Math.round(interviews.avgScore || 0), helper: "Feedback average", Icon: TrendingUp, tone: getScoreTone(interviews.avgScore) },
          { label: "Pending", value: interviews.pending || 0, helper: "Upcoming sessions", Icon: CalendarCheck, tone: "amber" },
          { label: "Focus", value: lowestCategory?.value || 0, suffix: "%", helper: lowestCategory?.label || "No category yet", Icon: Target, tone: lowestCategory ? "violet" : "slate" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface>
          <SectionHeader eyebrow="Interview profile" title="Feedback radar" />
          <div className="mt-4">
            <RadarScoreChart data={categoryData} minHeight={300} />
          </div>
        </Surface>
        <Surface>
          <SectionHeader eyebrow="Rating distribution" title="Mock interview scores" />
          <div className="mt-4">
            <PremiumBarChart data={interviews.ratingDistribution || []} color={CHART_COLORS.amber} minHeight={300} />
          </div>
        </Surface>
      </div>

      <Surface>
        <SectionHeader eyebrow="Feedback themes" title="What to improve" />
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
            <div className="text-sm font-black text-slate-900 dark:text-white">
              {lowestCategory ? `${lowestCategory.label} is the current interview lever.` : "Interview insight will unlock after feedback."}
            </div>
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
  );
}

function LearningWorkspace({ analytics, timeline, mixData }) {
  const { learning } = analytics;
  const practiceConversion = learning.videosWatched
    ? Math.round(((learning.practiceSolved || 0) / learning.videosWatched) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <MetricStrip
        items={[
          { label: "Courses", value: learning.coursesEnrolled || 0, helper: "Started modules", Icon: GraduationCap, tone: "sky" },
          { label: "Videos", value: learning.videosWatched || 0, helper: "Watched lessons", Icon: Video, tone: "emerald" },
          { label: "Topics Done", value: learning.completedTopics || 0, helper: `${learning.totalTopics || 0} tracked`, Icon: CheckCircle2, tone: "amber" },
          { label: "Practice", value: learning.practiceSolved || 0, helper: "Applied learning", Icon: Target, tone: "violet" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <SectionHeader eyebrow="Study rhythm" title="Learning activity over time" />
          <div className="mt-4">
            <TrendAreaChart data={timeline} color={CHART_COLORS.violet} suffix="" />
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
          <SectionHeader eyebrow="Completion" title="Course progress" />
          <div className="mt-5 space-y-5">
            <ProgressBar label="Topic completion" value={learning.completionPercent || 0} tone={getScoreTone(learning.completionPercent)} />
            <ProgressBar label="Practice conversion" value={practiceConversion} tone={practiceConversion >= 70 ? "emerald" : "amber"} />
          </div>
        </Surface>
        <Surface>
          <SectionHeader eyebrow="Weekly rhythm" title="Consistency map" />
          <div className="mt-5">
            <ActivityDots points={timeline} tone="violet" />
          </div>
        </Surface>
      </div>
    </div>
  );
}

function WorkspacePanel({ active, analytics, topicAnalytics, assessmentMovement, categoryData, learningTimeline, learningMix }) {
  const workspace = WORKSPACES.find((item) => item.id === active) || WORKSPACES[0];

  return (
    <Surface className="min-w-0 p-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <IconBadge Icon={workspace.Icon} tone={workspace.tone} className="h-11 w-11 rounded-2xl" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Active analysis
            </div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">{workspace.title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{workspace.description}</p>
          </div>
        </div>
        <TonePill tone={workspace.tone}>Focused view</TonePill>
      </div>

      <motion.div
        key={active}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="p-4 sm:p-5"
      >
        {active === "problems" ? <DsaWorkspace analytics={analytics} topicAnalytics={topicAnalytics} /> : null}
        {active === "assessments" ? <AssessmentWorkspace analytics={analytics} assessmentMovement={assessmentMovement} /> : null}
        {active === "interviews" ? <InterviewWorkspace analytics={analytics} categoryData={categoryData} /> : null}
        {active === "learning" ? <LearningWorkspace analytics={analytics} timeline={learningTimeline} mixData={learningMix} /> : null}
      </motion.div>
    </Surface>
  );
}

function GuidancePanel({
  insights,
  analytics,
  readiness,
  companies,
  selectedCompany,
  onCompanyChange,
  loadingReadiness,
  comparison,
  onOpenReadiness,
}) {
  const topInsights = insights.slice(0, 4);

  return (
    <div className="space-y-4">
      <Surface>
        <SectionHeader eyebrow="Next best action" title="What to do now" />
        <div className="mt-4 space-y-3">
          {topInsights.map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-900 dark:text-white">{item.title}</div>
                <TonePill tone={item.tone}>{item.tone === "emerald" ? "Good" : "Focus"}</TonePill>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.text}</p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface>
        <SectionHeader eyebrow="Company fit" title="Placement benchmark" />
        <label className="mt-4 block">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            Company
          </span>
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

        <div className="mt-4">
          {loadingReadiness ? (
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating fit
            </div>
          ) : readiness ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    {readiness.company?.companyName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {comparison?.label || "Overall readiness"}
                  </div>
                </div>
                <TonePill tone={getScoreTone(readiness.report?.readinessScore)}>
                  {formatPercent(readiness.report?.readinessScore)}
                </TonePill>
              </div>
              <div className="mt-4 space-y-3">
                <ProgressBar label="Current" value={comparison?.current || readiness.report?.readinessScore || 0} tone={getScoreTone(comparison?.current || readiness.report?.readinessScore)} />
                <ProgressBar label="Target" value={comparison?.target || 85} tone="slate" />
              </div>
              <button
                type="button"
                onClick={onOpenReadiness}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                Open roadmap
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <EmptyState title="No company selected" text="Choose a benchmark to see placement readiness." Icon={BriefcaseBusiness} />
          )}
        </div>
      </Surface>

      <Surface>
        <SectionHeader eyebrow="This week" title="Consistency" />
        <div className="mt-4">
          <ActivityDots points={analytics.consistency.weeklyActivity || []} tone="emerald" />
        </div>
      </Surface>
    </div>
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
    <motion.div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/78 p-4 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_40px_130px_-65px_rgba(0,0,0,0.9)] dark:bg-slate-950"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-white/10">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
              Placement roadmap
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
              {readiness?.company?.companyName || "Company readiness"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
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
                <DataChip label="Attempts" value={analytics.problems.attempts || 0} tone="violet" />
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
              <div className="text-2xl font-black text-slate-950 dark:text-white">
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
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white dark:bg-white dark:text-slate-950">
                    {index + 1}
                  </div>
                  <div className="text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{valueText(step)}</div>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </motion.div>
    </motion.div>
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
  const [activeWorkspace, setActiveWorkspace] = useState("problems");
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

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen pb-10 pt-24 text-slate-950 dark:text-white">
      <PageBackground />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ErrorBanner error={error} onRetry={refresh} />

        <RestoredHero
          overallScore={overallScore}
          overallStatus={overallStatus}
          healthScore={healthScore}
          activeModules={activeModules}
          weeklyMomentum={weeklyMomentum}
          topicAnalytics={topicAnalytics}
          refreshing={refreshing}
          onRefresh={refresh}
          onOpenReadiness={() => {
            document.getElementById("company-readiness")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />

        <SnapshotCards
          analytics={analytics}
          topicAnalytics={topicAnalytics}
          assessmentMovement={assessmentMovement}
          weeklyMomentum={weeklyMomentum}
        />

        <InsightLayer
          insights={insights}
          onFocus={() => {
            setActiveWorkspace(topicAnalytics.weakest ? "problems" : activeWorkspace);
            document.getElementById("analysis-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />

        <AnalysisStudio
          active={activeWorkspace}
          onChange={setActiveWorkspace}
          moduleScores={moduleScores}
          analytics={analytics}
          topicAnalytics={topicAnalytics}
          assessmentMovement={assessmentMovement}
          categoryData={categoryData}
          learningTimeline={learningTimeline}
          learningMix={learningMix}
        />

        <div id="company-readiness" className="scroll-mt-28">
          <CompanyReadinessBlock
            companies={companies}
            selectedCompany={selectedCompany}
            onCompanyChange={changeCompany}
            readiness={readiness}
            loadingReadiness={loadingReadiness}
            comparison={comparison}
            onOpenReadiness={() => setReadinessOpen(true)}
          />
        </div>
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
