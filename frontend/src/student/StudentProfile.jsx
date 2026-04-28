import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  ClipboardList,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock3,
  Code2,
  Flame,
  GitBranch,
  Github,
  Globe,
  GraduationCap,
  Linkedin,
  Mail,
  MapPin,
  MessageSquare,
  Target,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import ContributionCalendar from '../components/ContributionCalendar';
import { api } from '../utils/api';
import socketService from '../utils/socket';
import { getLearnerBadge } from './profileBadge';

const MotionDiv = motion.div;

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
    const duration = 600;
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
  }, [displayValue, value]);

  return (
    <span className={className}>
      {Number(displayValue).toFixed(decimals)}
      {suffix}
    </span>
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

function CompactStatCard({ label, value, helper, icon, tone = 'slate', suffix = '', decimals = 0 }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
    rose: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
    sky: 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
    slate: 'bg-slate-50 text-slate-700 border-slate-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700',
  };

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.2)] transition-transform duration-200 hover:-translate-y-0.5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</p>
          <div className="mt-2 text-xl font-bold text-slate-900 dark:text-gray-100">
            <AnimatedMetric value={value} suffix={suffix} decimals={decimals} />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{helper}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${tones[tone] || tones.slate}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ label, value, helper, icon, suffix = '', decimals = 0 }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-4 transition-colors hover:bg-white dark:border-gray-800 dark:bg-gray-900/80 dark:hover:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.28)] dark:bg-gray-800 dark:text-gray-100">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-gray-100">
            <AnimatedMetric value={value} suffix={suffix} decimals={decimals} />
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400">{helper}</p>
        </div>
      </div>
    </div>
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
  const normalizedHref = (() => {
    const raw = typeof href === 'string' ? href.trim() : '';
    if (!raw) return '';
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    return `https://${raw}`;
  })();

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

function ProfileField({ label, value, onChange, placeholder = '', multiline = false, type = 'text', disabled = false }) {
  const sharedClassName = disabled
    ? 'w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 outline-none placeholder:text-slate-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:placeholder:text-gray-500'
    : 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/40';

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={`${sharedClassName} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={sharedClassName}
        />
      )}
    </label>
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
  const [showBeats, setShowBeats] = useState(false);
  const [activeDifficulty, setActiveDifficulty] = useState('');
  const ratio = Math.min(totalSolved / Math.max(totalProblems, 1), 1);
  const ringRadius = 70;
  const circumference = 2 * Math.PI * ringRadius;
  const beats = Math.max(1, Math.min(99.9, Number((ratio * 100).toFixed(2))));
  const difficultyDetails = [
    {
      label: 'Easy',
      shortLabel: 'Easy',
      value: easySolved,
      color: '#0f766e',
      softColor: '#ccfbf1',
      accentClass: 'text-teal-700 bg-teal-50 border-teal-100',
      beats: Math.max(1, Math.min(99.9, Number(((easySolved / Math.max(totalSolved || 1, 1)) * 100).toFixed(2)))),
    },
    {
      label: 'Medium',
      shortLabel: 'Med.',
      value: mediumSolved,
      color: '#d97706',
      softColor: '#fef3c7',
      accentClass: 'text-amber-700 bg-amber-50 border-amber-100',
      beats: Math.max(1, Math.min(99.9, Number(((mediumSolved / Math.max(totalSolved || 1, 1)) * 100).toFixed(2)))),
    },
    {
      label: 'Hard',
      shortLabel: 'Hard',
      value: hardSolved,
      color: '#e11d48',
      softColor: '#ffe4e6',
      accentClass: 'text-rose-700 bg-rose-50 border-rose-100',
      beats: Math.max(1, Math.min(99.9, Number(((hardSolved / Math.max(totalSolved || 1, 1)) * 100).toFixed(2)))),
    },
  ];
  const segments = [
    { value: easySolved, color: '#14b8a6' },
    { value: mediumSolved, color: '#f59e0b' },
    { value: hardSolved, color: '#f43f5e' },
  ];
  const totalSegmentValue = Math.max(easySolved + mediumSolved + hardSolved, 1);
  let offsetCursor = 0;
  const hoveredDifficulty = difficultyDetails.find((item) => item.label === activeDifficulty) || null;
  const headlineLabel = hoveredDifficulty ? hoveredDifficulty.label : (showBeats ? 'Solved Share' : 'Solved');
  const headlineValue = hoveredDifficulty ? hoveredDifficulty.beats : beats;
  const headlineColor = hoveredDifficulty?.color || '#0f172a';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
      <div className="flex items-center justify-center rounded-[22px] border border-slate-200 bg-[radial-gradient(circle_at_top,#f0fdfa_0%,#fbfdff_38%,#f6f9fc_100%)] p-4 dark:border-gray-800 dark:bg-[radial-gradient(circle_at_top,#0f2f2f_0%,#0f172a_38%,#020617_100%)]">
        <div
          className="relative flex items-center justify-center"
          onMouseEnter={() => setShowBeats(true)}
          onMouseLeave={() => {
            setShowBeats(false);
            setActiveDifficulty('');
          }}
        >
          <svg viewBox="0 0 180 180" className="-rotate-90 h-[200px] w-[200px]">
            <circle
              cx="90"
              cy="90"
              r={ringRadius}
              stroke="#e5e7eb"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
            />
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
                  key={segment.color}
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
            <div className="text-[12px] font-medium text-slate-700 dark:text-gray-300">{headlineLabel}</div>

            {showBeats || hoveredDifficulty ? (
              <div className="mt-1.5 flex items-end justify-center gap-1.5 font-bold tracking-tight leading-none tabular-nums">
                <span className="text-[28px] sm:text-[32px]" style={{ color: headlineColor }}>
                  {headlineValue}
                </span>
                <span className="pb-[2px] text-lg font-semibold text-slate-500 dark:text-gray-400">%</span>
              </div>
            ) : (
              <div className="mt-1.5 flex max-w-[150px] items-baseline justify-center gap-0.5 whitespace-nowrap font-bold tracking-tight leading-none tabular-nums">
                <span className="text-[clamp(22px,4.2vw,34px)] text-slate-950 dark:text-white">{totalSolved}</span>
                <span className="text-[clamp(16px,3.2vw,22px)] font-semibold text-slate-400 dark:text-gray-500">/</span>
                <span className="text-[clamp(16px,3.2vw,22px)] font-semibold text-slate-400 dark:text-gray-500">{totalProblems}</span>
              </div>
            )}

            {!showBeats && !hoveredDifficulty && (
              <div className="mt-1.5 flex items-center gap-2 text-teal-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-semibold">Solved</span>
              </div>
            )}

            <div className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-gray-400">{totalAttempts} Total Attempts</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {difficultyDetails.map((item) => (
          <div
            key={item.label}
            onMouseEnter={() => {
              setShowBeats(false);
              setActiveDifficulty(item.label);
            }}
            onMouseLeave={() => setActiveDifficulty('')}
            className={`rounded-[18px] border px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-24px_rgba(15,23,42,0.25)] dark:hover:shadow-[0_16px_32px_-24px_rgba(2,6,23,0.75)] ${item.accentClass}`}
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

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
      {message}
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

export default function StudentProfile() {
  const [user, setUser] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [profileForm, setProfileForm] = useState({
    username: '',
    name: '',
    course: '',
    branch: '',
    college: '',
    bio: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activity, setActivity] = useState({});
  const [activityStats, setActivityStats] = useState(null);
  const [stats, setStats] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [problemStatusSummary, setProblemStatusSummary] = useState({
    loaded: false,
    totalProblems: 0,
    solvedCount: 0,
    attemptCount: 0,
    solvedByDifficulty: { easy: 0, medium: 0, hard: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const isMountedRef = useRef(true);
  const lastMetricsRefreshAtRef = useRef(0);
  const metricsRefreshTimerRef = useRef(null);

  const loadActivityData = useCallback(async (showSpinner = false) => {
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
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [statsResult, analysisResult, problemsResult] = await Promise.allSettled([
        api.getStudentStats(),
        api.getStudentAnalysis(true),
        api.listStudentProblems({ page: 1, limit: 100, sortBy: 'updatedAt', sortOrder: 'desc' }),
      ]);

      const data = statsResult.status === 'fulfilled' ? statsResult.value : null;
      const analysisData = analysisResult.status === 'fulfilled' ? analysisResult.value : null;
      const firstProblemsPage = problemsResult.status === 'fulfilled' ? problemsResult.value : null;
      const problemsLoaded = problemsResult.status === 'fulfilled';
      const statsPayload = data?.stats || null;

      let fallbackSolvedCount = 0;
      let fallbackAttemptCount = 0;
      let fallbackSolvedByDifficulty = { easy: 0, medium: 0, hard: 0 };
      let fallbackRecentSolvedProblems = [];
      let fallbackRecentSubmissions = [];

      const shouldUseProblemFallback = problemsLoaded
        && Number(firstProblemsPage?.pagination?.total || 0) > 0
        && Number(statsPayload?.totalQuestionsSolved || statsPayload?.problemsSolved || 0) === 0
        && Number(statsPayload?.totalSubmissions || 0) === 0;

      if (shouldUseProblemFallback) {
        const totalPages = Number(firstProblemsPage?.pagination?.pages || 1);
        let allProblems = Array.isArray(firstProblemsPage?.problems) ? [...firstProblemsPage.problems] : [];

        if (totalPages > 1) {
          const remainingPages = await Promise.allSettled(
            Array.from({ length: totalPages - 1 }, (_, index) => (
              api.listStudentProblems({
                page: index + 2,
                limit: 100,
                sortBy: 'updatedAt',
                sortOrder: 'desc',
              })
            ))
          );

          remainingPages.forEach((pageResult) => {
            if (pageResult.status !== 'fulfilled') return;
            if (Array.isArray(pageResult.value?.problems)) {
              allProblems = allProblems.concat(pageResult.value.problems);
            }
          });
        }

        const solvedProblems = allProblems.filter((problem) => problem?.studentStatus === 'Solved');
        fallbackSolvedCount = solvedProblems.length;
        fallbackSolvedByDifficulty = solvedProblems.reduce((acc, problem) => {
          const key = String(problem?.difficulty || '').toLowerCase();
          if (key === 'easy' || key === 'medium' || key === 'hard') {
            acc[key] += 1;
          }
          return acc;
        }, { easy: 0, medium: 0, hard: 0 });

        fallbackRecentSolvedProblems = solvedProblems
          .map((problem) => ({
            title: problem?.title || 'Untitled Problem',
            difficulty: problem?.difficulty || 'Easy',
            acceptedAt: problem?.updatedAt || problem?.createdAt || null,
          }))
          .sort((a, b) => new Date(b.acceptedAt || 0).getTime() - new Date(a.acceptedAt || 0).getTime())
          .slice(0, 5);

        const submissionTotals = await Promise.allSettled(
          allProblems.map((problem) => (
            api.listStudentProblemSubmissions(problem._id, { page: 1, limit: 3 })
          ))
        );

        fallbackAttemptCount = submissionTotals.reduce((total, submissionResult) => {
          if (submissionResult.status !== 'fulfilled') return total;
          return total + Number(submissionResult.value?.pagination?.total || 0);
        }, 0);

        fallbackRecentSubmissions = submissionTotals
          .flatMap((submissionResult) => {
            if (submissionResult.status !== 'fulfilled') return [];
            return Array.isArray(submissionResult.value?.submissions) ? submissionResult.value.submissions : [];
          })
          .map((submission) => ({
            problemTitle: submission?.problemSnapshot?.title || submission?.problemTitle || 'Untitled Problem',
            difficulty: submission?.problemSnapshot?.difficulty || submission?.difficulty || 'Easy',
            status: submission?.status || 'PENDING',
            language: submission?.language || 'python',
            executionTimeMs: submission?.executionTimeMs || 0,
            createdAt: submission?.createdAt || submission?.updatedAt || null,
            mode: submission?.mode || 'submit',
          }))
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, 8);

        // Build fallback language breakdown from submissions
        const fallbackLanguageMap = {};
        fallbackRecentSubmissions.forEach((sub) => {
          const lang = sub.language || 'unknown';
          fallbackLanguageMap[lang] = (fallbackLanguageMap[lang] || 0) + 1;
        });
        // Also check all problems for broader language coverage
        submissionTotals.forEach((submissionResult) => {
          if (submissionResult.status !== 'fulfilled') return;
          const subs = Array.isArray(submissionResult.value?.submissions) ? submissionResult.value.submissions : [];
          subs.forEach((sub) => {
            const lang = sub?.language || 'unknown';
            fallbackLanguageMap[lang] = (fallbackLanguageMap[lang] || 0) + 1;
          });
        });
        const fallbackLanguagesUsed = Object.entries(fallbackLanguageMap)
          .map(([language, count]) => ({ language, count }))
          .sort((a, b) => b.count - a.count);
        const fallbackMostUsedLanguage = fallbackLanguagesUsed[0]?.language || null;

        // Store these fallbacks for later use
        Object.assign(fallbackRecentSubmissions, { __fallbackLanguagesUsed: fallbackLanguagesUsed, __fallbackMostUsedLanguage: fallbackMostUsedLanguage });
      }

      if (!isMountedRef.current) return;
      const enrichedStats = statsPayload
        ? {
          ...statsPayload,
          recentSolvedProblems: Array.isArray(statsPayload.recentSolvedProblems) && statsPayload.recentSolvedProblems.length > 0
            ? statsPayload.recentSolvedProblems
            : fallbackRecentSolvedProblems,
          recentSubmissions: Array.isArray(statsPayload.recentSubmissions) && statsPayload.recentSubmissions.length > 0
            ? statsPayload.recentSubmissions
            : fallbackRecentSubmissions,
          // Ensure languagesUsed is always populated
          languagesUsed: Array.isArray(statsPayload.languagesUsed) && statsPayload.languagesUsed.length > 0
            ? statsPayload.languagesUsed
            : (fallbackRecentSubmissions?.__fallbackLanguagesUsed || []),
          mostUsedLanguage: statsPayload.mostUsedLanguage
            || (fallbackRecentSubmissions?.__fallbackMostUsedLanguage || null),
        }
        : {
          recentSolvedProblems: fallbackRecentSolvedProblems,
          recentSubmissions: fallbackRecentSubmissions,
          languagesUsed: fallbackRecentSubmissions?.__fallbackLanguagesUsed || [],
          mostUsedLanguage: fallbackRecentSubmissions?.__fallbackMostUsedLanguage || null,
        };

      setStats(enrichedStats);
      setAnalysis(analysisData?.analysis || null);
      setProblemStatusSummary({
        loaded: problemsLoaded,
        totalProblems: Number(firstProblemsPage?.pagination?.total || 0),
        solvedCount: shouldUseProblemFallback
          ? fallbackSolvedCount
          : Number(statsPayload?.totalQuestionsSolved || statsPayload?.problemsSolved || 0),
        attemptCount: shouldUseProblemFallback
          ? fallbackAttemptCount
          : Number(statsPayload?.totalSubmissions || 0),
        solvedByDifficulty: {
          easy: shouldUseProblemFallback
            ? fallbackSolvedByDifficulty.easy
            : Number(statsPayload?.solvedByDifficulty?.easy || 0),
          medium: shouldUseProblemFallback
            ? fallbackSolvedByDifficulty.medium
            : Number(statsPayload?.solvedByDifficulty?.medium || 0),
          hard: shouldUseProblemFallback
            ? fallbackSolvedByDifficulty.hard
            : Number(statsPayload?.solvedByDifficulty?.hard || 0),
        },
      });
    } catch {
      if (!isMountedRef.current) return;
      setStats(null);
      setAnalysis(null);
      setProblemStatusSummary({
        loaded: false,
        totalProblems: 0,
        solvedCount: 0,
        attemptCount: 0,
        solvedByDifficulty: { easy: 0, medium: 0, hard: 0 },
      });
    }
  }, []);

  const refreshMetrics = useCallback(async ({ withActivitySpinner = false } = {}) => {
    await Promise.all([
      loadStats(),
      loadActivityData(withActivitySpinner),
    ]);
  }, [loadActivityData, loadStats]);

  const safeRefreshMetrics = useCallback(({ withActivitySpinner = false, force = false } = {}) => {
    const now = Date.now();
    const cooldownMs = 1500;
    const elapsed = now - lastMetricsRefreshAtRef.current;

    if (force || elapsed >= cooldownMs) {
      lastMetricsRefreshAtRef.current = now;
      if (metricsRefreshTimerRef.current) {
        clearTimeout(metricsRefreshTimerRef.current);
        metricsRefreshTimerRef.current = null;
      }
      void refreshMetrics({ withActivitySpinner });
      return;
    }

    if (metricsRefreshTimerRef.current) return;
    metricsRefreshTimerRef.current = setTimeout(() => {
      metricsRefreshTimerRef.current = null;
      safeRefreshMetrics({ withActivitySpinner, force: true });
    }, Math.max(cooldownMs - elapsed + 50, 50));
  }, [refreshMetrics]);

  useEffect(() => {
    isMountedRef.current = true;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const me = await api.me(true);
        if (!isMountedRef.current) return;
        setUser(me);
        setProfileForm({
          username: me?.username || '',
          name: me?.name || '',
          course: me?.course || '',
          branch: me?.branch || '',
          college: me?.college || '',
          bio: me?.bio || '',
          linkedinUrl: me?.linkedinUrl || '',
          githubUrl: me?.githubUrl || '',
          portfolioUrl: me?.portfolioUrl || '',
        });
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
      if (metricsRefreshTimerRef.current) {
        clearTimeout(metricsRefreshTimerRef.current);
        metricsRefreshTimerRef.current = null;
      }
    };
  }, [refreshMetrics]);

  useEffect(() => {
    if (!user?._id) return undefined;

    socketService.connect();
    const handleLearningUpdate = () => {
      safeRefreshMetrics();
    };
    const handleCompilerUpdate = (submission) => {
      if (String(submission?.userId || '') !== String(user._id)) return;

      // Only refresh once the submission is finalized; avoids spam while queued/running.
      const status = String(submission?.status || '').toUpperCase();
      if (status === 'PENDING' || status === 'RUNNING') return;
      safeRefreshMetrics({ force: true });
    };

    socketService.on('learning-updated', handleLearningUpdate);
    socketService.on('compiler-submission-updated', handleCompilerUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
      socketService.off('compiler-submission-updated', handleCompilerUpdate);
    };
  }, [safeRefreshMetrics, user?._id]);

  useEffect(() => {
    if (!user?._id) return undefined;

    const handleFocus = () => safeRefreshMetrics();
    const handleVisibilityChange = () => {
      if (!document.hidden) safeRefreshMetrics();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [safeRefreshMetrics, user?._id]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);

    const timer = setTimeout(() => {
      safeRefreshMetrics();
    }, Math.max(nextMidnight.getTime() - now.getTime(), 0));

    return () => clearTimeout(timer);
  }, [activityStats?.currentStreak, safeRefreshMetrics, stats?.totalSubmissions]);

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

  const openEditModal = () => {
    setError('');
    setSuccess('');
    setProfileForm({
      username: user?.username || '',
      name: user?.name || '',
      course: user?.course || '',
      branch: user?.branch || '',
      college: user?.college || '',
      bio: user?.bio || '',
      linkedinUrl: user?.linkedinUrl || '',
      githubUrl: user?.githubUrl || '',
      portfolioUrl: user?.portfolioUrl || '',
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    if (savingProfile) return;
    setShowEditModal(false);
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
      const me = await api.me(true);
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

  const handleUpdateProfile = async () => {
    setSavingProfile(true);
    setError('');
    setSuccess('');
    try {
      const normalizeUrlForSave = (value) => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return '';
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) return raw;
        if (raw.startsWith('//')) return `https:${raw}`;
        return `https://${raw}`;
      };

      const response = await api.updateMyProfile({
        username: profileForm.username,
        bio: profileForm.bio,
        linkedinUrl: normalizeUrlForSave(profileForm.linkedinUrl),
        githubUrl: normalizeUrlForSave(profileForm.githubUrl),
        portfolioUrl: normalizeUrlForSave(profileForm.portfolioUrl),
      });
      const updatedUser = response?.user || response;
      if (!isMountedRef.current) return;
      setUser((prev) => ({
        ...(prev || {}),
        ...updatedUser,
      }));
      setProfileForm({
        username: updatedUser?.username || '',
        name: updatedUser?.name || '',
        course: updatedUser?.course || '',
        branch: updatedUser?.branch || '',
        college: updatedUser?.college || '',
        bio: updatedUser?.bio || '',
        linkedinUrl: updatedUser?.linkedinUrl || '',
        githubUrl: updatedUser?.githubUrl || '',
        portfolioUrl: updatedUser?.portfolioUrl || '',
      });
      setSuccess('Profile details updated successfully.');
      setTimeout(() => {
        if (isMountedRef.current) {
          setShowEditModal(false);
          setSuccess('');
        }
      }, 900);
    } catch (updateError) {
      if (!isMountedRef.current) return;
      setError(updateError.message || 'Failed to update profile.');
    } finally {
      if (isMountedRef.current) {
        setSavingProfile(false);
      }
    }
  };

  const handle = useMemo(() => {
    const base = user?.username || user?.email?.split('@')[0] || user?.studentId || user?.name || 'student';
    const normalized = String(base)
      .trim()
      .replace(/^@+/, '')
      .replace(/\s+/g, '')
      .toLowerCase();
    return `@${normalized}`;
  }, [user?.email, user?.name, user?.studentId, user?.username]);

  const analysisOverview = analysis?.overview || {};
  const analysisAssessments = analysis?.assessments || {};
  const analysisInterviews = analysis?.interviews || {};
  const analysisLearning = analysis?.learning || {};

  const performanceTitle = useMemo(() => {
    const solved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedCount || 0)
      : Number(stats?.totalQuestionsSolved || 0);
    const streak = Number(activityStats?.currentStreak || 0);
    const assessmentScore = Number(analysisAssessments?.avgScore || 0);
    const interviewScore = Number(analysisInterviews?.avgScore || 0);
    return getLearnerBadge({
      solvedCount: solved,
      streak,
      assessmentScore,
      interviewScore,
    });
  }, [
    activityStats?.currentStreak,
    analysisAssessments?.avgScore,
    analysisInterviews?.avgScore,
    problemStatusSummary.loaded,
    problemStatusSummary.solvedCount,
    stats?.totalQuestionsSolved,
  ]);

  const shortBio = useMemo(() => {
    if (user?.bio?.trim()) {
      return user.bio.trim();
    }
    const language = stats?.mostUsedLanguage ? `${stats.mostUsedLanguage} first` : 'consistent practice';
    const streak = activityStats?.currentStreak || 0;
    return `Focused on data structures, problem solving, and ${language}. Currently building a ${streak}-day momentum streak on PeerPrep.`;
  }, [activityStats?.currentStreak, stats?.mostUsedLanguage, user?.bio]);

  const insightCards = useMemo(() => {
    const languagesUsed = stats?.languagesUsed?.length || 0;
    // Build a dynamic helper for the language card
    const languageHelper = (() => {
      if (stats?.mostUsedLanguage) {
        return `${stats.mostUsedLanguage} leads`;
      }
      // Try to infer from recent submissions
      if (stats?.recentSubmissions?.length > 0) {
        const langMap = {};
        stats.recentSubmissions.forEach((sub) => {
          const lang = sub?.language;
          if (lang) langMap[lang] = (langMap[lang] || 0) + 1;
        });
        const sorted = Object.entries(langMap).sort(([, a], [, b]) => b - a);
        if (sorted.length > 0) return `${sorted[0][0]} leads`;
      }
      return 'Start solving to track';
    })();
    // Also dynamically compute language count from submissions if not in stats
    const effectiveLanguageCount = languagesUsed > 0
      ? languagesUsed
      : (() => {
        if (!stats?.recentSubmissions?.length) return 0;
        const uniqueLangs = new Set(stats.recentSubmissions.map((s) => s?.language).filter(Boolean));
        return uniqueLangs.size;
      })();
    return [
      {
        label: 'Assessment Average',
        value: analysisAssessments?.avgScore || 0,
        helper: 'Current test baseline',
        icon: <ClipboardList className="h-4 w-4" />,
        suffix: '%',
        decimals: 1,
      },
      {
        label: 'Interview Score',
        value: analysisInterviews?.avgScore || 0,
        helper: 'Feedback average',
        icon: <MessageSquare className="h-4 w-4" />,
        suffix: '%',
        decimals: 0,
      },
      {
        label: 'Languages Used',
        value: effectiveLanguageCount,
        helper: languageHelper,
        icon: <Code2 className="h-4 w-4" />,
      },
      {
        label: 'Upcoming Interviews',
        value: analysisInterviews?.pending || 0,
        helper: 'Scheduled or pending',
        icon: <Clock3 className="h-4 w-4" />,
      },
    ];
  }, [analysisAssessments?.avgScore, analysisInterviews?.avgScore, analysisInterviews?.pending, stats?.languagesUsed?.length, stats?.mostUsedLanguage, stats?.recentSubmissions]);

  const codingTotals = useMemo(() => {
    const easySolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedByDifficulty?.easy || 0)
      : Number(stats?.solvedByDifficulty?.easy || 0);
    const mediumSolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedByDifficulty?.medium || 0)
      : Number(stats?.solvedByDifficulty?.medium || 0);
    const hardSolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedByDifficulty?.hard || 0)
      : Number(stats?.solvedByDifficulty?.hard || 0);

    const totalSolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedCount || 0)
      : Math.max(
        Number(stats?.totalQuestionsSolved || stats?.problemsSolved || 0),
        Number(analysis?.problems?.solved || 0),
      );

    const totalProblems = problemStatusSummary.loaded
      ? Math.max(Number(problemStatusSummary.totalProblems || 0), totalSolved, 1)
      : Math.max(Number(totalSolved || 0), 1);
    const totalAttempts = problemStatusSummary.loaded
      ? Math.max(Number(problemStatusSummary.attemptCount || 0), totalSolved, 0)
      : Math.max(
        Number(stats?.totalSubmissions || 0),
        Number(analysis?.problems?.attempts || 0),
        totalSolved,
        0,
      );
    return {
      totalSolved,
      totalProblems,
      totalAttempts,
      easySolved,
      mediumSolved,
      hardSolved,
    };
  }, [
    analysis?.problems?.attempts,
    analysis?.problems?.solved,
    problemStatusSummary.totalProblems,
    problemStatusSummary.loaded,
    problemStatusSummary.attemptCount,
    problemStatusSummary.solvedByDifficulty?.easy,
    problemStatusSummary.solvedByDifficulty?.medium,
    problemStatusSummary.solvedByDifficulty?.hard,
    problemStatusSummary.solvedCount,
    stats?.solvedByDifficulty?.easy,
    stats?.solvedByDifficulty?.hard,
    stats?.solvedByDifficulty?.medium,
    stats?.totalSubmissions,
    stats?.totalQuestionsSolved,
    stats?.problemsSolved,
  ]);

  const socialLinks = useMemo(() => ([
    { label: 'LinkedIn', href: user?.linkedinUrl || '', icon: <Linkedin className="h-4 w-4" /> },
    { label: 'GitHub', href: user?.githubUrl || '', icon: <Github className="h-4 w-4" /> },
    { label: 'Portfolio', href: user?.portfolioUrl || '', icon: <Globe className="h-4 w-4" /> },
  ]), [user?.githubUrl, user?.linkedinUrl, user?.portfolioUrl]);

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-[#f6f8fb] pt-16 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="h-[520px] animate-pulse rounded-[32px] bg-slate-200 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f6f8fb] pt-16 dark:bg-slate-950">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Panel title="Profile Unavailable" subtitle={error || 'We could not load your profile right now.'}>
            <EmptyState message="Please refresh the page and try again." />
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f4f7fb_52%,#f8fafc_100%)] pt-16 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_52%,#020617_100%)]">
      <MotionDiv
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6"
      >
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-[88px] xl:self-start">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.28)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_22px_60px_-42px_rgba(2,6,23,0.8)]">
              <div className="h-24 bg-[linear-gradient(135deg,#0f172a_0%,#12323d_38%,#0f766e_100%)]" />
              <div className="px-5 pb-5">
                <div className="-mt-12 flex items-end justify-between gap-3">
                  <div className="relative">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-[0_18px_36px_-20px_rgba(15,23,42,0.35)] dark:border-gray-900"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-[linear-gradient(135deg,#0f172a_0%,#334155_100%)] text-3xl font-bold text-white shadow-[0_18px_36px_-20px_rgba(15,23,42,0.35)] dark:border-gray-900">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={openPhotoModal}
                      className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_10px_22px_-14px_rgba(15,23,42,0.28)] transition-colors hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      aria-label="Edit profile photo"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                      {performanceTitle.title}
                    </span>
                    <p className="mt-2 max-w-[180px] text-xs leading-5 text-slate-500 dark:text-gray-400">{performanceTitle.helper}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <h1 className="text-xl font-bold text-slate-950 dark:text-gray-100">{user.name || 'Student'}</h1>
                  <p className="mt-1 text-sm font-medium text-slate-500 dark:text-gray-400">{handle}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-gray-300">{shortBio}</p>
                </div>

                <button
                  type="button"
                  onClick={openEditModal}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
                >
                  Edit Profile
                </button>

                <div className="mt-5 flex items-center gap-2">
                  {socialLinks.map((item) => (
                    <SocialButton key={item.label} {...item} />
                  ))}
                </div>

                <div className="mt-5 grid gap-3">
                  <MiniProfileRow icon={<GraduationCap className="h-4 w-4" />} label="College" value={user.college} />
                  <MiniProfileRow icon={<BookOpen className="h-4 w-4" />} label="Course" value={user.course} />
                  <MiniProfileRow icon={<GitBranch className="h-4 w-4" />} label="Branch" value={user.branch} />
                  <MiniProfileRow icon={<UserRound className="h-4 w-4" />} label="Student ID" value={user.studentId} />
                  <MiniProfileRow icon={<MapPin className="h-4 w-4" />} label="Semester" value={user.semester ? `Semester ${user.semester}` : ''} />
                  <MiniProfileRow icon={<Mail className="h-4 w-4" />} label="Email" value={user.email} />
                </div>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <Panel
                title="Coding Progress"
                subtitle="A compact PeerPrep coding snapshot with live solved totals and difficulty breakdown."
              >
                <LeetCodeProgressCard {...codingTotals} />
              </Panel>

              <Panel
                title="PeerPrep Progress"
                subtitle="Real product activity across assessments, interviews, learning, and platform consistency."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfessionalTrackCard
                    label="Assessment Reports"
                    value={analysisOverview?.avgScore ? `${Math.round(analysisAssessments?.avgScore || 0)}%` : (analysisAssessments?.attempts || 0)}
                    helper={analysisAssessments?.attempts ? `${analysisAssessments.attempts} submitted attempts` : 'No assessment activity yet'}
                    icon={<ClipboardList className="h-4 w-4" />}
                    tone="amber"
                  />
                  <ProfessionalTrackCard
                    label="Interview Feedback"
                    value={Math.round(analysisInterviews?.avgScore || 0)}
                    helper={analysisInterviews?.total ? `${analysisInterviews.total} completed sessions` : 'No interview feedback yet'}
                    icon={<MessageSquare className="h-4 w-4" />}
                    tone="sky"
                  />
                  <ProfessionalTrackCard
                    label="Learning Modules"
                    value={`${Math.round(analysisLearning?.completionPercent || 0)}%`}
                    helper={`${analysisLearning?.completedTopics || 0} topics completed`}
                    icon={<BookOpen className="h-4 w-4" />}
                    tone="emerald"
                  />
                  <ProfessionalTrackCard
                    label="Active Momentum"
                    value={`${activityStats?.currentStreak || 0}d`}
                    helper={`${activityStats?.totalActiveDays || 0} tracked active days`}
                    icon={<Flame className="h-4 w-4" />}
                    tone="rose"
                  />
                </div>
              </Panel>
            </section>

            <Panel
              title="Activity Heatmap"
              subtitle="Year-round coding rhythm inspired by competitive coding dashboards, tuned to the PeerPrep product style."
            >
              {loadingActivity ? (
                <div className="py-12 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent dark:border-gray-200 dark:border-t-transparent" />
                  <p className="mt-4 text-sm text-slate-500 dark:text-gray-400">Loading activity...</p>
                </div>
              ) : (
                <ContributionCalendar
                  title=""
                  activity={activity}
                  stats={activityStats}
                  tooltipFormatter={({ value, formattedDate }) => `${value} tracked activities on ${formattedDate}`}
                  legendLabels={{
                    none: 'No submissions',
                    low: '1-2 submissions',
                    medium: '3-4 submissions',
                    high: '5-7 submissions',
                    highest: '8+ submissions',
                  }}
                />
              )}
            </Panel>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {insightCards.map((item) => (
                <InsightCard key={item.label} {...item} />
              ))}
            </section>

            {/* Language Proficiency Breakdown */}
            {(() => {
              const langs = Array.isArray(stats?.languagesUsed) && stats.languagesUsed.length > 0
                ? stats.languagesUsed
                : (() => {
                  if (!stats?.recentSubmissions?.length) return [];
                  const langMap = {};
                  stats.recentSubmissions.forEach((sub) => {
                    const lang = sub?.language;
                    if (lang) langMap[lang] = (langMap[lang] || 0) + 1;
                  });
                  return Object.entries(langMap)
                    .map(([language, count]) => ({ language, count }))
                    .sort((a, b) => b.count - a.count);
                })();
              const maxCount = Math.max(1, ...langs.map((l) => l.count));
              const langColors = {
                python: { bg: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800' },
                javascript: { bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
                java: { bg: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
                cpp: { bg: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800' },
                c: { bg: 'bg-slate-500', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700' },
              };
              const defaultColor = { bg: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' };
              if (langs.length === 0) return null;
              return (
                <Panel title="Language Proficiency" subtitle="Programming languages used across all submissions, ranked by usage.">
                  <div className="space-y-3">
                    {langs.map((item) => {
                      const color = langColors[item.language?.toLowerCase()] || defaultColor;
                      const percent = Math.round((item.count / maxCount) * 100);
                      const displayName = item.language
                        ? item.language.charAt(0).toUpperCase() + item.language.slice(1)
                        : 'Unknown';
                      return (
                        <div key={item.language} className={`rounded-[18px] border ${color.border} bg-slate-50/80 px-4 py-3 transition-colors hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`h-3 w-3 shrink-0 rounded-full ${color.bg}`} />
                              <span className={`text-sm font-semibold ${color.text}`}>{displayName}</span>
                            </div>
                            <span className="text-xs font-medium text-slate-500 dark:text-gray-400">
                              {item.count} submission{item.count === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700">
                            <div
                              className={`h-full rounded-full ${color.bg} transition-all duration-500`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              );
            })()}

            <section className="grid gap-6 xl:grid-cols-2">
              <Panel title="Recent Solved Questions" subtitle="Latest accepted milestones.">
                {(stats?.recentSolvedProblems || []).length === 0 ? (
                  <EmptyState message="Solve a problem to start building your accepted history." />
                ) : (
                <div className="space-y-3">
                  {stats.recentSolvedProblems.map((problem, index) => (
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
                {(stats?.recentSubmissions || []).length === 0 ? (
                  <EmptyState message="Your recent submissions will appear here once you start solving problems." />
                ) : (
                  <div className="space-y-3">
                    {stats.recentSubmissions.map((submission, index) => (
                      <div key={`${submission.problemTitle}-${submission.createdAt}-${index}`} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 transition-colors hover:bg-white dark:border-gray-800 dark:bg-gray-800/80 dark:hover:bg-gray-800">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{submission.problemTitle}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {(submission.mode === 'run' ? 'Run' : 'Submit')} | {submission.language} | {formatDuration(submission.executionTimeMs)} | {formatDateTime(submission.createdAt)}
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
              </Panel>
            </section>
          </main>
        </div>
      </MotionDiv>

      <AnimatePresence>
        {showEditModal && (
          <>
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeEditModal}
              className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm"
            />
            <MotionDiv
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between bg-[linear-gradient(135deg,#0f172a_0%,#12323d_42%,#0f766e_100%)] px-6 py-4 text-white">
                  <div>
                    <h2 className="text-lg font-semibold">Edit Student Profile</h2>
                    <p className="mt-1 text-sm text-white/75">Keep your PeerPrep identity, bio, and social links updated across student and admin views.</p>
                  </div>
                  <button type="button" onClick={closeEditModal} className="rounded-xl p-2 hover:bg-white/15">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-5 bg-slate-50/70 p-6 dark:bg-gray-900/80">
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <ProfileField
                      label="Username"
                      value={profileForm.username}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                      placeholder="your-handle"
                    />
                    <ProfileField label="Full Name" value={profileForm.name} placeholder="Your full name" disabled />
                    <ProfileField label="College" value={profileForm.college} placeholder="Your college or university" disabled />
                    <ProfileField label="Course" value={profileForm.course} placeholder="B.Tech, MCA, etc." disabled />
                    <ProfileField label="Branch" value={profileForm.branch} placeholder="CSE, IT, AIML..." disabled />
                  </div>

                  <ProfileField
                    label="Bio"
                    multiline
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
                    placeholder="Short professional summary, coding focus, or career goal"
                  />

                  <div className="grid gap-4 md:grid-cols-3">
                    <ProfileField label="LinkedIn URL" type="url" value={profileForm.linkedinUrl} onChange={(e) => setProfileForm((prev) => ({ ...prev, linkedinUrl: e.target.value }))} placeholder="https://linkedin.com/in/..." />
                    <ProfileField label="GitHub URL" type="url" value={profileForm.githubUrl} onChange={(e) => setProfileForm((prev) => ({ ...prev, githubUrl: e.target.value }))} placeholder="https://github.com/..." />
                    <ProfileField label="Portfolio URL" type="url" value={profileForm.portfolioUrl} onChange={(e) => setProfileForm((prev) => ({ ...prev, portfolioUrl: e.target.value }))} placeholder="https://yourportfolio.com" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
                  <button type="button" onClick={closeEditModal} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateProfile}
                    disabled={savingProfile}
                    className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </MotionDiv>
          </>
        )}

        {showPhotoModal && (
          <>
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePhotoModal}
              className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm"
            />
            <MotionDiv
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between bg-[linear-gradient(135deg,#0f172a_0%,#334155_100%)] px-6 py-4 text-white">
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
                      <img src={avatarPreview} alt="Preview" className="h-32 w-32 rounded-full border-4 border-slate-200 object-cover shadow-lg dark:border-gray-700" />
                    ) : user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-32 w-32 rounded-full border-4 border-slate-200 object-cover shadow-lg dark:border-gray-700" />
                    ) : (
                      <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#334155_100%)] text-4xl font-bold text-white shadow-lg dark:border-gray-700">
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

                <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
                  <button type="button" onClick={closePhotoModal} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
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
            </MotionDiv>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
