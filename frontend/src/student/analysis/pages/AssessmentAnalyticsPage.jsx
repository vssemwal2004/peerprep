import { Award, Clock3, Gauge, ShieldCheck, TrendingUp } from "lucide-react";
import { AssessmentScoreChart } from "../AnalyticsCharts";
import {
  ActionCard,
  EmptyPanel,
  EvidencePanel,
  MetricGrid,
  MetricTile,
  Panel,
  PanelHeader,
  ScoreBar,
  StatusBadge,
} from "../AnalyticsShared";
import { formatPercent, getScoreTone } from "../analyticsUtils";

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "—";
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function RecentAssessmentTable({ attempts }) {
  if (!attempts.length) return <EmptyPanel title="No submitted assessments" text="Recent score checkpoints will appear after your first submitted assessment." />;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Normalized</th>
              <th className="px-4 py-3">Adjusted</th>
              <th className="px-4 py-3">Reliability</th>
              <th className="px-4 py-3 text-right">Warnings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-white/10 dark:bg-transparent">
            {attempts.map((item, index) => (
              <tr key={`${item.label}-${index}`} className="text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.03]">
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900 dark:text-white">{item.label || `Attempt ${index + 1}`}</td>
                <td className="px-4 py-3 tabular-nums">{formatPercent(item.rawScore, "—")}</td>
                <td className="px-4 py-3 tabular-nums font-semibold text-sky-700 dark:text-sky-300">{formatPercent(item.adjustedScore ?? item.value, "—")}</td>
                <td className="px-4 py-3"><StatusBadge tone={getScoreTone(item.integrityScore)}>{formatPercent(item.integrityScore, "—")}</StatusBadge></td>
                <td className="px-4 py-3 text-right tabular-nums">{item.violationCount || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AssessmentAnalyticsPage({ analytics, assessmentMovement }) {
  const { assessments, explanations } = analytics;
  const hasFinalAttempts = Number(assessments.attempts || 0) > 0;
  const hasScoreEvidence = Number(assessments.validScoreAttempts ?? assessments.attempts ?? 0) > 0;
  const adjustedAverage = Number(assessments.adjustedAvgScore ?? assessments.avgScore ?? 0);
  const progress = assessments.progress || [];
  const movement = assessmentMovement.movement;
  const insight = explanations.assessment?.[0];

  return (
    <div className="space-y-4">
      <ActionCard
        title={assessments.integrityScore < 85 && hasFinalAttempts ? "Improve assessment reliability" : "Review before the next timed attempt"}
        reason={insight?.summary || "Assessment guidance appears after a submitted test."}
        action={insight?.action}
        tone={assessments.integrityScore < 85 && hasFinalAttempts ? "amber" : "sky"}
      />

      <MetricGrid columns={5}>
        <MetricTile label="Final attempts" value={assessments.attempts || 0} helper={`${assessments.invalidScoreAttempts || 0} excluded for invalid maximum marks`} Icon={Gauge} tone="sky" available={hasFinalAttempts} />
        <MetricTile label="Adjusted average" value={Math.round(adjustedAverage)} suffix="%" helper="Reliability-adjusted normalized score" Icon={TrendingUp} tone={getScoreTone(adjustedAverage)} available={hasScoreEvidence} />
        <MetricTile label="Latest score" value={Math.round(assessments.latestAdjustedScore ?? 0)} suffix="%" helper="Latest adjusted result" Icon={Award} tone={getScoreTone(assessments.latestAdjustedScore)} available={hasScoreEvidence} />
        <MetricTile label="Reliability" value={Math.round(assessments.integrityScore ?? 0)} suffix="%" helper={`${assessments.securityRisk || "unknown"} risk`} Icon={ShieldCheck} tone={getScoreTone(assessments.integrityScore)} available={hasFinalAttempts} />
        <MetricTile label="Average time" value={formatDuration(assessments.avgTimeTakenSec)} helper="Per final attempt" Icon={Clock3} tone="slate" available={hasFinalAttempts && Number(assessments.avgTimeTakenSec || 0) > 0} />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel className="p-5">
          <PanelHeader
            eyebrow="Score history"
            title="Raw and adjusted performance"
            description="Adjusted scores account for assessment reliability signals."
            action={movement === null ? <StatusBadge tone="slate">Building trend</StatusBadge> : <StatusBadge tone={movement >= 0 ? "emerald" : "rose"}>{movement >= 0 ? "+" : ""}{movement}% recent</StatusBadge>}
          />
          <div className="mt-4">
            <AssessmentScoreChart data={progress} minHeight={320} />
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader eyebrow="Quality" title="Stability & reliability" description="Stable results make the performance signal easier to trust." />
          <div className="mt-6 space-y-6">
            <ScoreBar label="Score stability" value={assessments.stabilityScore ?? 0} available={progress.length >= 2} helper="Variation across recent adjusted scores" />
            <ScoreBar label="Assessment reliability" value={assessments.integrityScore ?? 0} available={hasFinalAttempts} helper={`${assessments.violationAttempts || 0} flagged attempt${assessments.violationAttempts === 1 ? "" : "s"}`} />
            <ScoreBar label="Best score" value={assessments.highestScore ?? 0} available={hasScoreEvidence} helper="Highest normalized result" tone="emerald" />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
              Reliability summarizes assessment conditions. Detailed monitoring evidence remains protected.
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <PanelHeader eyebrow="Recent attempts" title="Assessment checkpoints" description="The latest submitted assessments, newest first." />
        <div className="mt-4"><RecentAssessmentTable attempts={assessments.recentAttempts || []} /></div>
      </Panel>

      <EvidencePanel items={explanations.assessment} title="Assessment score evidence" />
    </div>
  );
}
