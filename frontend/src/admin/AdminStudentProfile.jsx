import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  Flame,
  GitBranch,
  Github,
  Globe,
  GraduationCap,
  Layers3,
  Linkedin,
  Mail,
  MapPin,
  PlayCircle,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react';
import ContributionCalendar from '../components/ContributionCalendar';
import { api } from '../utils/api';
import { formatDate, formatDateTime, formatDuration, formatPercent } from './compiler/compilerUtils';
import { getLearnerBadge } from '../student/profileBadge';

function difficultyClasses(difficulty) {
  if (difficulty === 'Hard') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300';
  if (difficulty === 'Medium') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
}

function statusClasses(status) {
  if (status === 'AC' || status === 'Accepted') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
  if (status === 'WA' || status === 'Wrong Answer') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
  if (status === 'TLE' || status === 'Time Limit Exceeded') return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
  if (status === 'CE' || status === 'RE' || status === 'Compilation Error' || status === 'Runtime Error') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function normalizeHref(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `https://${raw}`;
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
      {message}
    </div>
  );
}

function Panel({ title, subtitle, children, className = '' }) {
  return (
    <section className={`rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_48px_-36px_rgba(15,23,42,0.22)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_18px_48px_-36px_rgba(2,6,23,0.7)] ${className}`}>
      {(title || subtitle) && (
        <div className="border-b border-slate-100 px-4 py-3 dark:border-gray-800">
          {title ? <h2 className="text-xs font-semibold text-slate-900 dark:text-gray-100">{title}</h2> : null}
          {subtitle ? <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{subtitle}</p> : null}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

function MiniProfileRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/75 px-3.5 py-3 dark:border-gray-800 dark:bg-gray-800/80">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-700 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.22)] dark:bg-gray-900 dark:text-gray-100">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-gray-200">{value || 'Not provided'}</p>
      </div>
    </div>
  );
}

function SocialButton({ href, icon, label }) {
  const normalizedHref = normalizeHref(href);

  if (!normalizedHref) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600">
        {icon}
      </div>
    );
  }

  return (
    <a
      href={normalizedHref}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.2)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:text-white"
    >
      {icon}
    </a>
  );
}

function InsightCard({ label, value, helper, icon }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-4 transition-colors hover:bg-white dark:border-gray-800 dark:bg-gray-900/80 dark:hover:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.28)] dark:bg-gray-800 dark:text-gray-100">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-gray-100">{value}</p>
          <p className="text-xs text-slate-500 dark:text-gray-400">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function ProfessionalTrackCard({ label, value, helper, icon, tone = 'slate' }) {
  const tones = {
    sky: 'bg-sky-50 border-sky-100 text-sky-700 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-300',
    amber: 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300',
    rose: 'bg-rose-50 border-rose-100 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300',
    slate: 'bg-slate-50 border-slate-100 text-slate-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200',
  };

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.18)] dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</p>
          <p className="mt-1.5 text-xl font-bold text-slate-950 dark:text-gray-100">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{helper}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl border ${tones[tone] || tones.slate}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function LeetCodeProgressCard({
  totalSolved,
  totalProblems,
  totalAttempts,
  easySolved,
  mediumSolved,
  hardSolved,
}) {
  const ratio = Math.min(totalSolved / Math.max(totalProblems, 1), 1);
  const ringRadius = 70;
  const circumference = 2 * Math.PI * ringRadius;
  const difficultyDetails = [
    { label: 'Easy', shortLabel: 'Easy', value: easySolved, color: '#14b8a6', accentClass: 'text-teal-700 bg-teal-50 border-teal-100' },
    { label: 'Medium', shortLabel: 'Med.', value: mediumSolved, color: '#f59e0b', accentClass: 'text-amber-700 bg-amber-50 border-amber-100' },
    { label: 'Hard', shortLabel: 'Hard', value: hardSolved, color: '#f43f5e', accentClass: 'text-rose-700 bg-rose-50 border-rose-100' },
  ];
  const segments = [
    { value: easySolved, color: '#14b8a6' },
    { value: mediumSolved, color: '#f59e0b' },
    { value: hardSolved, color: '#f43f5e' },
  ];
  const totalSegmentValue = Math.max(easySolved + mediumSolved + hardSolved, 1);
  let offsetCursor = 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
      <div className="flex items-center justify-center rounded-[22px] border border-slate-200 bg-[radial-gradient(circle_at_top,#f0fdfa_0%,#fbfdff_38%,#f6f9fc_100%)] p-4 dark:border-gray-800 dark:bg-[radial-gradient(circle_at_top,#0f2f2f_0%,#0f172a_38%,#020617_100%)]">
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 180 180" className="-rotate-90 h-[200px] w-[200px]">
            <circle cx="90" cy="90" r={ringRadius} stroke="#e5e7eb" strokeWidth="8" fill="none" strokeLinecap="round" />
            <circle
              cx="90"
              cy="90"
              r={ringRadius}
              stroke="#c7f0ee"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - ratio)}
            />
            {segments.map((segment) => {
              const segmentLength = circumference * (segment.value / totalSegmentValue);
              const strokeDasharray = `${Math.max(segmentLength - 8, 0)} ${circumference}`;
              const node = (
                <circle
                  key={`${segment.color}-${segment.value}`}
                  cx="90"
                  cy="90"
                  r={ringRadius}
                  stroke={segment.color}
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={-offsetCursor}
                />
              );
              offsetCursor += segmentLength;
              return node;
            })}
          </svg>
          <div className="absolute inset-0 flex -translate-y-1 flex-col items-center justify-center px-4 text-center leading-tight">
            <div className="text-[12px] font-medium text-slate-700 dark:text-gray-300">Solved</div>
            <div className="mt-1.5 flex max-w-[150px] items-baseline justify-center gap-0.5 whitespace-nowrap font-bold tracking-tight leading-none tabular-nums">
              <span className="text-[clamp(22px,4.2vw,34px)] text-slate-950 dark:text-white">{totalSolved}</span>
              <span className="text-[clamp(16px,3.2vw,22px)] font-semibold text-slate-400 dark:text-gray-500">/</span>
              <span className="text-[clamp(16px,3.2vw,22px)] font-semibold text-slate-400 dark:text-gray-500">{totalProblems}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-teal-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-semibold">Accepted</span>
            </div>
            <div className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-gray-400">{totalAttempts} Total Attempts</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {difficultyDetails.map((item) => (
          <div
            key={item.label}
            className={`rounded-[18px] border px-3 py-3 ${item.accentClass} dark:border-opacity-40`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">{item.shortLabel}</div>
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            </div>
            <div className="mt-1 text-xl font-bold">
              {item.value}
              <span className="ml-1 text-sm font-medium text-slate-500 dark:text-gray-400">solved</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminStudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
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

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.stats || null);
      } else {
        setStats(null);
      }

      if (activityResult.status === 'fulfilled') {
        setActivity(activityResult.value.activityByDate || {});
        setActivityStats(activityResult.value.stats || null);
      } else {
        setActivity({});
        setActivityStats(null);
      }

      if (videosResult.status === 'fulfilled') {
        setVideos(videosResult.value.videos || []);
      } else {
        setVideos([]);
      }

      if (coursesResult.status === 'fulfilled') {
        setCourses(coursesResult.value.courses || []);
      } else {
        setCourses([]);
      }

      if (compilerResult.status === 'fulfilled') {
        setCompiler(compilerResult.value || null);
      } else {
        setCompiler(null);
      }

      setLoading(false);
    };

    loadStudentProfile();
    return () => {
      isMounted = false;
    };
  }, [studentId]);

  const handle = useMemo(() => {
    const base = student?.email?.split('@')[0] || student?.studentId || student?.name || 'student';
    return `@${String(base).trim().replace(/\s+/g, '').toLowerCase()}`;
  }, [student?.email, student?.name, student?.studentId]);

  const shortBio = useMemo(() => {
    if (student?.bio?.trim()) return student.bio.trim();
    const language = stats?.mostUsedLanguage ? `${stats.mostUsedLanguage} first` : 'steady practice';
    const streak = activityStats?.currentStreak || 0;
    return `Admin and coordinator view of this student's PeerPrep profile. Recent momentum: ${streak} day streak with ${language} problem-solving activity.`;
  }, [activityStats?.currentStreak, stats?.mostUsedLanguage, student?.bio]);

  const codingTotals = useMemo(() => {
    const easySolved = Number(stats?.solvedByDifficulty?.easy || 0);
    const mediumSolved = Number(stats?.solvedByDifficulty?.medium || 0);
    const hardSolved = Number(stats?.solvedByDifficulty?.hard || 0);
    const totalSolved = Number(compiler?.summary?.problemsSolved ?? stats?.totalQuestionsSolved ?? stats?.problemsSolved ?? 0);
    const totalProblems = Math.max(compiler?.attemptedProblems?.length || 0, totalSolved, 1);
    const totalAttempts = Number(compiler?.summary?.totalAttempts ?? stats?.totalSubmissions ?? 0);
    return {
      totalSolved,
      totalProblems,
      totalAttempts,
      easySolved,
      mediumSolved,
      hardSolved,
    };
  }, [compiler?.attemptedProblems?.length, compiler?.summary?.problemsSolved, compiler?.summary?.totalAttempts, stats?.problemsSolved, stats?.solvedByDifficulty?.easy, stats?.solvedByDifficulty?.hard, stats?.solvedByDifficulty?.medium, stats?.totalQuestionsSolved, stats?.totalSubmissions]);

  const performanceTitle = useMemo(() => {
    const solved = codingTotals.totalSolved;
    const streak = Number(activityStats?.currentStreak || 0);
    const assessmentScore = Number(stats?.assessmentMetrics?.avgScore || 0);
    const interviewScore = Number(stats?.interviewMetrics?.avgScore || 0);
    return getLearnerBadge({
      solvedCount: solved,
      streak,
      assessmentScore,
      interviewScore,
    });
  }, [activityStats?.currentStreak, codingTotals.totalSolved, stats?.assessmentMetrics?.avgScore, stats?.interviewMetrics?.avgScore]);

  const socialLinks = useMemo(() => ([
    { label: 'LinkedIn', href: student?.linkedinUrl || '', icon: <Linkedin className="h-4 w-4" /> },
    { label: 'GitHub', href: student?.githubUrl || '', icon: <Github className="h-4 w-4" /> },
    { label: 'Portfolio', href: student?.portfolioUrl || '', icon: <Globe className="h-4 w-4" /> },
  ]), [student?.githubUrl, student?.linkedinUrl, student?.portfolioUrl]);

  const insightCards = useMemo(() => [
    {
      label: 'Acceptance Rate',
      value: formatPercent(compiler?.summary?.acceptanceRate ?? stats?.acceptanceRate ?? 0),
      helper: 'Accepted compiler submissions',
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      label: 'Active Days',
      value: activityStats?.totalActiveDays || 0,
      helper: 'Tracked activity in the last year',
      icon: <Flame className="h-4 w-4" />,
    },
    {
      label: 'Languages Used',
      value: stats?.languagesUsed?.length || 0,
      helper: stats?.mostUsedLanguage ? `${stats.mostUsedLanguage} leads usage` : 'No language usage yet',
      icon: <Code2 className="h-4 w-4" />,
    },
    {
      label: 'Watch Time',
      value: `${stats?.totalWatchTimeHours || 0} hrs`,
      helper: 'Learning time consumed',
      icon: <Clock3 className="h-4 w-4" />,
    },
  ], [activityStats?.totalActiveDays, compiler?.summary?.acceptanceRate, stats?.acceptanceRate, stats?.languagesUsed?.length, stats?.mostUsedLanguage, stats?.totalWatchTimeHours]);

  const platformCards = useMemo(() => [
    {
      label: 'Compiler Attempts',
      value: compiler?.summary?.totalAttempts ?? stats?.totalSubmissions ?? 0,
      helper: 'All compiler submissions',
      icon: <Code2 className="h-4 w-4" />,
      tone: 'sky',
    },
    {
      label: 'Solved Problems',
      value: codingTotals.totalSolved,
      helper: 'Unique accepted questions',
      icon: <Trophy className="h-4 w-4" />,
      tone: 'emerald',
    },
    {
      label: 'Videos Watched',
      value: stats?.totalVideosWatched ?? 0,
      helper: 'Distinct learning videos completed',
      icon: <PlayCircle className="h-4 w-4" />,
      tone: 'amber',
    },
    {
      label: 'Courses Enrolled',
      value: stats?.totalCoursesEnrolled ?? 0,
      helper: 'Assigned learning tracks',
      icon: <Layers3 className="h-4 w-4" />,
      tone: 'rose',
    },
  ], [codingTotals.totalSolved, compiler?.summary?.totalAttempts, stats?.totalCoursesEnrolled, stats?.totalSubmissions, stats?.totalVideosWatched]);

  const recentSolvedProblems = stats?.recentSolvedProblems || [];
  const recentSubmissions = stats?.recentSubmissions || compiler?.submissionHistory || [];
  const recentAssessments = stats?.recentAssessments || [];
  const recentFeedback = stats?.recentFeedback || [];
  const assessmentMetrics = stats?.assessmentMetrics || {};
  const interviewMetrics = stats?.interviewMetrics || {};
  const attemptedProblems = compiler?.attemptedProblems || [];
  const solvedProblems = compiler?.solvedProblems || [];
  const topVideos = videos.slice(0, 10);
  const topCourses = courses.slice(0, 10);
  const heatmapActivity = activity;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f8fb] pt-16 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="h-[520px] animate-pulse rounded-[32px] bg-slate-200 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-[#f6f8fb] pt-16 dark:bg-slate-950">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Panel title="Student Profile Unavailable" subtitle={error || 'We could not load this student profile right now.'}>
            <div className="space-y-4">
              <EmptyState message="Please go back and try opening the student again." />
              <button
                type="button"
                onClick={() => navigate(`${rolePrefix}/students`)}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Students
              </button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f4f7fb_52%,#f8fafc_100%)] pt-16 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_52%,#020617_100%)]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6"
      >
        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate(`${rolePrefix}/students`)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_10px_22px_-16px_rgba(15,23,42,0.22)] transition-colors hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Students
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-[88px] xl:self-start">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.28)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_22px_60px_-42px_rgba(2,6,23,0.8)]">
              <div className="h-24 bg-[linear-gradient(135deg,#0f172a_0%,#12323d_38%,#0f766e_100%)]" />
              <div className="px-5 pb-5">
                <div className="-mt-12 flex items-end justify-between gap-3">
                  <div className="relative">
                    {student.avatarUrl ? (
                      <img
                        src={student.avatarUrl}
                        alt={student.name}
                        className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-[0_18px_36px_-20px_rgba(15,23,42,0.35)] dark:border-gray-900"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-[linear-gradient(135deg,#0f172a_0%,#334155_100%)] text-3xl font-bold text-white shadow-[0_18px_36px_-20px_rgba(15,23,42,0.35)] dark:border-gray-900">
                        {student.name ? student.name.charAt(0).toUpperCase() : 'S'}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                      {performanceTitle.title}
                    </span>
                    <p className="mt-2 max-w-[180px] text-xs leading-5 text-slate-500 dark:text-gray-400">{performanceTitle.helper}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <h1 className="text-xl font-bold text-slate-950 dark:text-gray-100">{student.name || 'Student'}</h1>
                  <p className="mt-1 text-sm font-medium text-slate-500 dark:text-gray-400">{handle}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-gray-300">{shortBio}</p>
                </div>

                <div className="mt-5 flex items-center gap-2">
                  {socialLinks.map((item) => (
                    <SocialButton key={item.label} {...item} />
                  ))}
                </div>

                <div className="mt-5 grid gap-3">
                  <MiniProfileRow icon={<GraduationCap className="h-4 w-4" />} label="College" value={student.college} />
                  <MiniProfileRow icon={<BookOpen className="h-4 w-4" />} label="Course" value={student.course} />
                  <MiniProfileRow icon={<GitBranch className="h-4 w-4" />} label="Branch" value={student.branch} />
                  <MiniProfileRow icon={<UserRound className="h-4 w-4" />} label="Student ID" value={student.studentId} />
                  <MiniProfileRow icon={<MapPin className="h-4 w-4" />} label="Semester" value={student.semester ? `Semester ${student.semester}` : ''} />
                  <MiniProfileRow icon={<Mail className="h-4 w-4" />} label="Email" value={student.email} />
                  <MiniProfileRow icon={<ShieldCheck className="h-4 w-4" />} label="Coordinator Access" value={student.teacherId || 'Not assigned'} />
                  <MiniProfileRow icon={<Clock3 className="h-4 w-4" />} label="Joined" value={formatDate(student.createdAt)} />
                </div>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <Panel
                title="Coding Progress"
                subtitle="Student-style coding snapshot, expanded for admin and coordinator visibility."
              >
                <LeetCodeProgressCard {...codingTotals} />
              </Panel>

              <Panel
                title="Platform Access"
                subtitle="Cross-feature counts for coding, learning, and overall momentum."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {platformCards.map((item) => (
                    <ProfessionalTrackCard key={item.label} {...item} />
                  ))}
                </div>
              </Panel>
            </section>

            <Panel
              title="Activity Heatmap"
              subtitle="Year-round student activity across compiler submissions and tracked platform actions."
            >
              <ContributionCalendar
                title=""
                activity={heatmapActivity}
                stats={activityStats}
                tooltipFormatter={({ value, formattedDate }) => `${value} tracked actions on ${formattedDate}`}
                legendLabels={{
                  none: 'No activity',
                  low: '1-2 actions',
                  medium: '3-4 actions',
                  high: '5-7 actions',
                  highest: '8+ actions',
                }}
              />
            </Panel>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {insightCards.map((item) => (
                <InsightCard key={item.label} {...item} />
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <Panel title="Recent Solved Questions" subtitle="Latest accepted milestones from the compiler.">
                {recentSolvedProblems.length === 0 ? (
                  <EmptyState message="This student has not solved any problems yet." />
                ) : (
                  <div className="space-y-3">
                    {recentSolvedProblems.map((problem, index) => (
                      <div key={`${problem.title}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 transition-colors hover:bg-white dark:border-gray-800 dark:bg-gray-800/80 dark:hover:bg-gray-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{problem.title}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Solved on {formatDateTime(problem.acceptedAt)}</p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${difficultyClasses(problem.difficulty)}`}>
                            {problem.difficulty}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Recent Submissions" subtitle="Latest coding attempts with verdict and runtime.">
                {recentSubmissions.length === 0 ? (
                  <EmptyState message="Submission history will appear here once the student starts solving problems." />
                ) : (
                  <div className="space-y-3">
                    {recentSubmissions.map((submission, index) => (
                      <div key={`${submission.problemTitle}-${submission.createdAt}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 transition-colors hover:bg-white dark:border-gray-800 dark:bg-gray-800/80 dark:hover:bg-gray-800">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{submission.problemTitle}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {submission.language} | {formatDuration(submission.executionTimeMs)} | {formatDateTime(submission.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {submission.difficulty ? (
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${difficultyClasses(submission.difficulty)}`}>
                                {submission.difficulty}
                              </span>
                            ) : null}
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(submission.status)}`}>
                              {submission.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <Panel title="Attempted Problems" subtitle="Every problem this student has interacted with.">
                {attemptedProblems.length === 0 ? (
                  <EmptyState message="No attempted problems yet." />
                ) : (
                  <div className="space-y-3">
                    {attemptedProblems.map((problem) => (
                      <div key={problem.problemId} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{problem.title}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {problem.attempts} attempts | Last activity {formatDateTime(problem.lastSubmittedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${difficultyClasses(problem.difficulty)}`}>
                              {problem.difficulty}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(problem.lastStatus)}`}>
                              {problem.lastStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Solved Problems" subtitle="Questions this student has solved successfully.">
                {solvedProblems.length === 0 ? (
                  <EmptyState message="No solved problems yet." />
                ) : (
                  <div className="space-y-3">
                    {solvedProblems.map((problem) => (
                      <div key={problem.problemId} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{problem.title}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Solved on {formatDateTime(problem.acceptedAt)}</p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${difficultyClasses(problem.difficulty)}`}>
                            {problem.difficulty}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <Panel title="Detailed Student Activity" subtitle="Everything admins and coordinators should see about this student's current usage.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ProfessionalTrackCard label="Current Streak" value={`${activityStats?.currentStreak || 0}d`} helper="Consecutive active days" icon={<Flame className="h-4 w-4" />} tone="rose" />
                <ProfessionalTrackCard label="Best Streak" value={`${activityStats?.bestStreak || 0}d`} helper="Best active run" icon={<Trophy className="h-4 w-4" />} tone="amber" />
                <ProfessionalTrackCard label="Total Activities" value={activityStats?.totalActivities || 0} helper="Tracked actions this year" icon={<Layers3 className="h-4 w-4" />} tone="sky" />
                <ProfessionalTrackCard label="Last Compiler Activity" value={compiler?.summary?.lastActive ? formatDate(compiler.summary.lastActive) : 'None'} helper="Most recent compiler usage" icon={<Clock3 className="h-4 w-4" />} tone="emerald" />
              </div>
            </Panel>

            <section className="grid gap-6 xl:grid-cols-2">
              <Panel title="Assessment Performance" subtitle="Formal assessment attempts, scoring, and latest submissions.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfessionalTrackCard label="Attempts" value={assessmentMetrics.attempts || 0} helper="Submitted assessments" icon={<BookOpen className="h-4 w-4" />} tone="amber" />
                  <ProfessionalTrackCard label="Average Score" value={`${Math.round(assessmentMetrics.avgScore || 0)}%`} helper="Across submitted assessments" icon={<Trophy className="h-4 w-4" />} tone="emerald" />
                  <ProfessionalTrackCard label="Average Accuracy" value={`${Math.round(assessmentMetrics.avgAccuracy || 0)}%`} helper="Question correctness rate" icon={<ShieldCheck className="h-4 w-4" />} tone="sky" />
                  <ProfessionalTrackCard label="Highest Score" value={`${Math.round(assessmentMetrics.highestScore || 0)}%`} helper={assessmentMetrics.latestSubmittedAt ? `Latest on ${formatDateTime(assessmentMetrics.latestSubmittedAt)}` : 'No assessments yet'} icon={<CheckCircle2 className="h-4 w-4" />} tone="rose" />
                </div>

                <div className="mt-4 space-y-3">
                  {recentAssessments.length === 0 ? (
                    <EmptyState message="No assessment submissions available yet." />
                  ) : recentAssessments.map((entry, index) => (
                    <div key={`${entry.assessmentId || 'assessment'}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">Assessment Attempt {index + 1}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Submitted on {formatDateTime(entry.submittedAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                            Score {Math.round(entry.score || 0)}%
                          </span>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                            Accuracy {Math.round(entry.accuracy || 0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Interview and Feedback" subtitle="Interview participation, received feedback, and review quality metrics.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfessionalTrackCard label="Total Interviews" value={interviewMetrics.totalPairs || 0} helper="All assigned interview pairs" icon={<UserRound className="h-4 w-4" />} tone="sky" />
                  <ProfessionalTrackCard label="Completed" value={interviewMetrics.completed || 0} helper={`${interviewMetrics.scheduled || 0} scheduled, ${interviewMetrics.pending || 0} pending`} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
                  <ProfessionalTrackCard label="Feedback Received" value={interviewMetrics.feedbackReceived || 0} helper={`${interviewMetrics.feedbackGiven || 0} feedback forms submitted by student`} icon={<ShieldCheck className="h-4 w-4" />} tone="amber" />
                  <ProfessionalTrackCard label="Average Interview Score" value={`${Math.round(interviewMetrics.avgScore || 0)}%`} helper={interviewMetrics.latestFeedbackAt ? `Latest on ${formatDateTime(interviewMetrics.latestFeedbackAt)}` : 'No feedback yet'} icon={<Trophy className="h-4 w-4" />} tone="rose" />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ['Communication', interviewMetrics.avgCommunication],
                    ['Problem Solving', interviewMetrics.avgProblemSolving],
                    ['Preparedness', interviewMetrics.avgPreparedness],
                    ['Attitude', interviewMetrics.avgAttitude],
                    ['Integrity', interviewMetrics.avgIntegrity],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-center dark:border-gray-800 dark:bg-gray-800/80">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</p>
                      <p className="mt-2 text-lg font-bold text-slate-900 dark:text-gray-100">{Number(value || 0).toFixed(1)}/5</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {recentFeedback.length === 0 ? (
                    <EmptyState message="No interview feedback records found for this student." />
                  ) : recentFeedback.map((entry, index) => (
                    <div key={`${entry.fromName}-${entry.createdAt}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{entry.fromName}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{entry.eventName} | {formatDateTime(entry.createdAt)}</p>
                        </div>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                          {entry.marks || 0} / 100
                        </span>
                      </div>
                      {entry.comments ? <p className="mt-3 text-sm text-slate-600 dark:text-gray-300">{entry.comments}</p> : null}
                      {entry.suggestions ? <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">Suggestion: {entry.suggestions}</p> : null}
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <Panel title="Courses Enrolled" subtitle="Assigned course access and progress for this student.">
                {topCourses.length === 0 ? (
                  <EmptyState message="No course enrollments found." />
                ) : (
                  <div className="space-y-3">
                    {topCourses.map((course, index) => (
                      <div key={`${course.courseName || 'course'}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{course.courseName || 'Untitled Course'}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {course.semesterName || 'Semester not set'} | Enrolled {course.enrollmentDate ? formatDate(course.enrollmentDate) : 'Unknown'}
                            </p>
                          </div>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                            {course.progressPercentage || 0}% {course.progressStatus || 'Not Started'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Recent Videos Watched" subtitle="Latest learning content consumed by this student.">
                {topVideos.length === 0 ? (
                  <EmptyState message="No watched videos found." />
                ) : (
                  <div className="space-y-3">
                    {topVideos.map((video, index) => (
                      <div key={`${video.videoTitle || 'video'}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{video.videoTitle || 'Untitled Video'}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {video.subjectName || 'Subject'} | {video.chapterName || 'Chapter'} | {video.watchedDate ? formatDateTime(video.watchedDate) : 'Unknown'}
                            </p>
                          </div>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                            {video.durationDisplay || '0m'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </section>
          </main>
        </div>
      </motion.div>
    </div>
  );
}
