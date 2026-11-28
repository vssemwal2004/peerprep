import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, BarChart3, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "../../components/CustomToast";
import { useAuth } from "../../context/AuthContext";
import { hasStudentFeature } from "../studentFeatureAccess";
import { formatScore } from "../prepScore/formatScore";
import { insightsApi } from "./insightsApi";
import { PERIOD_IDS, periodLabel, sectionFromParam, sectionPath, visibleSections } from "./insightModel";
import { useStudentInsights } from "./useStudentInsights";
import { PeriodControls } from "./components/InsightsHeader";
import TopicDrawer from "./components/TopicDrawer";
import CompanySection from "./components/CompanySection";
import CodingView from "./v2/CodingView";
import AssessmentView from "./v2/AssessmentView";
import InterviewView from "./v2/InterviewView";
import { buttonClass, Card } from "./components/ui";
import PrepReadinessSection from "../readiness/PrepReadinessSection";
import PageGuideButton from "../../guide/platform/PageGuideButton";
import { usePrepScore, useReadinessSummary, useWallet } from "./v2/useAnalysisData";
import OverviewView from "./v2/OverviewView";
import ScoreView from "./v2/ScoreView";
import CoinsView from "./v2/CoinsView";
import MockView from "./v2/MockView";
import { focusRing, muted } from "./v2/parts";

const PERIOD_KEY = "peerprep:analysis:period:v1";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The saved period: a preset id ("30d", older visits) or a custom range as JSON. */
function savedRange() {
  let saved = "";
  try { saved = window.localStorage.getItem(PERIOD_KEY) || ""; } catch { /* none saved */ }
  if (!saved.startsWith("{")) return saved ? { period: saved } : null;
  try {
    const value = JSON.parse(saved);
    return value?.period === "custom" && DAY.test(value.from) && DAY.test(value.to) && value.from <= value.to ? { period: "custom", from: value.from, to: value.to } : null;
  } catch { return null; }
}

/**
 * The period from the address (?period=…), else the last one used (custom ranges included, so a
 * section change, which remounts the page, keeps it), else 30 days.
 */
function initialRange(searchParams) {
  const fromAddress = searchParams.get("period");
  if (fromAddress === "custom") {
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    return DAY.test(from) && DAY.test(to) && from <= to ? { period: "custom", from, to } : { period: "30d" };
  }
  const chosen = fromAddress ? { period: fromAddress } : savedRange() || { period: "30d" };
  if (chosen.period === "custom") return chosen;
  return PERIOD_IDS.has(chosen.period) && chosen.period !== "custom" ? chosen : { period: "30d" };
}

function Skeleton() {
  const block = "animate-pulse rounded-2xl bg-white dark:bg-[#1c1c1e]";
  return (
    <div className="space-y-4" aria-label="Loading your analysis" aria-busy="true">
      <div className={`${block} h-16`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className={`${block} h-[170px]`} />)}</div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]"><div className={`${block} h-[260px]`} /><div className={`${block} h-[260px]`} /></div>
    </div>
  );
}

/** Short figure shown on a tab (only when it means something). */
function tabCount(id, { insights, score, readiness, wallet }) {
  const sections = insights.sections || {};
  switch (id) {
    case "score": return score.data ? formatScore(score.data.total) : "";
    case "readiness": {
      const summary = readiness.data;
      return summary?.hasEvidence ? `${summary.tracks?.sbc?.display ?? "–"} · ${summary.tracks?.pbc?.display ?? "–"}` : "";
    }
    case "coins": return wallet.data ? String(wallet.data.balance) : "";
    case "coding": return sections.coding ? String(sections.coding.solved.total) : "";
    case "assessment": return sections.assessment ? String(sections.assessment.taken) : "";
    case "mock": return String(sections.prepmock?.taken || 0);
    case "interview": return sections.interview ? String((sections.interview.mock?.done || 0) + (sections.interview.ai?.completed || 0)) : "";
    default: return "";
  }
}

export default function StudentInsightsPage() {
  const { section: sectionParam } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [range, setRange] = useState(() => initialRange(searchParams));
  const { data, loading, refreshing, error, reload } = useStudentInsights(range);
  const [openTopic, setOpenTopic] = useState(null);
  const features = useMemo(() => ({
    score: hasStudentFeature(user, "rankings") || hasStudentFeature(user, "prep_coins"),
    coins: hasStudentFeature(user, "prep_coins"),
  }), [user]);
  const sections = useMemo(() => visibleSections(data, features), [data, features]);
  const visible = (id) => sections.some((section) => section.id === id);
  const score = usePrepScore(range, Boolean(data) && features.score);
  const wallet = useWallet(Boolean(data) && features.coins);
  const readiness = useReadinessSummary(Boolean(data) && Boolean(data?.access?.coding));
  const active = sectionFromParam(sectionParam);
  const closeTopic = useCallback(() => setOpenTopic(null), []);

  const changeRange = (next) => {
    const value = next.period === "custom" ? { period: "custom", from: next.from, to: next.to } : { period: next.period };
    try { window.localStorage.setItem(PERIOD_KEY, value.period === "custom" ? JSON.stringify(value) : value.period); } catch { /* this visit only */ }
    setRange(value);
  };
  const download = async (format) => {
    try { const name = await insightsApi.report(range, format); toast.success(`Saved ${name}`); } catch (downloadError) { toast.error(downloadError.message); }
  };
  const refresh = () => { reload({ refresh: true }); score.reload(); wallet.reload(); readiness.reload(); };

  const shell = (children) => (
    <div className="min-h-screen bg-[#f6f7f9] bg-[radial-gradient(1100px_520px_at_12%_-180px,rgba(14,165,233,0.09),transparent_70%),radial-gradient(900px_420px_at_88%_-200px,rgba(139,92,246,0.06),transparent_70%)] bg-no-repeat font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:bg-none dark:text-zinc-100">
      {children}
      <TopicDrawer topicKey={openTopic} onClose={closeTopic} />
    </div>
  );

  if (loading && !data) return shell(<main className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-5 sm:px-6"><Skeleton /></main>);
  if (!data) {
    const forbidden = error?.status === 403;
    return shell(
      <main className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-5 sm:px-6">
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          {forbidden ? <ShieldCheck className="h-8 w-8 text-slate-300" aria-hidden="true" /> : <AlertCircle className="h-8 w-8 text-rose-400" aria-hidden="true" />}
          <p className="text-[14px] font-semibold text-slate-800 dark:text-zinc-100">{forbidden ? "Prep Analysis is not available for your account" : error?.message || "Your analysis could not be loaded."}</p>
          {forbidden ? <p className="max-w-sm text-[13px] text-slate-500 dark:text-zinc-400">Your admin has not enabled any feature that Prep Analysis covers.</p>
            : <button type="button" onClick={() => reload()} className={buttonClass}><RefreshCw className="h-3.5 w-3.5" />Try again</button>}
        </Card>
      </main>,
    );
  }
  // A page the student may not open (or that does not exist) falls back to the overview.
  if (!visible(active)) return <Navigate to={sectionPath("overview")} replace />;
  if (sectionParam && sectionParam !== active) return <Navigate to={sectionPath(active)} replace />;

  const current = sections.find((section) => section.id === active);
  const previousLabel = data.range.previous?.label || "";
  const periodText = periodLabel(data.range);
  const counts = { insights: data, score, readiness, wallet };
  const pages = {
    overview: () => <OverviewView insights={data} sections={sections} score={score} readiness={readiness} wallet={wallet} features={features} />,
    score: () => <ScoreView score={score} periodText={periodText} />,
    readiness: () => (
      <div className="space-y-8">
        <PrepReadinessSection />
        {data.access?.company ? <CompanySection /> : null}
      </div>
    ),
    coins: () => <CoinsView wallet={wallet} today={score.data?.today} />,
    coding: () => <CodingView insights={data} onOpenTopic={setOpenTopic} />,
    assessment: () => <AssessmentView insights={data} />,
    mock: () => <MockView insights={data} />,
    interview: () => <InterviewView insights={data} />,
  };

  return shell(
    <>
      {/* Title bar, then the sub bar (tabs) that stays under the app header while the page scrolls. */}
      <header>
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-6 sm:px-6">
          <div className="flex min-w-0 flex-[1_1_260px] items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-[0_10px_22px_-12px_rgba(124,58,237,0.8)]" aria-hidden="true"><BarChart3 className="h-5 w-5" strokeWidth={1.9} /></span>
            <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-slate-950 dark:text-zinc-50">Prep Analysis</h1>
              <PageGuideButton size="sm" />
            </div>
            <p className={`mt-0.5 text-[13px] ${muted}`}>
              Only your own data{current?.period ? <> · <b className="font-semibold text-slate-700 dark:text-zinc-200">{periodText}</b>{previousLabel ? ` · changes ${previousLabel}` : ""}</> : " · always up to date"}
            </p>
            </div>
          </div>
          {current?.period ? (
            <div data-guide="an-period"><PeriodControls range={range} onRange={changeRange} refreshing={refreshing || score.loading} onRefresh={refresh} onDownload={download} updatedAt={data.generatedAt} /></div>
          ) : (
            <button type="button" onClick={refresh} className={buttonClass} aria-label="Refresh"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" /></button>
          )}
        </div>
      </header>
      <div className="sticky top-[calc(3rem+1px)] z-30 mt-3 border-b border-[#e6e7eb] bg-[#f6f7f9]/90 backdrop-blur-md lg:top-[calc(4rem+1px)] dark:border-white/[0.07] dark:bg-[#1a1a1a]/90">
        <nav aria-label="Prep Analysis sections" data-guide="an-tabs" className="mx-auto flex w-full max-w-[1320px] gap-1 overflow-x-auto px-2 pt-2 [scrollbar-width:none] sm:px-4">
          {sections.map((section) => {
            const on = section.id === active;
            const count = tabCount(section.id, counts);
            return (
              <Link key={section.id} to={sectionPath(section.id)} aria-current={on ? "page" : undefined}
                className={`relative inline-flex shrink-0 items-center gap-2 rounded-t-lg px-3 pb-3 pt-2 text-[14px] font-semibold transition ${on ? "text-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100"} ${focusRing}`}>
                {section.label}
                {count ? <span className={`rounded-full px-2 py-0.5 text-[12px] tabular-nums ${on ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200" : "bg-[#eef0f3] text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300"}`}>{count}</span> : null}
                {on ? <motion.span layoutId="pa-tab-line" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sky-600 dark:bg-sky-400" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} /> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto w-full max-w-[1320px] space-y-4 px-4 pb-16 pt-5 sm:px-6">
        {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><AlertCircle className="h-4 w-4" />Showing the last loaded figures. {error.message}</p>}
        <motion.div key={`${active}|${data.range.preset}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: refreshing ? 0.7 : 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          {pages[active]()}
        </motion.div>
      </main>
    </>,
  );
}
