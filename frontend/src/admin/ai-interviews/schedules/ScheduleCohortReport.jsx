import { useState } from "react";
import { BarChart3, CheckCircle2, Download, FileCheck2, Gauge, Layers, Percent, PlayCircle, RefreshCw, Target, TrendingDown } from "lucide-react";
import { HorizontalMetricChart, PremiumBarChart } from "../../../student/analysis/AnalyticsCharts";
import { CHART_COLORS } from "../../../student/analysis/analyticsUtils";
import { useRemote } from "../useRemote";
import { EmptyState, Notice, Panel, secondaryClass } from "../ui";
import { scheduleApi } from "./schedulesApi";
import { KpiTile } from "./scheduleUi";
import { kpiValue, normaliseSummary } from "./scheduleModel";

const percent = (value) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? `${Math.round(Number(value))}%` : "—");

/** Cohort results for one schedule: score spread, competency averages and the key points most students missed. */
export default function ScheduleCohortReport({ assignmentId, assigned = 0 }) {
  const remote = useRemote(() => scheduleApi.summary(assignmentId), [assignmentId]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const data = normaliseSummary(remote.result || {});
  const { kpis } = data;
  const scored = kpiValue(kpis, "ready") || kpiValue(kpis, "scored") || kpiValue(kpis, "completed");
  const download = async () => {
    setDownloading(true); setError("");
    try { await scheduleApi.downloadReport(assignmentId); } catch (cause) { setError(cause.message); } finally { setDownloading(false); }
  };
  const tiles = [
    ["Attempted", kpiValue(kpis, "attempted") || kpiValue(kpis, "started"), assigned ? `of ${assigned.toLocaleString("en-IN")} assigned` : "", PlayCircle, "sky"],
    ["Reports ready", scored, "evaluated by ANVI", FileCheck2, "emerald"],
    ["Average score", percent(kpis.averagePercent ?? kpis.average_percent ?? kpis.average), "across evaluated attempts", Gauge, "violet"],
    ["Median score", percent(kpis.medianPercent ?? kpis.median_percent ?? kpis.median), "half scored at or above", Target, "amber"],
    ["Completion rate", percent(data.completionRate), "completed of the current cohort", Percent, "emerald"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[13px] text-slate-500 dark:text-gray-400">Only evaluated attempts are counted. You always see results here, whatever the student report visibility.</p>
        <div className="flex gap-2">
          <button type="button" className={secondaryClass} onClick={remote.reload} aria-label="Refresh cohort report"><RefreshCw size={14} aria-hidden="true" /></button>
          <button type="button" className={secondaryClass} onClick={download} disabled={downloading}><Download size={14} aria-hidden="true" />{downloading ? "Exporting…" : "Export results CSV"}</button>
        </div>
      </div>
      {(remote.error || error) && <Notice error>{error || remote.error}</Notice>}
      {remote.loading && !remote.result ? <p className="py-8 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading cohort report…</p>
        : !remote.error && <>
          <section aria-label="Cohort results" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {tiles.map(([label, value, detail, icon, tone]) => <KpiTile key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} />)}
          </section>
          {!scored ? <Panel><EmptyState title="No evaluated attempts yet" detail="Charts appear once students finish and their reports are evaluated." /></Panel> : <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Score distribution" description="Students per score range." icon={BarChart3}><PremiumBarChart data={data.distribution} suffix=" students" color={CHART_COLORS.sky} minHeight={260} /></Panel>
              <Panel title="Competency averages" description="Average percent per rubric competency." icon={CheckCircle2} tone="emerald"><HorizontalMetricChart data={data.competencies} suffix="%" domain={[0, 100]} color={CHART_COLORS.emerald} minHeight={Math.max(180, data.competencies.length * 44)} /></Panel>
            </div>
            {data.bands.length > 0 && <Panel title="Score bands" icon={Layers} tone="violet">
              <ul aria-label="Students per score band" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.bands.map((row) => <li key={row.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-gray-800 dark:bg-gray-950/50">
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400">{row.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{row.value.toLocaleString("en-IN")}<span className="ml-1 text-xs font-normal text-slate-500 dark:text-gray-400">student{row.value === 1 ? "" : "s"}</span></p>
                </li>)}
              </ul>
            </Panel>}
            <Panel title="Weakest key points" description="Key points most students missed, worst first." icon={TrendingDown} tone="rose">
              {data.weakest.length === 0 ? <p className="text-sm text-slate-500 dark:text-gray-400">No key point was missed.</p>
                : <ol className="divide-y divide-slate-100 dark:divide-gray-800">
                  {data.weakest.map((row, index) => <li key={`${row.text}-${index}`} className="flex items-start gap-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold tabular-nums text-slate-500 dark:bg-white/5 dark:text-gray-400">{index + 1}</span>
                    <div className="min-w-0 flex-1"><p className="text-sm text-slate-800 dark:text-gray-100">{row.text}</p>{row.question && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">{row.question}</p>}</div>
                    <span className="shrink-0 text-right text-xs tabular-nums text-rose-700 dark:text-rose-300">{row.missRate !== null ? `${Math.round(row.missRate)}% missed` : ""}{row.total ? <span className="block text-slate-500 dark:text-gray-400">across {row.total} student{row.total === 1 ? "" : "s"}</span> : null}</span>
                  </li>)}
                </ol>}
            </Panel>
          </>}
        </>}
    </div>
  );
}
