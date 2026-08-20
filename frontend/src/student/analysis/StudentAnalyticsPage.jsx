import { lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ErrorBanner, LoadingScreen } from "./AnalyticsPrimitives";
import { PageTransition, WorkspaceHeader } from "./AnalyticsShared";
import {
  ANALYTICS_SECTION_IDS,
  buildAssessmentMovement,
  buildModuleScores,
  buildTopicAnalytics,
  statusLabel,
  toInterviewCategoryData,
} from "./analyticsUtils";
import { useStudentAnalyticsData } from "./useStudentAnalyticsData";

const AssessmentAnalyticsPage = lazy(() => import("./pages/AssessmentAnalyticsPage"));
const CodingAnalyticsPage = lazy(() => import("./pages/CodingAnalyticsPage"));
const InterviewAnalyticsPage = lazy(() => import("./pages/InterviewAnalyticsPage"));
const LearningAnalyticsPage = lazy(() => import("./pages/LearningAnalyticsPage"));
const OverviewAnalyticsPage = lazy(() => import("./pages/OverviewAnalyticsPage"));
const PlacementAnalyticsPage = lazy(() => import("./pages/PlacementAnalyticsPage"));

const SECTION_ALIASES = {
  dsa: "coding",
  readiness: "placement",
  assessment: "assessments",
  interview: "interviews",
};

const EMPTY_ANALYTICS = {
  overview: {},
  problems: {},
  assessments: {},
  interviews: {},
  learning: {},
  consistency: {},
  derived: {},
  explanations: {
    overview: [],
    coding: [],
    assessment: [],
    interview: [],
    learning: [],
    placement: [],
  },
};

function normalizeAnalytics(value) {
  return {
    ...EMPTY_ANALYTICS,
    ...(value || {}),
    overview: value?.overview || {},
    problems: value?.problems || {},
    assessments: value?.assessments || {},
    interviews: value?.interviews || {},
    learning: value?.learning || {},
    consistency: value?.consistency || {},
    derived: value?.derived || {},
    explanations: {
      ...EMPTY_ANALYTICS.explanations,
      ...(value?.explanations || {}),
    },
  };
}

function normalizeSection(value) {
  const normalized = SECTION_ALIASES[value] || value;
  return ANALYTICS_SECTION_IDS.includes(normalized) ? normalized : "overview";
}

function buildActivitySeries(points = []) {
  return points.map((item) => {
    const date = item.date ? new Date(item.date) : null;
    return {
      ...item,
      label: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : item.label || "",
      value: Number(item.count ?? item.value ?? 0),
    };
  });
}

function buildReadinessHistory(points = [], contractVersion) {
  return points
    .filter((item) => (!contractVersion || item.contractVersion === contractVersion) && Number.isFinite(item.scores?.readiness))
    .map((item) => {
      const date = item.date ? new Date(item.date) : null;
      return {
        label: date && !Number.isNaN(date.getTime())
          ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : "",
        value: Number(item.scores.readiness),
      };
    });
}

function useEdgeSwipe(activeSection, onSectionChange) {
  const startRef = useRef(null);

  const onTouchStart = useCallback((event) => {
    if (window.innerWidth >= 1024) return;
    if (event.target.closest("button, a, input, select, textarea, [role='button']")) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const edge = 28;
    if (touch.clientX > edge && touch.clientX < window.innerWidth - edge) return;
    startRef.current = { x: touch.clientX, y: touch.clientY, fromLeft: touch.clientX <= edge };
  }, []);

  const onTouchEnd = useCallback((event) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return;

    const index = ANALYTICS_SECTION_IDS.indexOf(activeSection);
    if (start.fromLeft && dx > 0 && index > 0) onSectionChange(ANALYTICS_SECTION_IDS[index - 1]);
    if (!start.fromLeft && dx < 0 && index < ANALYTICS_SECTION_IDS.length - 1) onSectionChange(ANALYTICS_SECTION_IDS[index + 1]);
  }, [activeSection, onSectionChange]);

  return { onTouchStart, onTouchEnd };
}

export default function StudentAnalyticsPage() {
  const { section } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = normalizeSection(section);
  const previousIndexRef = useRef(0);

  const {
    analysis: rawAnalysis,
    meta,
    history,
    companies,
    readiness,
    selectedCompany,
    loading,
    refreshing,
    loadingReadiness,
    error,
    companiesError,
    reload,
    changeCompany,
  } = useStudentAnalyticsData();

  const analytics = useMemo(() => normalizeAnalytics(rawAnalysis), [rawAnalysis]);
  const topicAnalytics = useMemo(() => buildTopicAnalytics(analytics.problems.topics || []), [analytics.problems.topics]);
  const assessmentMovement = useMemo(() => buildAssessmentMovement(analytics.assessments.progress || []), [analytics.assessments.progress]);
  const categoryData = useMemo(() => toInterviewCategoryData(analytics.interviews.categoryScores || {}), [analytics.interviews.categoryScores]);
  const activitySeries = useMemo(() => buildActivitySeries(analytics.consistency.weeklyActivity || []), [analytics.consistency.weeklyActivity]);
  const readinessHistory = useMemo(
    () => buildReadinessHistory(history, analytics.contractVersion),
    [analytics.contractVersion, history]
  );
  const moduleScores = useMemo(() => {
    const scores = buildModuleScores(analytics);
    const availability = {
      problems: Number(analytics.problems.attempts || 0) > 0,
      assessments: Number(analytics.assessments.validScoreAttempts ?? analytics.assessments.attempts ?? 0) > 0,
      interviews: Number(analytics.interviews.total || 0) > 0,
      learning: Number(analytics.learning.totalTopics || 0) > 0,
    };
    return scores.map((item) => ({ ...item, available: availability[item.id] }));
  }, [analytics]);

  const readinessScore = typeof analytics.overview.readinessScore === "number"
    ? analytics.overview.readinessScore
    : (typeof analytics.derived.readinessScore === "number" ? analytics.derived.readinessScore : 0);
  const overallStatus = statusLabel(readinessScore);

  const basePath = location.pathname.startsWith("/student/analytics") ? "/student/analytics" : "/student/analysis";
  const changeSection = useCallback((nextSection) => {
    const normalized = normalizeSection(nextSection);
    const nextIndex = ANALYTICS_SECTION_IDS.indexOf(normalized);
    previousIndexRef.current = ANALYTICS_SECTION_IDS.indexOf(activeSection);
    navigate(`${basePath}/${normalized}`);
    return nextIndex;
  }, [activeSection, basePath, navigate]);
  const swipeHandlers = useEdgeSwipe(activeSection, changeSection);
  const activeIndex = ANALYTICS_SECTION_IDS.indexOf(activeSection);
  const direction = activeIndex - previousIndexRef.current;

  if (loading && !rawAnalysis) return <LoadingScreen />;

  const pageProps = {
    analytics,
    readinessScore,
    overallStatus,
    moduleScores,
    topicAnalytics,
    assessmentMovement,
    categoryData,
    activitySeries,
    readinessHistory,
    companies,
    readiness,
    selectedCompany,
    loadingReadiness,
    companiesError,
    onCompanyChange: changeCompany,
    onNavigate: changeSection,
  };

  const pages = {
    overview: <OverviewAnalyticsPage {...pageProps} />,
    coding: <CodingAnalyticsPage {...pageProps} />,
    assessments: <AssessmentAnalyticsPage {...pageProps} />,
    interviews: <InterviewAnalyticsPage {...pageProps} />,
    learning: <LearningAnalyticsPage {...pageProps} />,
    placement: <PlacementAnalyticsPage {...pageProps} />,
  };

  const generatedAt = meta?.generatedAt || rawAnalysis?.generatedAt;

  return (
    <div className="min-h-screen bg-slate-50 pt-14 text-slate-950 transition-colors dark:bg-slate-950 dark:text-white">
      <WorkspaceHeader
        activeSection={activeSection}
        onSectionChange={changeSection}
        refreshing={refreshing}
        onRefresh={() => reload({ forceRefresh: true })}
        generatedAt={generatedAt}
      />

      <div {...swipeHandlers} className="mx-auto min-h-[calc(100vh-220px)] w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <ErrorBanner error={error} onRetry={() => reload({ forceRefresh: true })} />
        <div className={error ? "mt-4" : ""}>
          <AnimatePresence mode="wait" initial={false}>
            <PageTransition key={activeSection} direction={direction}>
              <div id={`analytics-panel-${activeSection}`} role="tabpanel" aria-labelledby={`analytics-tab-${activeSection}`} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-4 dark:focus-visible:ring-offset-slate-950">
                <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none dark:border-white/10 dark:bg-white/5" aria-label="Loading analytics section" />}>
                  {pages[activeSection]}
                </Suspense>
              </div>
            </PageTransition>
          </AnimatePresence>
        </div>

        <footer className="mt-6 flex flex-col gap-1 border-t border-slate-200 px-1 pt-4 text-[10px] leading-4 text-slate-400 dark:border-white/10 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Analytics use tracked PeerPrep activity and configured scoring rules.</span>
          <span>{analytics.scoreModel?.version ? `Model ${analytics.scoreModel.version}` : "Scores update as new evidence arrives."}</span>
        </footer>
      </div>
    </div>
  );
}
