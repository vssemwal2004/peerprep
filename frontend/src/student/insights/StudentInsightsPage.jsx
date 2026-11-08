import { useCallback, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "../../components/CustomToast";
import { insightsApi } from "./insightsApi";
import { PERIOD_IDS, periodLabel, sectionFromParam, sectionPath, visibleSections } from "./insightModel";
import { useStudentInsights } from "./useStudentInsights";
import { useBadges } from "./useBadges";
import { PageTabs, PeriodControls, ProfileBanner } from "./components/InsightsHeader";
import TopicDrawer from "./components/TopicDrawer";
import { QuickPrepSection } from "./components/PracticeSections";
import { InterviewSection, LearningSection } from "./components/ProgressSections";
import CompanySection from "./components/CompanySection";
import { BadgesPage } from "./components/BadgesViews";
import OverviewPage from "./pages/OverviewPage";
import { ActivityPage, CodingPage, TestsPage, TopicsPage } from "./pages/FeaturePages";
import { buttonClass, Card } from "./components/ui";

const PERIOD_KEY = "peerprep:analysis:period:v1";

/** The period from the address (?period=…), else the last one used, else 30 days. */
function initialRange(searchParams) {
  let saved = "";
  try { saved = window.localStorage.getItem(PERIOD_KEY) || ""; } catch { /* none saved */ }
  const period = searchParams.get("period") || saved || "30d";
  if (period === "custom") {
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    return from && to ? { period, from, to } : { period: "30d" };
  }
  return PERIOD_IDS.has(period) ? { period } : { period: "30d" };
}

function Skeleton() {
  const block = "animate-pulse rounded-2xl bg-white dark:bg-[#232325]";
  return (
    <div className="space-y-4" aria-label="Loading your analysis" aria-busy="true">
      <div className={`${block} h-[150px] !bg-sky-200/60 dark:!bg-sky-900/30`} />
      <div className={`${block} h-11`} />
      <div className="grid gap-3 xl:grid-cols-2">
        <div className={`${block} h-[260px]`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className={`${block} h-[104px]`} />)}</div>
      </div>
      <div className={`${block} h-[200px]`} />
    </div>
  );
}

export default function StudentInsightsPage() {
  const { section: sectionParam } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [range, setRange] = useState(() => initialRange(searchParams));
  const { data, loading, refreshing, error, reload } = useStudentInsights(range);
  const badges = useBadges(data?.access);
  const [openTopic, setOpenTopic] = useState(null);
  const sections = useMemo(() => visibleSections(data), [data]);
  const active = sectionFromParam(sectionParam);
  const closeTopic = useCallback(() => setOpenTopic(null), []);

  const changeRange = (next) => {
    const value = next.period === "custom" ? { period: "custom", from: next.from, to: next.to } : { period: next.period };
    if (value.period !== "custom") { try { window.localStorage.setItem(PERIOD_KEY, value.period); } catch { /* this visit only */ } }
    setRange(value);
  };
  const download = async (format) => {
    try { const name = await insightsApi.report(range, format); toast.success(`Saved ${name}`); } catch (downloadError) { toast.error(downloadError.message); }
  };

  const shell = (children) => (
    <div className="min-h-screen bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
      <main className="mx-auto w-full max-w-[1400px] space-y-4 px-3 pb-16 pt-4 sm:px-5 lg:px-8">{children}</main>
      <TopicDrawer topicKey={openTopic} onClose={closeTopic} />
    </div>
  );

  if (loading && !data) return shell(<Skeleton />);
  if (!data) {
    const forbidden = error?.status === 403;
    return shell(
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        {forbidden ? <ShieldCheck className="h-8 w-8 text-slate-300" aria-hidden="true" /> : <AlertCircle className="h-8 w-8 text-rose-400" aria-hidden="true" />}
        <p className="text-[14px] font-semibold text-slate-800 dark:text-zinc-100">{forbidden ? "Prep Analysis is not available for your account" : error?.message || "Your analysis could not be loaded."}</p>
        {forbidden ? <p className="max-w-sm text-[12.5px] text-slate-500 dark:text-zinc-400">Your admin has not enabled any feature that Prep Analysis covers.</p>
          : <button type="button" onClick={() => reload()} className={buttonClass}><RefreshCw className="h-3.5 w-3.5" />Try again</button>}
      </Card>,
    );
  }
  // A page the student may not open (or that does not exist) falls back to the overview.
  if (!sections.some((section) => section.id === active)) return <Navigate to={sectionPath("overview")} replace />;
  if (sectionParam && sectionParam !== active) return <Navigate to={sectionPath(active)} replace />;

  const previousLabel = data.range.previous?.label || "";
  const pages = {
    overview: () => <OverviewPage insights={data} badges={badges} onOpenTopic={setOpenTopic} />,
    topics: () => <TopicsPage insights={data} onOpenTopic={setOpenTopic} />,
    coding: () => <CodingPage insights={data} />,
    quickprep: () => <QuickPrepSection quickprep={data.sections.quickprep} />,
    learning: () => <LearningSection learning={data.sections.learning} range={data.range} previousLabel={previousLabel} />,
    tests: () => <TestsPage insights={data} />,
    interviews: () => <InterviewSection interview={data.sections.interview} previousLabel={previousLabel} />,
    activity: () => <ActivityPage insights={data} />,
    badges: () => <BadgesPage badges={badges} milestones={data.sections.coding?.milestones} />,
    companies: () => <CompanySection />,
  };

  return shell(
    <>
      <ProfileBanner insights={data} badges={badges.data} />
      <PageTabs sections={sections} active={active} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">
          Showing <b className="font-semibold text-slate-800 dark:text-zinc-100">{periodLabel(data.range)}</b>{previousLabel ? ` · changes ${previousLabel}` : ""}
        </p>
        <PeriodControls range={range} onRange={changeRange} refreshing={refreshing} onRefresh={() => reload({ refresh: true })} onDownload={download} updatedAt={data.generatedAt} />
      </div>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><AlertCircle className="h-4 w-4" />Showing the last loaded figures. {error.message}</p>}
      <motion.div key={`${active}|${data.range.preset}`} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: refreshing ? 0.7 : 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="pt-2">
        {pages[active]()}
      </motion.div>
    </>,
  );
}
