import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { insightsApi } from "../insightsApi";
import { Card, CardTitle, Empty, focusRing, Pill, ProgressBar, Section } from "./ui";
import GuideInfo from "../../../guide/platform/GuideInfo";

const BADGES = {
  Ready: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  "Almost Ready": "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300",
  Improving: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300",
  "Not Ready": "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300",
};
const PARTS = [["dsa", "Coding accuracy"], ["consistency", "Consistency"], ["interview", "Interviews"], ["volume", "Practice volume"], ["topics", "Required topics"]];
const STORAGE_KEY = "peerprep:analysis:company";

/** Readiness against a company's benchmark (the existing company benchmarks), one company at a time. */
export default function CompanySection() {
  const [companies, setCompanies] = useState({ loading: true, list: [], error: null });
  const [selected, setSelected] = useState(() => { try { return window.localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; } });
  const [report, setReport] = useState({ loading: false, data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    insightsApi.companies(controller.signal)
      .then((result) => setCompanies({ loading: false, list: result.companies || [], error: null }))
      .catch((error) => { if (error.name !== "AbortError") setCompanies({ loading: false, list: [], error }); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected) { setReport({ loading: false, data: null, error: null }); return undefined; }
    try { window.localStorage.setItem(STORAGE_KEY, selected); } catch { /* remembered for this visit only */ }
    const controller = new AbortController();
    setReport({ loading: true, data: null, error: null });
    insightsApi.readiness(selected, controller.signal)
      .then((data) => setReport({ loading: false, data, error: null }))
      .catch((error) => { if (error.name !== "AbortError") setReport({ loading: false, data: null, error }); });
    return () => controller.abort();
  }, [selected]);

  const known = companies.list.some((company) => String(company.id) === selected);
  const result = report.data?.report;

  return (
    <Section id="companies" data-guide="an-companies" info={<GuideInfo step="an-companies" />} icon={Building2} title="Company readiness" subtitle="How close you are to a company's hiring bar"
      actions={companies.list.length > 0 && (
        <select value={known ? selected : ""} onChange={(event) => setSelected(event.target.value)} aria-label="Choose a company"
          className="h-8 max-w-[220px] rounded-lg border border-[#e4e7ec] bg-white px-2 text-[12.5px] font-medium text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-[#232325] dark:text-zinc-200">
          <option value="">Choose a company</option>
          {companies.list.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}
        </select>
      )}>
      {companies.loading ? (
        <Card className="flex items-center justify-center gap-2 p-8 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading companies…</Card>
      ) : !companies.list.length ? (
        <Card><Empty icon={Building2} title={companies.error ? "Company benchmarks could not be loaded." : "No company benchmarks have been added yet."} /></Card>
      ) : !known ? (
        <Card><Empty icon={Building2} title="Choose a company to compare your preparation with its bar." /></Card>
      ) : report.loading ? (
        <Card className="flex items-center justify-center gap-2 p-8 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking your readiness…</Card>
      ) : report.error || !result ? (
        <Card><Empty icon={Building2} title={report.error?.message || "Readiness could not be calculated."} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="flex flex-col justify-between gap-4 p-5">
            <div>
              <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">{report.data.company.companyName}</p>
              <p className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.03em] text-slate-950 tabular-nums dark:text-zinc-50">{Math.round(result.readinessScore)}<span className="text-[18px] text-slate-400">/100</span></p>
              <Pill className={`mt-3 ${BADGES[result.badge] || BADGES.Improving}`}>{result.badge}</Pill>
            </div>
            {result.topicFeedback?.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11.5px] font-semibold text-slate-500 dark:text-zinc-400">Topics to strengthen</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.topicFeedback.slice(0, 8).map((item) => (
                    <Link key={item.topic} to={`/problems?topic=${encodeURIComponent(item.topic)}`} className={`inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 ${focusRing}`}>{item.topic}<ArrowRight className="h-3 w-3" /></Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card className="p-4">
            <CardTitle title="How you measure up" hint="Share of each requirement met" />
            <ul className="space-y-3">
              {PARTS.map(([key, label]) => {
                const value = Math.round(result.attainment?.[key] ?? 0);
                return (
                  <li key={key}>
                    <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-medium text-slate-700 dark:text-zinc-200">{label}</span><span className="tabular-nums font-semibold text-slate-900 dark:text-zinc-100">{value}%</span></div>
                    <ProgressBar value={value} color={value >= 100 ? "#10b981" : value >= 60 ? "#0284c7" : "#f59e0b"} label={`${label} met`} />
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="p-4">
            <CardTitle title="To close the gap" />
            <ol className="space-y-2">
              {(result.actionPlan || []).slice(0, 5).map((step, index) => (
                <li key={step} className="flex gap-2.5 text-[12.5px] leading-relaxed text-slate-600 dark:text-zinc-300">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10.5px] font-bold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{index + 1}</span>{step}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </Section>
  );
}
