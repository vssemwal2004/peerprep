import { CalendarClock, MessageSquare, Star, Target, UsersRound } from "lucide-react";
import { HorizontalMetricChart, PremiumBarChart } from "../AnalyticsCharts";
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
import { CHART_COLORS, getScoreTone } from "../analyticsUtils";

export default function InterviewAnalyticsPage({ analytics, categoryData }) {
  const { interviews, explanations } = analytics;
  const hasReviews = Number(interviews.total || 0) > 0;
  const visibleCategories = hasReviews
    ? categoryData.filter((item) => Number(item.value || 0) > 0)
    : [];
  const lowest = visibleCategories.length ? [...visibleCategories].sort((a, b) => a.value - b.value)[0] : null;
  const strongest = visibleCategories.length ? [...visibleCategories].sort((a, b) => b.value - a.value)[0] : null;
  const distribution = hasReviews ? (interviews.ratingDistribution || []) : [];
  const insight = explanations.interview?.[0];

  return (
    <div className="space-y-4">
      <ActionCard
        title={lowest ? `Improve ${lowest.label}` : hasReviews ? "Competency breakdown unavailable" : "Complete a reviewed mock interview"}
        reason={insight?.summary || "Reviewed feedback is required for competency analytics."}
        action={lowest || !hasReviews ? insight?.action : "Your overall score is available, but detailed competency ratings were not submitted with the review."}
        tone={lowest && lowest.value < 60 ? "amber" : "sky"}
      />

      <MetricGrid>
        <MetricTile label="Reviewed mocks" value={interviews.total || 0} helper="Feedback received" Icon={UsersRound} tone="sky" available={hasReviews} />
        <MetricTile label="Average score" value={Math.round(interviews.avgScore || 0)} suffix="%" helper="Across reviewed sessions" Icon={Star} tone={getScoreTone(interviews.avgScore)} available={hasReviews} />
        <MetricTile label="Scheduled" value={interviews.pending || 0} helper="Pending or upcoming sessions" Icon={CalendarClock} tone="amber" available={hasReviews || Number(interviews.pending || 0) > 0} />
        <MetricTile label="Priority skill" value={lowest?.label || "—"} helper={lowest ? `${Math.round(lowest.value)}% competency score` : "Waiting for feedback"} Icon={Target} tone={lowest ? getScoreTone(lowest.value) : "slate"} available={Boolean(lowest)} />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-5">
          <PanelHeader
            eyebrow="Competencies"
            title="Reviewed interview profile"
            description="Scores are aggregated from reviewer feedback."
            action={hasReviews ? <StatusBadge tone={getScoreTone(interviews.avgScore)}>{Math.round(interviews.avgScore || 0)}% overall</StatusBadge> : null}
          />
          <div className="mt-4">
            <HorizontalMetricChart data={visibleCategories} suffix="%" domain={[0, 100]} color={CHART_COLORS.sky} minHeight={300} />
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader eyebrow="Distribution" title="Feedback score bands" description="Number of reviewed mocks in each score range." />
          <div className="mt-4">
            <PremiumBarChart data={distribution} color={CHART_COLORS.sky} minHeight={300} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel className="p-5">
          <PanelHeader eyebrow="Profile" title="Strongest and weakest signals" />
          {visibleCategories.length ? (
            <div className="mt-5 space-y-6">
              <ScoreBar label={`Strongest · ${strongest.label}`} value={strongest.value} tone="emerald" />
              <ScoreBar label={`Focus · ${lowest.label}`} value={lowest.value} />
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Feedback focus</div>
                <div className="flex flex-wrap gap-2">
                  {(interviews.tags || []).map((tag) => <StatusBadge key={tag} tone="slate">{tag}</StatusBadge>)}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4"><EmptyPanel title="No reviewed feedback" text="Competency strengths and priorities appear after interviewer feedback is submitted." /></div>
          )}
        </Panel>
        <EvidencePanel items={explanations.interview} title="Interview score evidence" />
      </div>

      {!hasReviews && Number(interviews.pending || 0) > 0 ? (
        <Panel className="flex items-start gap-3 p-4">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
          <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">You have an upcoming interview session. Analytics will update after reviewed feedback is submitted.</p>
        </Panel>
      ) : null}
    </div>
  );
}
