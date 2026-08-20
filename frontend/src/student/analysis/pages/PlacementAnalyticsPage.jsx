import { BriefcaseBusiness, Building2, CheckCircle2, Loader2, Target } from "lucide-react";
import { BenchmarkComparisonChart } from "../AnalyticsCharts";
import {
  CheckList,
  EmptyPanel,
  EvidencePanel,
  Panel,
  PanelHeader,
  ScoreSummary,
  StatusBadge,
} from "../AnalyticsShared";
import { getScoreTone } from "../analyticsUtils";

function GapList({ gaps = [] }) {
  if (!gaps.length) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="text-sm font-semibold">No major benchmark gap</div>
          <p className="mt-1 text-xs leading-5 opacity-80">Current evidence meets the configured company thresholds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap, index) => {
        const current = Number(gap.current || 0);
        const required = Number(gap.required || 0);
        const ratio = required > 0 ? Math.min(100, (current / required) * 100) : 0;
        return (
          <div key={`${gap.type}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{gap.type}</div>
              <div className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{current} / {required}</div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${ratio}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{gap.message}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function PlacementAnalyticsPage({ analytics, companies, selectedCompany, onCompanyChange, readiness, loadingReadiness, companiesError }) {
  const report = readiness?.report;
  const company = readiness?.company;
  const hasSelection = Boolean(selectedCompany);
  const inferredEvidence = Number(analytics.problems?.attempts || 0) > 0
    || Number(analytics.assessments?.attempts || 0) > 0
    || Number(analytics.interviews?.total || 0) > 0
    || Number(analytics.learning?.totalTopics || 0) > 0;
  const hasStudentEvidence = typeof analytics.evidence?.hasEvidence === "boolean"
    ? analytics.evidence.hasEvidence
    : inferredEvidence;
  const hasPreparationScore = hasStudentEvidence && Number.isFinite(report?.readinessScore);
  const comparisonData = report && company && hasStudentEvidence ? [
    { label: "DSA", current: Number(report.breakdown?.dsa || 0), target: Number(company.dsaAccuracyRequired || 0) },
    { label: "Interview", current: Number(report.breakdown?.interview || 0), target: Number(company.interviewScore || 0) },
  ].filter((item) => item.target > 0) : [];

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <PanelHeader
            eyebrow="Target benchmark"
            title="Company readiness"
            description="Choose a published benchmark to compare it with your current evidence."
          />
          <label className="block">
            <span className="sr-only">Select target company</span>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedCompany}
                onChange={(event) => onCompanyChange(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-400/10"
              >
                <option value="">Select a company benchmark</option>
                {companies.map((item) => (
                  <option key={item._id || item.id} value={item._id || item.id}>{item.companyName}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">⌄</span>
            </div>
          </label>
        </div>
      </Panel>

      {loadingReadiness ? (
        <Panel className="flex min-h-80 items-center justify-center p-8">
          <div className="text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-500 motion-reduce:animate-none" />
            <div className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Comparing benchmark evidence</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comparing current analytics with the selected benchmark.</p>
          </div>
        </Panel>
      ) : report && company ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <ScoreSummary
              score={report.readinessScore ?? 0}
              status={report.badge || (hasPreparationScore ? "Improving" : "Building signal")}
              label="Benchmark attainment"
              detail={hasPreparationScore
                ? `Use the comparison and verified gaps below for ${company.companyName}. This is guidance, not a hiring probability.`
                : "Complete tracked preparation activity before comparing this benchmark."}
              available={hasPreparationScore}
            />
            <Panel className="p-5">
              <PanelHeader
                eyebrow="Score comparison"
                title="Current vs required"
                description="Only directly comparable percentage benchmarks are charted."
                action={<StatusBadge tone={hasPreparationScore ? getScoreTone(report.readinessScore) : "slate"}>{report.badge || "Insufficient evidence"}</StatusBadge>}
              />
              <div className="mt-4"><BenchmarkComparisonChart data={comparisonData} minHeight={245} /></div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel className="p-5">
              <PanelHeader eyebrow="Verified gaps" title="Requirements needing attention" description="Values preserve their original benchmark units." />
              <div className="mt-4">{hasPreparationScore
                ? <GapList gaps={report.gapAnalysis || []} />
                : <EmptyPanel title="Not enough evidence" text="Benchmark gaps will appear after tracked coding, assessment, interview, or learning activity." />}
              </div>
            </Panel>
            <Panel className="p-5">
              <PanelHeader
                eyebrow="Preparation plan"
                title="Recommended actions"
                description="Ordered from the current benchmark gaps; no completion-time guarantee is inferred."
              />
              <div className="mt-5"><CheckList items={hasPreparationScore ? (report.actionPlan || []) : []} emptyText="Build a preparation signal before generating a benchmark action plan." /></div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel className="p-5">
              <PanelHeader eyebrow="Required coverage" title="Company topic requirements" />
              <div className="mt-4 flex flex-wrap gap-2">
                {(company.requiredTopics || []).length ? company.requiredTopics.map((topic) => <StatusBadge key={topic} tone="slate">{topic}</StatusBadge>) : <span className="text-xs text-slate-500 dark:text-slate-400">No required topics are configured.</span>}
              </div>
              {(report.topicFeedback || []).length ? (
                <div className="mt-5 space-y-3">
                  {(report.topicFeedback || []).map((item) => (
                    <div key={item.topic} className="flex items-start gap-3 rounded-xl bg-amber-50 p-3.5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                      <Target className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">{item.topic}</div>
                        <p className="mt-1 text-xs leading-5 opacity-80">{item.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
            <EvidencePanel items={report.explanations || analytics.explanations.placement} title="Benchmark evidence" />
          </div>
        </>
      ) : (
        <Panel className="p-5">
          <EmptyPanel
            title={hasSelection ? "Comparison unavailable" : companies.length ? "Select a company benchmark" : companiesError ? "Company benchmarks unavailable" : "No company benchmarks available"}
            text={hasSelection ? "Retry the selected benchmark after the analytics service is available." : companies.length ? "Choose a target company above to compare verified gaps and see an evidence-based action plan." : companiesError ? "The performance dashboard is still available. Refresh to retry company benchmarks." : "Published company benchmarks will appear here when they are available."}
          />
        </Panel>
      )}

      {!hasSelection && companies.length ? (
        <div className="flex items-center gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
          <BriefcaseBusiness className="h-3.5 w-3.5" />
          Readiness is guidance based on configured benchmarks, not a placement guarantee.
        </div>
      ) : null}
    </div>
  );
}
