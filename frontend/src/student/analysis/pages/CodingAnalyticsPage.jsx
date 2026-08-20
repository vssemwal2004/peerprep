import { CheckCircle2, Code2, Crosshair, Layers3, Target, TrendingUp } from "lucide-react";
import { TopicMasteryChart } from "../AnalyticsCharts";
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

function TopicRow({ topic, minimumAttempts, isFocus = false }) {
  const enoughEvidence = Number(topic.attempts || 0) >= minimumAttempts;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{topic.topic}</div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {topic.attempts} attempt{topic.attempts === 1 ? "" : "s"} · {enoughEvidence ? "Verified signal" : "Early signal"}
          </div>
        </div>
        <StatusBadge tone={isFocus ? "amber" : getScoreTone(topic.accuracy)}>{formatPercent(topic.accuracy)}</StatusBadge>
      </div>
      <div className="mt-3">
        <ScoreBar label="Accuracy" value={topic.accuracy} tone={isFocus ? "amber" : getScoreTone(topic.accuracy)} />
      </div>
    </div>
  );
}

export default function CodingAnalyticsPage({ analytics, topicAnalytics }) {
  const { problems, explanations } = analytics;
  const minimumTopicAttempts = Number(analytics.scoreModel?.topicMinimumAttempts || 4);
  const hasAttempts = Number(problems.attempts || 0) > 0;
  const verifiedTopics = topicAnalytics.active.filter((topic) => Number(topic.attempts || 0) >= minimumTopicAttempts);
  const verifiedWeak = verifiedTopics.filter((topic) => topic.level === "weak" || topic.accuracy < 55);
  const verifiedStrong = verifiedTopics.filter((topic) => topic.level === "strong" || topic.accuracy >= 75);
  const weakestVerified = [...verifiedWeak].sort((a, b) => a.accuracy - b.accuracy)[0] || null;
  const earlySignals = topicAnalytics.active.filter((topic) => Number(topic.attempts || 0) < minimumTopicAttempts);
  const focusTopics = (verifiedWeak.length ? verifiedWeak : earlySignals).slice(0, 5);
  const actionInsight = explanations.coding?.[0];
  const coverage = topicAnalytics.active.length;

  return (
    <div className="space-y-4">
      <ActionCard
        title={weakestVerified?.topic || "Build topic-level evidence"}
        reason={
          weakestVerified
            ? `${weakestVerified.attempts} attempts at ${formatPercent(weakestVerified.accuracy)} accuracy.`
            : `At least ${minimumTopicAttempts} tagged attempts are required before a topic is treated as a verified priority.`
        }
        action={weakestVerified ? actionInsight?.action : "Add tagged attempts across active topics before treating accuracy as a stable signal."}
        tone={weakestVerified ? "amber" : "sky"}
      />

      <MetricGrid>
        <MetricTile label="Submissions" value={problems.attempts || 0} helper="Tracked coding attempts" Icon={Code2} tone="sky" available={hasAttempts} />
        <MetricTile label="Unique solved" value={problems.solved || 0} helper={`${problems.acceptedSubmissions ?? problems.solved ?? 0} accepted submissions`} Icon={CheckCircle2} tone="emerald" available={hasAttempts} />
        <MetricTile label="Accuracy" value={Math.round(problems.accuracy || 0)} suffix="%" helper="Accepted submission rate" Icon={TrendingUp} tone={getScoreTone(problems.accuracy)} available={hasAttempts} />
        <MetricTile label="Topic coverage" value={coverage} helper="Topics with at least one attempt" Icon={Layers3} tone="sky" available={coverage > 0} />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel className="p-5">
          <PanelHeader
            eyebrow="Topic performance"
            title="Accuracy with evidence volume"
            description="Topics are ordered by accuracy; hover a bar to see attempt count."
            action={hasAttempts ? <StatusBadge tone={getScoreTone(problems.accuracy)}>{formatPercent(problems.accuracy)} overall</StatusBadge> : null}
          />
          <div className="mt-4">
            <TopicMasteryChart data={topicAnalytics.normalized} />
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader eyebrow="Practice queue" title="What to work on next" description="Verified low accuracy is prioritized; sparse topics remain early signals." />
          <div className="mt-4 space-y-3">
            {focusTopics.length ? focusTopics.map((topic) => <TopicRow key={topic.topic} topic={topic} minimumAttempts={minimumTopicAttempts} isFocus />) : (
              <EmptyPanel title="No verified topic gap" text="Solve tagged problems to create a reliable practice queue." />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel className="p-5">
          <PanelHeader title="Coverage quality" eyebrow="Evidence" />
          <div className="mt-5 space-y-5">
            <ScoreBar
              label="Overall accuracy"
              value={problems.accuracy || 0}
              available={hasAttempts}
              helper={hasAttempts ? `${problems.acceptedSubmissions ?? problems.solved ?? 0} accepted from ${problems.attempts || 0} submissions` : "No coding submissions yet"}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 p-3.5 dark:bg-emerald-400/10">
                <Crosshair className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                <div className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{verifiedStrong.length}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">High-accuracy topics</div>
              </div>
              <div className="rounded-xl bg-amber-50 p-3.5 dark:bg-amber-400/10">
                <Target className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                <div className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{verifiedWeak.length}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Verified gaps</div>
              </div>
            </div>
          </div>
        </Panel>
        <EvidencePanel items={explanations.coding} title="Coding score evidence" />
      </div>
    </div>
  );
}
