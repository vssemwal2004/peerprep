import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock3,
  Code2,
  Flame,
  GitBranch,
  Hash,
  Layers3,
  Mail,
  MapPin,
  PlayCircle,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';
import ContributionCalendar from '../components/ContributionCalendar';
import { api } from '../utils/api';
import socketService from '../utils/socket';

const SECTION_LINKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'performance', label: 'Performance' },
  { id: 'recent', label: 'Recent' },
];

function formatDateTime(value) {
  if (!value) return 'Just now';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(value) {
  return `${Number(value || 0).toFixed(2)} ms`;
}

function difficultyClasses(difficulty) {
  if (difficulty === 'Hard') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300';
  if (difficulty === 'Medium') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
}

function statusClasses(status) {
  if (status === 'AC') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
  if (status === 'WA') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
  if (status === 'TLE') return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
  if (status === 'CE' || status === 'RE') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function AnimatedMetric({ value, suffix = '', decimals = 0, className = '' }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const numericValue = Number(value || 0);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
    const duration = 650;
    const startValue = displayValue;
    const startedAt = performance.now();
    let frameId = 0;

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - ((1 - progress) ** 3);
      const nextValue = startValue + ((safeValue - startValue) * eased);
      setDisplayValue(nextValue);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return (
    <span className={className}>
      {Number(displayValue).toFixed(decimals)}
      {suffix}
    </span>
  );
}

function SectionPanel({ id, title, subtitle, children, className = '' }) {
  return (
    <section
      id={id}
      className={`rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] backdrop-blur dark:border-gray-700 dark:bg-gray-900/80 ${className}`}
    >
      {(title || subtitle) && (
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            {title ? <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

function PillNav() {
  const handleJump = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="sticky top-[76px] z-20 overflow-x-auto">
      <div className="inline-flex min-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 p-2 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.45)] backdrop-blur dark:border-gray-700 dark:bg-gray-900/85">
        {SECTION_LINKS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => handleJump(section.id)}
            className="rounded-full border border-transparent bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/20 dark:hover:text-sky-300"
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoTile({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_18px_45px_-36px_rgba(14,116,144,0.4)] backdrop-blur dark:border-gray-700 dark:bg-gray-800/80">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-white">{value || 'Not provided'}</p>
        </div>
      </div>
    </div>
  );
}

function HeroMetricCard({ label, value, helper, suffix = '', decimals = 0, tone }) {
  return (
    <div className={`rounded-[24px] border p-4 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <div className="mt-3 text-3xl font-bold">
        <AnimatedMetric value={value} suffix={suffix} decimals={decimals} />
      </div>
      <p className="mt-1 text-xs opacity-80">{helper}</p>
    </div>
  );
}

function MetricCard({ label, value, helper, icon, suffix = '', decimals = 0, accent }) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">{label}</p>
          <div className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
            <AnimatedMetric value={value} suffix={suffix} decimals={decimals} />
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{helper}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProgressTrack({ label, value, max, tone, suffix = '' }) {
  const safeValue = Number(value || 0);
  const safeMax = Math.max(Number(max || 0), 1);
  const width = Math.min((safeValue / safeMax) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-gray-200">{label}</span>
        <span className="font-semibold text-slate-900 dark:text-white">
          <AnimatedMetric value={safeValue} suffix={suffix} decimals={suffix === '%' ? 1 : 0} />
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-gray-800">
        <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${Math.max(width, safeValue ? 10 : 0)}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
      {message}
    </div>
  );
}

export default function StudentProfile() {
  const [user, setUser] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activity, setActivity] = useState({});
  const [activityStats, setActivityStats] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const isMountedRef = useRef(true);

  const loadActivityData = async (showSpinner = false) => {
    if (showSpinner && isMountedRef.current) {
      setLoadingActivity(true);
    }
    try {
      const data = await api.getStudentActivity();
      if (!isMountedRef.current) return;
      setActivity(data.activityByDate || {});
      setActivityStats(data.stats || null);
    } catch {
      if (!isMountedRef.current) return;
      setActivity({});
      setActivityStats(null);
    } finally {
      if (showSpinner && isMountedRef.current) {
        setLoadingActivity(false);
      }
    }
  };

  const loadStats = async () => {
    try {
      const data = await api.getStudentStats();
      if (!isMountedRef.current) return;
      setStats(data.stats || null);
    } catch {
      if (!isMountedRef.current) return;
      setStats(null);
    }
  };

  const refreshMetrics = async ({ withActivitySpinner = false } = {}) => {
    await Promise.all([
      loadStats(),
      loadActivityData(withActivitySpinner),
    ]);
  };

  useEffect(() => {
    isMountedRef.current = true;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const me = await api.me();
        if (!isMountedRef.current) return;
        setUser(me);
        await refreshMetrics({ withActivitySpinner: true });
      } catch (loadError) {
        if (!isMountedRef.current) return;
        setError(loadError.message || 'Failed to load profile.');
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user?._id) return undefined;

    socketService.connect();
    const handleLearningUpdate = () => {
      void refreshMetrics();
    };
    const handleCompilerUpdate = (submission) => {
      if (String(submission?.userId || '') !== String(user._id)) return;
      void refreshMetrics();
    };

    socketService.on('learning-updated', handleLearningUpdate);
    socketService.on('compiler-submission-updated', handleCompilerUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
      socketService.off('compiler-submission-updated', handleCompilerUpdate);
    };
  }, [user?._id]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);

    const timer = setTimeout(() => {
      void refreshMetrics();
    }, Math.max(nextMidnight.getTime() - now.getTime(), 0));

    return () => clearTimeout(timer);
  }, [activityStats?.currentStreak, stats?.totalSubmissions]);

  const onAvatarChange = (event) => {
    const file = event.target.files?.[0] || null;
    setAvatarFile(file);
    if (!file) {
      setAvatarPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const openPhotoModal = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setError('');
    setSuccess('');
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    setShowPhotoModal(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setError('');
    setSuccess('');
  };

  const handleUpdatePhoto = async () => {
    if (!avatarFile) {
      setError('Please select a photo first.');
      return;
    }

    try {
      await api.updateMyAvatar(avatarFile);
      const me = await api.me();
      if (!isMountedRef.current) return;
      setUser(me);
      if (me && me.avatarUrl !== undefined) {
        localStorage.setItem('studentAvatarUrl', me.avatarUrl || '');
      }
      setSuccess('Profile photo updated successfully.');
      setTimeout(() => closePhotoModal(), 1200);
    } catch (updateError) {
      if (!isMountedRef.current) return;
      setError(updateError.message || 'Failed to update photo.');
    }
  };

  const summaryLine = useMemo(() => {
    const solved = stats?.totalQuestionsSolved || 0;
    const videos = stats?.totalVideosWatched || 0;
    const streak = activityStats?.currentStreak || 0;
    return `PeerPrep is tracking ${solved} solved problems, ${videos} completed videos, and a ${streak}-day learning streak for you right now.`;
  }, [activityStats?.currentStreak, stats?.totalQuestionsSolved, stats?.totalVideosWatched]);

  const heroMetrics = useMemo(() => ([
    {
      label: 'Questions Solved',
      value: stats?.totalQuestionsSolved || 0,
      helper: 'Accepted coding problems',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
    },
    {
      label: 'Acceptance Rate',
      value: stats?.acceptanceRate || 0,
      helper: 'Accepted submission ratio',
      suffix: '%',
      decimals: 1,
      tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
    },
    {
      label: 'Current Streak',
      value: activityStats?.currentStreak || 0,
      helper: 'Days in a row',
      suffix: 'd',
      tone: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300',
    },
    {
      label: 'Best Streak',
      value: activityStats?.bestStreak || 0,
      helper: 'Longest active run',
      suffix: 'd',
      tone: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300',
    },
  ]), [activityStats?.bestStreak, activityStats?.currentStreak, stats?.acceptanceRate, stats?.totalQuestionsSolved]);

  const overviewMetrics = useMemo(() => ([
    {
      label: 'Questions Attempted',
      value: stats?.totalQuestionsAttempted || 0,
      helper: 'Unique problems tried',
      icon: <Code2 className="h-5 w-5" />,
      accent: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
    },
    {
      label: 'Total Submissions',
      value: stats?.totalSubmissions || 0,
      helper: 'All coding attempts',
      icon: <Layers3 className="h-5 w-5" />,
      accent: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300',
    },
    {
      label: 'Accepted Submissions',
      value: stats?.acceptedSubmissions || 0,
      helper: 'Green verdict count',
      icon: <CheckCircle2 className="h-5 w-5" />,
      accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    },
    {
      label: 'Question Success Rate',
      value: stats?.questionSuccessRate || 0,
      helper: 'Solved vs attempted',
      icon: <Trophy className="h-5 w-5" />,
      suffix: '%',
      decimals: 1,
      accent: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300',
    },
    {
      label: 'Courses Enrolled',
      value: stats?.totalCoursesEnrolled || 0,
      helper: 'Assigned learning tracks',
      icon: <BookOpen className="h-5 w-5" />,
      accent: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    },
    {
      label: 'Videos Watched',
      value: stats?.totalVideosWatched || 0,
      helper: 'Completed learning videos',
      icon: <PlayCircle className="h-5 w-5" />,
      accent: 'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300',
    },
    {
      label: 'Watch Time',
      value: stats?.totalWatchTimeHours || 0,
      helper: 'Learning hours invested',
      icon: <Clock3 className="h-5 w-5" />,
      suffix: 'h',
      decimals: 1,
      accent: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
    },
    {
      label: 'Active Days',
      value: activityStats?.totalActiveDays || 0,
      helper: 'Tracked days this year',
      icon: <Flame className="h-5 w-5" />,
      accent: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    },
  ]), [
    activityStats?.totalActiveDays,
    stats?.acceptedSubmissions,
    stats?.questionSuccessRate,
    stats?.totalCoursesEnrolled,
    stats?.totalQuestionsAttempted,
    stats?.totalSubmissions,
    stats?.totalVideosWatched,
    stats?.totalWatchTimeHours,
  ]);

  const solvedMax = Math.max(
    stats?.solvedByDifficulty?.easy || 0,
    stats?.solvedByDifficulty?.medium || 0,
    stats?.solvedByDifficulty?.hard || 0,
    1,
  );
  const videoTotal = Math.max(activityStats?.totalVideosTotal || 0, stats?.totalVideosWatched || 0, 1);

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-slate-50 pt-16 dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="h-[520px] animate-pulse rounded-[32px] bg-slate-200 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 pt-16 dark:bg-gray-950">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <SectionPanel title="Profile Unavailable" subtitle={error || 'We could not load your profile right now.'}>
            <EmptyState message="Please refresh the page and try again." />
          </SectionPanel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.35),transparent_32%),radial-gradient(circle_at_top_right,rgba(167,243,208,0.22),transparent_26%),linear-gradient(180deg,#f8fbff_0%,#eef6ff_45%,#f8fafc_100%)] pt-16 dark:bg-gray-950">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6"
      >
        <section className="relative overflow-hidden rounded-[36px] border border-sky-100 bg-white/92 p-6 shadow-[0_30px_120px_-72px_rgba(14,116,144,0.55)] backdrop-blur dark:border-gray-700 dark:bg-gray-900/88">
          <div className="absolute -left-16 top-0 h-56 w-56 rounded-full bg-sky-200/45 blur-3xl dark:bg-sky-700/20" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-700/15" />
          <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-indigo-200/25 blur-3xl dark:bg-indigo-700/15" />

          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                <div className="relative shrink-0">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="h-28 w-28 rounded-[28px] border-4 border-white object-cover shadow-xl dark:border-gray-800"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-[28px] border-4 border-white bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-4xl font-bold text-white shadow-xl dark:border-gray-800">
                      {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={openPhotoModal}
                    className="absolute -bottom-1 -right-1 rounded-2xl border-2 border-white bg-white p-2.5 text-sky-600 shadow-lg hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-sky-300 dark:hover:bg-gray-700"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-w-0 space-y-3">
                  <div>
                    <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                      PeerPrep Student Profile
                    </p>
                    <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{user.name || 'Student'}</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-gray-300">{summaryLine}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm text-slate-600 dark:text-gray-300">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium dark:bg-gray-800">
                      #{user.studentId || 'Student ID'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium dark:bg-gray-800">
                      Semester {user.semester || '-'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium dark:bg-gray-800">
                      {stats?.mostUsedLanguage ? `${stats.mostUsedLanguage} primary` : 'No primary language yet'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <InfoTile icon={<Mail className="h-5 w-5" />} label="Email" value={user.email} />
                <InfoTile icon={<BookOpen className="h-5 w-5" />} label="Course" value={user.course} />
                <InfoTile icon={<GitBranch className="h-5 w-5" />} label="Branch" value={user.branch} />
                <InfoTile icon={<MapPin className="h-5 w-5" />} label="College" value={user.college} />
                <InfoTile icon={<UserCheck className="h-5 w-5" />} label="Coordinator" value={user.teacherId || 'Not assigned'} />
                <InfoTile icon={<Hash className="h-5 w-5" />} label="Semester" value={user.semester ? `Semester ${user.semester}` : 'Not provided'} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {heroMetrics.map((item) => (
                <HeroMetricCard key={item.label} {...item} />
              ))}
            </div>
          </div>
        </section>

        <PillNav />

        <div id="overview" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewMetrics.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>

        <div id="activity" className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
          <SectionPanel title="Practice Calendar" subtitle="Your year-round activity pattern across learning and compiler work.">
            {loadingActivity ? (
              <div className="py-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
                <p className="mt-4 text-sm text-slate-500 dark:text-gray-400">Loading activity...</p>
              </div>
            ) : (
              <ContributionCalendar
                activity={activity}
                title="Practice Calendar"
                tooltipFormatter={({ value, formattedDate }) => `${value} tracked activities on ${formattedDate}`}
              />
            )}
          </SectionPanel>

          <SectionPanel title="Activity Signals" subtitle="Consistency, momentum, and routine quality across your PeerPrep journey.">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/70">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Current Streak</p>
                  <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    <AnimatedMetric value={activityStats?.currentStreak || 0} suffix="d" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Days in a row</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/70">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Best Streak</p>
                  <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    <AnimatedMetric value={activityStats?.bestStreak || 0} suffix="d" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Best run recorded</p>
                </div>
              </div>

              <div className="space-y-4">
                <ProgressTrack
                  label="Solved by attempted questions"
                  value={stats?.questionSuccessRate || 0}
                  max={100}
                  suffix="%"
                  tone="bg-gradient-to-r from-emerald-500 to-lime-400"
                />
                <ProgressTrack
                  label="Active days this year"
                  value={activityStats?.totalActiveDays || 0}
                  max={activityStats?.totalDaysInRange || 365}
                  tone="bg-gradient-to-r from-sky-500 to-cyan-400"
                />
                <ProgressTrack
                  label="Video completion progress"
                  value={stats?.totalVideosWatched || 0}
                  max={videoTotal}
                  tone="bg-gradient-to-r from-pink-500 to-rose-400"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Most Used Language</p>
                <p className="mt-2 text-xl font-bold capitalize text-slate-900 dark:text-white">{stats?.mostUsedLanguage || 'N/A'}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Based on your coding submissions.</p>
              </div>
            </div>
          </SectionPanel>
        </div>

        <div id="performance" className="grid gap-6 xl:grid-cols-3">
          <SectionPanel title="Solved by Difficulty" subtitle="How your accepted problems are distributed.">
            <div className="space-y-4">
              <ProgressTrack label="Easy" value={stats?.solvedByDifficulty?.easy || 0} max={solvedMax} tone="bg-emerald-500" />
              <ProgressTrack label="Medium" value={stats?.solvedByDifficulty?.medium || 0} max={solvedMax} tone="bg-amber-500" />
              <ProgressTrack label="Hard" value={stats?.solvedByDifficulty?.hard || 0} max={solvedMax} tone="bg-rose-500" />
            </div>
          </SectionPanel>

          <SectionPanel title="Verdict Overview" subtitle="Submission quality across your coding activity.">
            <div className="space-y-3">
              {[
                { label: 'Accepted', key: 'AC' },
                { label: 'Wrong Answer', key: 'WA' },
                { label: 'Time Limit Exceeded', key: 'TLE' },
                { label: 'Runtime / Compile', key: 'RE' },
              ].map((item) => {
                const value = item.key === 'RE'
                  ? (stats?.statusBreakdown?.RE || 0) + (stats?.statusBreakdown?.CE || 0)
                  : (stats?.statusBreakdown?.[item.key] || 0);

                return (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <span className="text-sm text-slate-700 dark:text-gray-200">{item.label}</span>
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">
                      <AnimatedMetric value={value} />
                    </span>
                  </div>
                );
              })}
            </div>
          </SectionPanel>

          <SectionPanel title="Languages Used" subtitle="Your coding stack inside the compiler.">
            {(stats?.languagesUsed || []).length === 0 ? (
              <EmptyState message="No compiler activity yet." />
            ) : (
              <div className="space-y-3">
                {stats.languagesUsed.slice(0, 5).map((item) => (
                  <div key={item.language} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <span className="text-sm capitalize text-slate-700 dark:text-gray-200">{item.language}</span>
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">
                      <AnimatedMetric value={item.count} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>

        <div id="recent" className="grid gap-6 xl:grid-cols-2">
          <SectionPanel title="Recent Solved Questions" subtitle="Your latest accepted coding wins.">
            {(stats?.recentSolvedProblems || []).length === 0 ? (
              <EmptyState message="Solve a problem to start building your accepted history." />
            ) : (
              <div className="space-y-3">
                {stats.recentSolvedProblems.map((problem, index) => (
                  <div key={`${problem.title}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">{problem.title}</p>
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
          </SectionPanel>

          <SectionPanel title="Recent Submissions" subtitle="Latest coding attempts with verdict and runtime.">
            {(stats?.recentSubmissions || []).length === 0 ? (
              <EmptyState message="Your recent submissions will appear here once you start solving problems." />
            ) : (
              <div className="space-y-3">
                {stats.recentSubmissions.map((submission, index) => (
                  <div key={`${submission.problemTitle}-${submission.createdAt}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{submission.problemTitle}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                          {submission.language} | {formatDuration(submission.executionTimeMs)} | {formatDateTime(submission.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${difficultyClasses(submission.difficulty)}`}>
                          {submission.difficulty}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(submission.status)}`}>
                          {submission.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>
      </motion.div>

      <AnimatePresence>
        {showPhotoModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePhotoModal}
              className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-4 text-white">
                  <h2 className="text-lg font-semibold">Update Profile Photo</h2>
                  <button type="button" onClick={closePhotoModal} className="rounded-xl p-2 hover:bg-white/15">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 p-6">
                  {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                      {error}
                    </div>
                  ) : null}
                  {success ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                      {success}
                    </div>
                  ) : null}

                  <div className="flex flex-col items-center text-center">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="h-32 w-32 rounded-full border-4 border-sky-500 object-cover shadow-lg" />
                    ) : user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-32 w-32 rounded-full border-4 border-slate-200 object-cover shadow-lg dark:border-gray-700" />
                    ) : (
                      <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-slate-200 bg-gradient-to-br from-sky-500 to-indigo-600 text-4xl font-bold text-white shadow-lg dark:border-gray-700">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}

                    <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500">
                      <Camera className="h-4 w-4" />
                      Choose Photo
                      <input type="file" accept="image/*" onChange={onAvatarChange} className="hidden" />
                    </label>
                    <p className="mt-3 text-sm text-slate-600 dark:text-gray-300">
                      {avatarFile ? avatarFile.name : 'Square image recommended, at least 256 x 256 px.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/60">
                  <button type="button" onClick={closePhotoModal} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdatePhoto}
                    disabled={!avatarFile}
                    className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Update Photo
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
