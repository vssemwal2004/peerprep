import { Activity, BarChart3, CalendarDays, Flame, Target, TrendingUp } from "lucide-react";
import { HorizontalMetricChart, TrendAreaChart } from "../AnalyticsCharts";
import {
  ActionCard,
  EvidencePanel,
  MetricGrid,
  MetricTile,
  Panel,
  PanelHeader,
  ScoreBar,
  ScoreSummary,
  StatusBadge,
} from "../AnalyticsShared";
import { CHART_COLORS, getScoreTone, STATUS_STYLES } from "../analyticsUtils";

function resolveFocusSection(focus = "") {
  const value = String(focus).toLowerCase();
  if (value.includes("assessment") || value.includes("integrity")) return "assessments";
  if (value.includes("interview") || value.includes("mock")) return "interviews";
  if (value.includes("learning") || value.includes("course")) return "learning";
  return "coding";
}

export default function OverviewAnalyticsPage({ analytics, readinessScore, overallStatus, moduleScores, activitySeries, onNavigate }) {
  const { overview, consistency, derived, explanations } = analytics;
  const hasEvidence = moduleScores.some((item) => item.available);
  const activeModules = moduleScores.filter((item) => item.available).length;
  const totalActivity = activitySeries.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const latestAction = explanations.overview?.[0]?.action;
  const focus = overview.currentFocus || "Build more tracked activity";
  const availableModules = moduleScores.filter((item) => item.available);
  const strongest = [...availableModules].sort((a, b) => b.value - a.value)[0];
  const weakest = [...availableModules].sort((a, b) => a.value - b.value)[0];
  const statusMeta = STATUS_STYLES[overallStatus] || STATUS_STYLES.Improving;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <ScoreSummary
          score={readinessScore}
          status={overallStatus}
          available={hasEvidence}
          detail={hasEvidence ? statusMeta.description : "Use PeerPrep modules to build a reliable readiness signal."}
        />
        <ActionCard
          title={focus}
          reason={explanations.overview?.[0]?.summary || "Your next priority will update as new evidence arrives."}
          action={latestAction}
          onClick={() => onNavigate(resolveFocusSection(focus))}
          buttonLabel="View details"
          tone={weakest && weakest.value < 55 ? "amber" : "sky"}
        />
      </div>

      <MetricGrid>
        <MetricTile label="Performance" value={Math.round(derived.performanceScore || 0)} suffix="%" helper="Across scored modules" Icon={TrendingUp} tone={getScoreTone(derived.performanceScore)} available={hasEvidence} />
        <MetricTile label="Consistency" value={Math.round(derived.consistencyScore || 0)} suffix="%" helper={`${consistency.activeDays || 0} active days`} Icon={CalendarDays} tone={getScoreTone(derived.consistencyScore)} available={totalActivity > 0} />
        <MetricTile label="Current streak" value={consistency.currentStreak || 0} helper="Consecutive active days" Icon={Flame} tone={(consistency.currentStreak || 0) >= 5 ? "emerald" : "amber"} available={totalActivity > 0} />
        <MetricTile label="Tracked activity" value={totalActivity} helper="Platform events in the last 7 days" Icon={Activity} tone="sky" available={totalActivity > 0} />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel className="p-5">
          <PanelHeader
            eyebrow="Current profile"
            title="Performance by area"
            description="Only modules with student evidence are included."
            action={<StatusBadge tone="slate">{activeModules}/4 active</StatusBadge>}
          />
          <div className="mt-4">
            <HorizontalMetricChart
              data={availableModules.map((item) => ({ label: item.label, value: item.value }))}
              suffix="%"
              domain={[0, 100]}
              color={CHART_COLORS.sky}
              minHeight={250}
            />
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader eyebrow="7-day pattern" title="Activity trend" description="Tracked platform events across PeerPrep." />
          <div className="mt-4">
            <TrendAreaChart data={totalActivity > 0 ? activitySeries : []} suffix="" minHeight={250} color={CHART_COLORS.sky} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-5">
          <PanelHeader title="Strengths & attention" eyebrow="Profile" />
          <div className="mt-5 space-y-5">
            {strongest ? (
              <ScoreBar label={`Strongest · ${strongest.label}`} value={strongest.value} helper={strongest.helper} tone="emerald" />
            ) : (
              <ScoreBar label="Strongest area" value={0} available={false} helper="Complete tracked activity to build this view." />
            )}
            {weakest ? (
              <ScoreBar label={`Focus · ${weakest.label}`} value={weakest.value} helper={weakest.helper} tone={getScoreTone(weakest.value)} />
            ) : (
              <ScoreBar label="Focus area" value={0} available={false} helper="No reliable focus area yet." />
            )}
            <div className="rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><Target className="h-4 w-4 text-sky-500" /> Current priority</div>
              <p className="mt-1.5">{focus}</p>
            </div>
          </div>
        </Panel>
        <EvidencePanel items={explanations.overview} title="How readiness is calculated" />
      </div>
    </div>
  );
}
