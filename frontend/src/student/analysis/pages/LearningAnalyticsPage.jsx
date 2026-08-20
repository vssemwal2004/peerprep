import { BookOpen, CheckCircle2, GraduationCap, PlayCircle, Target } from "lucide-react";
import { HorizontalMetricChart, TrendAreaChart } from "../AnalyticsCharts";
import {
  ActionCard,
  EvidencePanel,
  MetricGrid,
  MetricTile,
  Panel,
  PanelHeader,
  ScoreBar,
  StatusBadge,
} from "../AnalyticsShared";
import { CHART_COLORS, getScoreTone } from "../analyticsUtils";

export default function LearningAnalyticsPage({ analytics, activitySeries }) {
  const { learning, explanations } = analytics;
  const hasLearning = Number(learning.totalTopics || 0) > 0 || Number(learning.coursesEnrolled || 0) > 0;
  const completion = Number(learning.completionPercent || 0);
  const totalActivity = activitySeries.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const footprintValues = [
    { label: "Topics completed", value: Number(learning.completedTopics || 0) },
    { label: "Videos watched", value: Number(learning.videosWatched || 0) },
    { label: "Coding accepted", value: Number(learning.practiceSolved || 0) },
  ];
  const footprint = hasLearning || Number(learning.practiceSolved || 0) > 0 ? footprintValues : [];
  const insight = explanations.learning?.[0];

  return (
    <div className="space-y-4">
      <ActionCard
        title={hasLearning ? "Turn learning into practice" : "Start a learning path"}
        reason={insight?.summary || "Course activity is required for a learning progress signal."}
        action={insight?.action}
        tone={completion >= 70 ? "emerald" : "sky"}
      />

      <MetricGrid>
        <MetricTile label="Courses" value={learning.coursesEnrolled || 0} helper="Enrolled learning paths" Icon={GraduationCap} tone="sky" available={hasLearning} />
        <MetricTile label="Completion" value={Math.round(completion)} suffix="%" helper={`${learning.completedTopics || 0} of ${learning.totalTopics || 0} topics`} Icon={CheckCircle2} tone={getScoreTone(completion)} available={Number(learning.totalTopics || 0) > 0} />
        <MetricTile label="Videos watched" value={learning.videosWatched || 0} helper="Lessons with viewing activity" Icon={PlayCircle} tone="sky" available={hasLearning} />
        <MetricTile label="Accepted submissions" value={learning.practiceSolved || 0} helper="Platform-wide; not linked to a lesson" Icon={Target} tone="emerald" available={Number(learning.practiceSolved || 0) > 0} />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-5">
          <PanelHeader
            eyebrow="Progress"
            title="Learning completion"
            description="Course topics completed from your tracked learning paths."
            action={hasLearning ? <StatusBadge tone={getScoreTone(completion)}>{Math.round(completion)}% complete</StatusBadge> : null}
          />
          <div className="mt-6 space-y-6">
            <ScoreBar
              label="Topic completion"
              value={completion}
              available={Number(learning.totalTopics || 0) > 0}
              helper={hasLearning ? `${learning.completedTopics || 0} completed · ${Math.max(0, (learning.totalTopics || 0) - (learning.completedTopics || 0))} remaining` : "No learning topics are tracked yet"}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <BookOpen className="h-4 w-4 text-sky-500" />
              <div className="mt-3 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{learning.completedTopics || 0}<span className="ml-1 text-sm font-medium text-slate-400">/ {learning.totalTopics || 0}</span></div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tracked topics completed</div>
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader eyebrow="Learning footprint" title="Study and application signals" description="Counts are shown separately; they are not treated as a conversion funnel." />
          <div className="mt-4">
            <HorizontalMetricChart data={footprint} suffix="" color={CHART_COLORS.sky} minHeight={280} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-5">
          <PanelHeader eyebrow="7-day context" title="Overall platform activity" description="All tracked PeerPrep events; module-specific learning history is not yet available." />
          <div className="mt-4">
            <TrendAreaChart data={totalActivity > 0 ? activitySeries : []} suffix="" minHeight={260} color={CHART_COLORS.sky} />
          </div>
          {totalActivity > 0 ? <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">{totalActivity} tracked events recorded across the platform.</div> : null}
        </Panel>
        <EvidencePanel items={explanations.learning} title="Learning score evidence" />
      </div>
    </div>
  );
}
