import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BookOpenCheck,
  ClipboardList,
  Code2,
  LayoutDashboard,
  MessageSquare,
  UserRound,
} from 'lucide-react';
import { api } from '../utils/api';
import { getLearnerLevel } from '../student/profileBadge';
import { computeAwards } from '../student/profile/achievements';
import { focusRing, languageLabel } from '../student/profile/format';
import BadgesGallery from '../student/profile/BadgesGallery';
import AdminProfileSidebar from './studentProfile/AdminProfileSidebar';
import OverviewStrip from './studentProfile/OverviewStrip';
import ProfileTabs from './studentProfile/ProfileTabs';
import OverviewTab from './studentProfile/OverviewTab';
import CodingTab from './studentProfile/CodingTab';
import AssessmentsTab from './studentProfile/AssessmentsTab';
import InterviewsTab from './studentProfile/InterviewsTab';
import LearningTab from './studentProfile/LearningTab';
import ActivityTab from './studentProfile/ActivityTab';
import useStickyTop from './studentProfile/useStickyTop';
import { num, nullableNum, panelId, plural, readLearnerProgress, tabId, timeOf } from './studentProfile/utils';

const MotionDiv = motion.div;

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'coding', label: 'Coding', icon: Code2 },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList },
  { id: 'interviews', label: 'Interviews', icon: MessageSquare },
  { id: 'learning', label: 'Learning', icon: BookOpenCheck },
  { id: 'activity', label: 'Activity', icon: Activity },
];
const TAB_IDS = new Set(TABS.map((tab) => tab.id));

/** Last 7 UTC days (activity is bucketed by UTC day), oldest first. */
function lastSevenDays(activity) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (6 - index)));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      active: num(activity?.[key]) > 0,
      full: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  });
}

const PAGE_ROOT = "relative min-h-screen bg-white font-['Inter',ui-sans-serif,system-ui,sans-serif] antialiased dark:bg-[#1a1a1a]";

export default function AdminStudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState({});
  const [activityStats, setActivityStats] = useState(null);
  const [videos, setVideos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [compiler, setCompiler] = useState(null);
  const [error, setError] = useState('');
  const [badgesGallery, setBadgesGallery] = useState(null);
  const closeBadgesGallery = useCallback(() => setBadgesGallery(null), []);

  const requestedTab = searchParams.get('tab');
  const activeTab = TAB_IDS.has(requestedTab) ? requestedTab : 'overview';
  const panelRef = useRef(null);
  const tabBarRef = useRef(null);
  const previousTabRef = useRef(activeTab);

  // After switching tabs from far down the page, bring the new panel's top into view below the
  // sticky tab bar (the panel's scroll-mt leaves room for it) instead of leaving it hidden.
  useEffect(() => {
    if (previousTabRef.current === activeTab) return;
    previousTabRef.current = activeTab;
    const node = panelRef.current;
    if (!node) return;
    const barBottom = tabBarRef.current?.getBoundingClientRect().bottom ?? 64;
    if (node.getBoundingClientRect().top < barBottom) {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [activeTab]);
  const setActiveTab = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let isMounted = true;

    const loadStudentProfile = async () => {
      setLoading(true);
      setError('');

      const [
        studentResult,
        statsResult,
        activityResult,
        videosResult,
        coursesResult,
        compilerResult,
      ] = await Promise.allSettled([
        api.getStudentByIdForAdmin(studentId),
        api.getStudentStatsByAdmin(studentId),
        api.getStudentActivityByAdmin(studentId),
        api.getStudentVideosWatchedByAdmin(studentId),
        api.getStudentCoursesEnrolledByAdmin(studentId),
        api.getCompilerStudentAnalytics(studentId),
      ]);

      if (!isMounted) return;

      if (studentResult.status === 'fulfilled') {
        setStudent(studentResult.value.student || null);
      } else {
        setError(studentResult.reason?.message || 'Failed to load student profile.');
      }

      setStats(statsResult.status === 'fulfilled' ? (statsResult.value.stats || null) : null);

      if (activityResult.status === 'fulfilled') {
        setActivity(activityResult.value.activityByDate || {});
        setActivityStats(activityResult.value.stats || null);
      } else {
        setActivity({});
        setActivityStats(null);
      }

      setVideos(videosResult.status === 'fulfilled' ? (videosResult.value.videos || []) : []);
      setCourses(coursesResult.status === 'fulfilled' ? (coursesResult.value.courses || []) : []);
      setCompiler(compilerResult.status === 'fulfilled' ? (compilerResult.value || null) : null);

      setLoading(false);
    };

    loadStudentProfile();
    return () => {
      isMounted = false;
    };
  }, [studentId]);

  const handle = useMemo(() => {
    const base = student?.username || student?.email?.split('@')[0] || student?.studentId || student?.name || 'student';
    return `@${String(base).trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase()}`;
  }, [student?.email, student?.name, student?.studentId, student?.username]);

  const hasCustomBio = Boolean(student?.bio?.trim());
  const shortBio = useMemo(() => {
    if (student?.bio?.trim()) return student.bio.trim();
    // Factual fallback: only mention a language or streak that actually exists.
    const focus = stats?.mostUsedLanguage ? ` Mostly codes in ${languageLabel(stats.mostUsedLanguage)}.` : '';
    const streak = num(activityStats?.currentStreak);
    return `No bio added.${focus}${streak > 0 ? ` Currently on a ${streak}-day streak.` : ''}`;
  }, [activityStats?.currentStreak, stats?.mostUsedLanguage, student?.bio]);

  // Solved / attempted / attempts always come from ONE payload so the ratio is meaningful. The
  // compiler analytics are limited to the coordinator's own problems when a coordinator is viewing.
  // `totalProblems` is the real attempted count (0 when nothing was attempted); consumers guard
  // their own division.
  const codingTotals = useMemo(() => {
    const easySolved = num(stats?.solvedByDifficulty?.easy);
    const mediumSolved = num(stats?.solvedByDifficulty?.medium);
    const hardSolved = num(stats?.solvedByDifficulty?.hard);
    if (compiler) {
      const totalSolved = num(compiler.summary?.problemsSolved);
      const scoped = rolePrefix === '/coordinator';
      // The difficulty split must come from the same payload as the solved count: the compiler
      // list when it is scoped (or when global stats failed), otherwise the global stats.
      const useCompilerSplit = scoped || !stats;
      const split = { easy: 0, medium: 0, hard: 0 };
      if (useCompilerSplit) {
        (compiler.solvedProblems || []).forEach((problem) => {
          const key = String(problem?.difficulty || '').toLowerCase();
          if (key in split) split[key] += 1;
        });
      }
      return {
        totalSolved,
        totalProblems: Math.max(compiler.attemptedProblems?.length || 0, totalSolved),
        totalAttempts: num(compiler.summary?.totalAttempts),
        easySolved: useCompilerSplit ? split.easy : easySolved,
        mediumSolved: useCompilerSplit ? split.medium : mediumSolved,
        hardSolved: useCompilerSplit ? split.hard : hardSolved,
        scoped,
      };
    }
    const totalSolved = num(stats?.totalQuestionsSolved ?? stats?.problemsSolved);
    return {
      totalSolved,
      totalProblems: Math.max(num(stats?.totalQuestionsAttempted), totalSolved),
      totalAttempts: num(stats?.totalSubmissions),
      easySolved,
      mediumSolved,
      hardSolved,
      scoped: false,
    };
  }, [compiler, rolePrefix, stats]);

  const assessmentMetrics = stats?.assessmentMetrics || {};
  const interviewMetrics = stats?.interviewMetrics || {};
  const currentStreak = num(activityStats?.currentStreak);
  const bestStreak = num(activityStats?.bestStreak);
  const activeDays = num(activityStats?.totalActiveDays);

  // Level + awards use the overall solved count from the stats payload (coding analytics may be
  // scoped to a coordinator's problems). The student's own profile uses a NORMALIZED assessment
  // average (score / maxMarks) that the admin stats endpoint does not return yet; until the backend
  // adds `assessmentMetrics.normalizedAvgScore`, the raw average is used and the level card says so.
  const levelSolved = num(stats?.totalQuestionsSolved ?? stats?.problemsSolved ?? codingTotals.totalSolved);
  const normalizedAssessmentAvg = nullableNum(assessmentMetrics.normalizedAvgScore);
  const levelAssessmentScore = normalizedAssessmentAvg ?? num(assessmentMetrics.avgScore);
  const levelNote = normalizedAssessmentAvg === null && num(assessmentMetrics.attempts) > 0
    ? 'Computed from admin stats. Its assessment part uses raw scores, so it can differ from the level the student sees.'
    : null;
  const level = useMemo(() => getLearnerLevel({
    solvedCount: levelSolved,
    streak: currentStreak,
    assessmentScore: levelAssessmentScore,
    interviewScore: num(interviewMetrics.avgScore),
  }), [currentStreak, interviewMetrics.avgScore, levelAssessmentScore, levelSolved]);

  const awards = useMemo(() => computeAwards({
    solved: levelSolved,
    hardSolved: codingTotals.hardSolved,
    bestStreak: Math.max(bestStreak, currentStreak),
    activeDays,
    languages: stats?.languagesUsed?.length || 0,
    assessments: num(assessmentMetrics.attempts),
    interviews: num(interviewMetrics.feedbackReceived),
  }), [
    activeDays,
    assessmentMetrics.attempts,
    bestStreak,
    codingTotals.hardSolved,
    currentStreak,
    interviewMetrics.feedbackReceived,
    levelSolved,
    stats?.languagesUsed?.length,
  ]);

  const learnerProgress = useMemo(() => readLearnerProgress(student), [student]);

  // The courses endpoint only returns subjects the student has already started (Progress rows), so
  // the topic ratio is "completion of started courses", not of all assigned content.
  const learning = useMemo(() => {
    const topicTotals = courses.reduce((acc, course) => ({
      done: acc.done + num(course.completedTopics),
      total: acc.total + num(course.totalTopics),
    }), { done: 0, total: 0 });
    if (topicTotals.total > 0) {
      return {
        percent: Math.min(100, (topicTotals.done / topicTotals.total) * 100),
        label: 'Started-course completion',
        detail: `${topicTotals.done} of ${topicTotals.total} topics in ${plural(courses.length, 'started course')}`,
      };
    }
    const videosTotal = num(activityStats?.totalVideosTotal);
    if (videosTotal > 0) {
      const watched = num(activityStats?.totalVideosWatched ?? stats?.totalVideosWatched);
      return {
        percent: Math.min(100, (watched / videosTotal) * 100),
        label: 'Video coverage',
        detail: `${watched} of ${videosTotal} curriculum videos`,
      };
    }
    return { percent: null, label: 'Course completion', detail: null };
  }, [activityStats?.totalVideosTotal, activityStats?.totalVideosWatched, courses, stats?.totalVideosWatched]);

  // Overview gauge: overall (unscoped) solved vs attempted from the stats payload, so it matches
  // the difficulty split, the level and what the student sees. Falls back to the coding totals.
  const overallCoding = stats
    ? {
      totalSolved: levelSolved,
      attempted: Math.max(num(stats.totalQuestionsAttempted), levelSolved),
      easySolved: num(stats.solvedByDifficulty?.easy),
      mediumSolved: num(stats.solvedByDifficulty?.medium),
      hardSolved: num(stats.solvedByDifficulty?.hard),
    }
    : {
      totalSolved: codingTotals.totalSolved,
      attempted: codingTotals.totalProblems,
      easySolved: codingTotals.easySolved,
      mediumSolved: codingTotals.mediumSolved,
      hardSolved: codingTotals.hardSolved,
    };

  // Last coding activity across ALL problems (the compiler timestamp is scoped for coordinators).
  const lastCodingActive = useMemo(() => {
    const newest = (stats?.recentSubmissions || []).reduce((latest, entry) => Math.max(latest, timeOf(entry?.createdAt)), 0);
    if (newest > 0) return new Date(newest).toISOString();
    return compiler?.summary?.lastActive || null;
  }, [compiler?.summary?.lastActive, stats?.recentSubmissions]);

  // Same shape the student's PeerPrepProgress card reads.
  const peerPrep = useMemo(() => {
    const topics = courses.reduce((acc, course) => ({
      done: acc.done + num(course.completedTopics),
      total: acc.total + num(course.totalTopics),
    }), { done: 0, total: 0 });
    const attempts = num(assessmentMetrics.attempts);
    return {
      assessments: {
        attempts,
        // Percent of max marks (raw marks are never shown as a percentage).
        avgScore: attempts > 0 ? nullableNum(assessmentMetrics.normalizedAvgScore) : null,
        highestScore: attempts > 0 ? nullableNum(assessmentMetrics.normalizedHighestScore) : null,
      },
      interviews: {
        total: num(interviewMetrics.feedbackReceived),
        avgScore: num(interviewMetrics.avgScore),
        pending: num(interviewMetrics.pending) + num(interviewMetrics.scheduled),
      },
      learning: {
        completionPercent: topics.total > 0 ? Math.min(100, (topics.done / topics.total) * 100) : 0,
        completedTopics: topics.done,
        totalTopics: topics.total,
      },
      content: {
        coursesEnrolled: num(activityStats?.totalSubjects ?? stats?.totalCoursesEnrolled ?? courses.length),
        videosWatched: num(activityStats?.totalVideosWatched ?? stats?.totalVideosWatched),
        videosTotal: num(activityStats?.totalVideosTotal),
        watchTimeHours: num(stats?.totalWatchTimeHours),
      },
    };
  }, [
    activityStats?.totalSubjects,
    activityStats?.totalVideosTotal,
    activityStats?.totalVideosWatched,
    assessmentMetrics.attempts,
    assessmentMetrics.normalizedAvgScore,
    assessmentMetrics.normalizedHighestScore,
    courses,
    interviewMetrics.avgScore,
    interviewMetrics.feedbackReceived,
    interviewMetrics.pending,
    interviewMetrics.scheduled,
    stats?.totalCoursesEnrolled,
    stats?.totalVideosWatched,
    stats?.totalWatchTimeHours,
  ]);

  const socialLinks = useMemo(() => ([
    { label: 'LinkedIn', href: student?.linkedinUrl || '' },
    { label: 'GitHub', href: student?.githubUrl || '' },
    { label: 'Portfolio', href: student?.portfolioUrl || '' },
  ]), [student?.githubUrl, student?.linkedinUrl, student?.portfolioUrl]);

  // Rate, accepted and total come from the same payload: global stats when available, otherwise
  // the compiler summary (which has no accepted count, so the sub-line shows only the total).
  const acceptance = useMemo(() => {
    if (stats) {
      const total = num(stats.totalSubmissions);
      const accepted = nullableNum(stats.acceptedSubmissions);
      const rate = total > 0
        ? (accepted !== null ? Math.round((accepted / total) * 1000) / 10 : nullableNum(stats.acceptanceRate))
        : null;
      return { total, accepted, rate };
    }
    if (compiler) {
      const total = num(compiler.summary?.totalAttempts);
      return { total, accepted: null, rate: total > 0 ? nullableNum(compiler.summary?.acceptanceRate) : null };
    }
    return { total: 0, accepted: null, rate: null };
  }, [compiler, stats]);

  const headline = useMemo(() => {
    const parts = [];
    parts.push(levelSolved > 0 ? `${plural(levelSolved, 'problem')} solved` : 'No problems solved yet');
    if (stats?.mostUsedLanguage) parts.push(`mostly ${languageLabel(stats.mostUsedLanguage)}`);
    parts.push(currentStreak > 0 ? `${plural(currentStreak, 'day')} streak` : 'no active streak');
    parts.push(`${plural(activeDays, 'active day')} this year`);
    return parts.join(' · ');
  }, [activeDays, currentStreak, levelSolved, stats?.mostUsedLanguage]);

  const tabs = TABS.map((tab) => {
    if (tab.id === 'coding') return { ...tab, count: compiler?.attemptedProblems?.length ?? null };
    if (tab.id === 'assessments') return { ...tab, count: num(assessmentMetrics.attempts) };
    if (tab.id === 'interviews') return { ...tab, count: num(interviewMetrics.totalPairs) };
    if (tab.id === 'learning') return { ...tab, count: courses.length };
    return tab;
  });

  const goBack = () => navigate(`${rolePrefix}/students`);

  if (loading) {
    return (
      <div className={`${PAGE_ROOT} pt-3`} aria-busy="true">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="h-[520px] animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="h-60 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
              <div className="h-60 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
            </div>
          </div>
        </div>
        <span className="sr-only" role="status">Loading student profile...</span>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className={`${PAGE_ROOT} pt-3`}>
        <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-[#242424]">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" aria-hidden="true">
              <UserRound className="h-5 w-5" />
            </span>
            <h1 className="mt-3 text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Student profile unavailable</h1>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">{error || 'We could not load this student profile right now.'}</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-zinc-500">Please go back and try opening the student again.</p>
            <button
              type="button"
              onClick={goBack}
              className={`mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700 ${focusRing}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Students
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_ROOT}>
      <MotionDiv
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mx-auto max-w-7xl px-4 pb-8 pt-4 sm:px-6"
      >
        <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-1.5 text-[13px]">
          <button
            type="button"
            onClick={goBack}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${focusRing}`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Students
          </button>
          <span className="text-slate-300 dark:text-zinc-600" aria-hidden="true">/</span>
          <span className="truncate font-medium text-slate-800 dark:text-zinc-200" aria-current="page">{student.name || 'Student'}</span>
        </nav>

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <StickySidebar>
            <AdminProfileSidebar
              student={student}
              handle={handle}
              bio={shortBio}
              hasCustomBio={hasCustomBio}
              level={level}
              levelNote={levelNote}
              socialLinks={socialLinks}
              onViewResume={() => navigate(`${rolePrefix}/students/${studentId}/resume`)}
              onOpenLevels={() => setBadgesGallery('levels')}
            />
          </StickySidebar>

          <main className="min-w-0 space-y-4">
            <OverviewStrip
              headline={headline}
              lastActive={lastCodingActive}
              coding={{ totalSolved: codingTotals.totalSolved, attempted: codingTotals.totalProblems, scoped: codingTotals.scoped }}
              acceptance={acceptance}
              assessments={{ attempts: num(assessmentMetrics.attempts), avgScore: normalizedAssessmentAvg }}
              interviews={{ avgScore: num(interviewMetrics.avgScore), feedbackReceived: num(interviewMetrics.feedbackReceived) }}
              learning={learning}
              streak={{ current: currentStreak, best: bestStreak, week: lastSevenDays(activity) }}
            />

            <ProfileTabs tabs={tabs} active={activeTab} onChange={setActiveTab} barRef={tabBarRef} />

            <div ref={panelRef} role="tabpanel" id={panelId(activeTab)} aria-labelledby={tabId(activeTab)} tabIndex={0} className="min-w-0 scroll-mt-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60">
              {activeTab === 'overview' ? (
                <OverviewTab
                  stats={stats}
                  videos={videos}
                  activity={activity}
                  overallCoding={overallCoding}
                  streak={{ current: currentStreak, best: bestStreak, activeDays }}
                  level={level}
                  awards={awards}
                  rawLearnerProgress={student.learnerProgress || null}
                  learnerProgress={learnerProgress}
                  onOpenGallery={setBadgesGallery}
                  peerPrep={peerPrep}
                />
              ) : null}
              {activeTab === 'coding' ? <CodingTab stats={stats} compiler={compiler} codingTotals={codingTotals} acceptance={acceptance} /> : null}
              {activeTab === 'assessments' ? <AssessmentsTab stats={stats} /> : null}
              {activeTab === 'interviews' ? <InterviewsTab stats={stats} /> : null}
              {activeTab === 'learning' ? (
                <LearningTab stats={stats} activityStats={activityStats} courses={courses} videos={videos} learning={learning} />
              ) : null}
              {activeTab === 'activity' ? <ActivityTab activity={activity} activityStats={activityStats} /> : null}
            </div>
          </main>
        </div>
      </MotionDiv>

      <BadgesGallery
        open={Boolean(badgesGallery)}
        initialTab={badgesGallery || 'awards'}
        onClose={closeBadgesGallery}
        level={level}
        awards={awards}
        learnerProgress={student.learnerProgress || null}
        subjectName={String(student.name || '').trim().split(/\s+/)[0] || 'Student'}
      />
    </div>
  );
}

/**
 * Desktop: sticky with a measured offset so the whole sidebar is always reachable by scrolling
 * the page and then stays fixed. No inner scrollbar, nothing clipped. Mobile: normal flow.
 */
function StickySidebar({ children }) {
  const sticky = useStickyTop(16);
  return (
    <aside ref={sticky.ref} style={sticky.style} aria-label="Student identity" className="min-w-0 lg:sticky lg:self-start">
      {children}
    </aside>
  );
}
