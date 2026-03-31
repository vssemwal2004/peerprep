import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBook, FiCamera, FiGitBranch, FiHash, FiMail, FiMapPin, FiUserCheck, FiX } from 'react-icons/fi';
import ContributionCalendar from '../components/ContributionCalendar';
import { api } from '../utils/api';
import socketService from '../utils/socket';

function formatDateTime(value) {
  if (!value) return 'Just now';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(value) {
  return `${Number(value || 0).toFixed(2)} ms`;
}

function difficultyClasses(difficulty) {
  if (difficulty === 'Hard') return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
  if (difficulty === 'Medium') return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
  return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
}

function statusClasses(status) {
  if (status === 'AC') return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
  if (status === 'WA') return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
  return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800';
}

function Panel({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title ? <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3> : null}
          {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{subtitle}</p> : null}
        </div>
      )}
      {children}
    </div>
  );
}

function StatCard({ label, value, helper, accent, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-gray-500">{helper}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>{icon}</div>
      </div>
    </div>
  );
}

function InfoTile({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-4 dark:border-gray-700 dark:bg-gray-800/80">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">{label}</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-white">{value || 'Not provided'}</p>
        </div>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, max, tone }) {
  const width = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-gray-200">{label}</span>
        <span className="text-slate-500 dark:text-gray-400">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-gray-700">
        <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${Math.max(width, value ? 8 : 0)}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">{message}</div>;
}

export default function StudentProfile() {
  const [user, setUser] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activity, setActivity] = useState({});
  const [activityStats, setActivityStats] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setUser(await api.me());
      } catch (e) {
        setError(e.message || 'Failed to load profile');
      }
    })();
  }, []);

  const loadActivityData = async () => {
    setLoadingActivity(true);
    try {
      const data = await api.getStudentActivity();
      setActivity(data.activityByDate || {});
      setActivityStats(data.stats || null);
    } catch (e) {
      setActivity({});
    } finally {
      setLoadingActivity(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await api.getStudentStats();
      setStats(data.stats || null);
    } catch (e) {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadActivityData();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const timeout = setTimeout(() => {
      loadActivityData();
      loadStats();
    }, tomorrow - now);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (user) loadStats();
  }, [user]);

  useEffect(() => {
    socketService.connect();
    const handleLearningUpdate = () => {
      loadActivityData();
      loadStats();
    };
    socketService.on('learning-updated', handleLearningUpdate);
    return () => socketService.off('learning-updated', handleLearningUpdate);
  }, []);

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0] || null;
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
      setError('Please select a photo first');
      return;
    }
    try {
      await api.updateMyAvatar(avatarFile);
      const me = await api.me();
      setUser(me);
      if (me && me.avatarUrl !== undefined) localStorage.setItem('studentAvatarUrl', me.avatarUrl || '');
      setSuccess('Profile photo updated successfully!');
      setTimeout(() => closePhotoModal(), 1500);
    } catch (e) {
      setError(e.message || 'Failed to update photo');
    }
  };

  const highlights = useMemo(() => ([
    { label: 'Questions Solved', value: stats?.totalQuestionsSolved || stats?.problemsSolved || 0, helper: 'Accepted coding problems', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800' },
    { label: 'Acceptance Rate', value: `${stats?.acceptanceRate || 0}%`, helper: 'Accepted submissions ratio', tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' },
    { label: 'Current Streak', value: `${activityStats?.currentStreak || 0} days`, helper: 'Recent consistency', tone: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800' },
    { label: 'Best Streak', value: `${activityStats?.bestStreak || 0} days`, helper: 'Longest active run', tone: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800' },
  ]), [activityStats, stats]);

  const codingMetrics = useMemo(() => ([
    { label: 'Questions Attempted', value: stats?.totalQuestionsAttempted || 0, helper: 'Unique problems tried', accent: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300', icon: <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11 2v20c-5.05-.5-9-4.76-9-10s3.95-9.5 9-10zm2 0c5.05.5 9 4.76 9 10s-3.95 9.5-9 10V2z" /></svg> },
    { label: 'Total Submissions', value: stats?.totalSubmissions || 0, helper: 'All coding attempts', accent: 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300', icon: <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14l4-4h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" /></svg> },
    { label: 'Accepted Submissions', value: stats?.acceptedSubmissions || 0, helper: 'Green verdict count', accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300', icon: <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg> },
    { label: 'Question Success Rate', value: `${stats?.questionSuccessRate || 0}%`, helper: 'Solved vs attempted', accent: 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-300', icon: <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M13 2.05v2.02c4.39.54 7.5 4.53 6.96 8.92-.45 3.66-3.3 6.51-6.96 6.96v2.02c5.5-.55 9.5-5.44 8.95-10.95z" /></svg> },
  ]), [stats]);

  if (!user) {
    return <div className="min-h-screen bg-white pt-16 dark:bg-gray-900"><div className="px-4 py-8 sm:px-6"><div className="h-72 animate-pulse rounded-3xl bg-slate-100 dark:bg-gray-800" /></div></div>;
  }

  const solvedMax = Math.max(stats?.solvedByDifficulty?.easy || 0, stats?.solvedByDifficulty?.medium || 0, stats?.solvedByDifficulty?.hard || 0, 1);
  const videoTotal = activityStats?.totalVideosTotal || Math.max(stats?.totalVideosWatched || 0, 1);

  return (
    <div className="min-h-screen bg-white pt-16 dark:bg-gray-900">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="w-full space-y-6 px-4 py-8 sm:px-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-sky-100 via-white to-emerald-50 px-6 pb-24 pt-8 dark:border-gray-700 dark:from-sky-900/20 dark:via-gray-800 dark:to-emerald-900/10">
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-500/10" />
            <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-500/10" />
            <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end gap-5">
                  <div className="relative">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-28 w-28 rounded-3xl border-4 border-white object-cover shadow-xl dark:border-gray-800" />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-3xl border-4 border-white bg-gradient-to-br from-sky-500 to-indigo-600 text-4xl font-bold text-white shadow-xl dark:border-gray-800">{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</div>
                    )}
                    <button type="button" onClick={openPhotoModal} className="absolute -bottom-1 -right-1 rounded-2xl border-2 border-white bg-white p-2.5 text-sky-600 shadow-lg transition-colors hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-800 dark:text-sky-300 dark:hover:bg-gray-700" title="Edit Photo">
                      <FiCamera className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{user.name || 'Student Name'}</h1>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 backdrop-blur-sm dark:bg-gray-800/80"><FiHash className="h-3.5 w-3.5" />{user.studentId || 'Student ID'}</span>
                        <span className="rounded-full bg-white/80 px-3 py-1.5 backdrop-blur-sm dark:bg-gray-800/80">Semester {user.semester || '-'}</span>
                        <span className="rounded-full bg-white/80 px-3 py-1.5 backdrop-blur-sm dark:bg-gray-800/80">{stats?.mostUsedLanguage ? `${stats.mostUsedLanguage} primary` : 'No coding language yet'}</span>
                      </div>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-gray-300">A polished overview of your coding progress, learning consistency, and recent activity across PeerPrep.</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <InfoTile icon={<FiMail className="h-5 w-5" />} label="Email" value={user.email} />
                  <InfoTile icon={<FiBook className="h-5 w-5" />} label="Course" value={user.course} />
                  <InfoTile icon={<FiGitBranch className="h-5 w-5" />} label="Branch" value={user.branch} />
                  <InfoTile icon={<FiMapPin className="h-5 w-5" />} label="College" value={user.college} />
                  <InfoTile icon={<FiUserCheck className="h-5 w-5" />} label="Coordinator" value={user.teacherId || 'Not Assigned'} />
                  <InfoTile icon={<FiBook className="h-5 w-5" />} label="Semester" value={user.semester ? `Semester ${user.semester}` : 'Not provided'} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {highlights.map((item) => (
                  <div key={item.label} className={`rounded-2xl border p-4 ${item.tone}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">{item.label}</p>
                    <p className="mt-2 text-2xl font-bold">{item.value}</p>
                    <p className="mt-1 text-xs opacity-80">{item.helper}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {codingMetrics.map((item) => <StatCard key={item.label} {...item} />)}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Courses Enrolled" value={stats?.totalCoursesEnrolled || 0} helper="Assigned learning tracks" accent="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300" icon={<FiBook className="h-5 w-5" />} />
          <StatCard label="Videos Watched" value={stats?.totalVideosWatched || 0} helper="Completed learning videos" accent="bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-300" icon={<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" /></svg>} />
          <StatCard label="Watch Time" value={`${stats?.totalWatchTimeHours || 0} hrs`} helper="Learning time invested" accent="bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300" icon={<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1a11 11 0 1011 11A11 11 0 0012 1zm1 11.59l3.3 3.3-1.42 1.41L11 13V6h2z" /></svg>} />
          <StatCard label="Active Days" value={activityStats?.totalActiveDays || 0} helper="Days with tracked activity" accent="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300" icon={<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v13a3 3 0 003 3h12a3 3 0 003-3V6a2 2 0 00-2-2z" /></svg>} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <Panel title="Practice Calendar" subtitle="Your year-round activity pattern across learning and compiler work.">
            {loadingActivity ? <div className="py-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" /><p className="mt-4 text-sm text-slate-500 dark:text-gray-400">Loading activity...</p></div> : <ContributionCalendar activity={activity} title="Practice Calendar" tooltipFormatter={({ value, formattedDate }) => `${value} activities on ${formattedDate}`} />}
          </Panel>
          <Panel title="Activity Insights" subtitle="Consistency, learning momentum, and problem-solving rhythm.">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Current Streak</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{activityStats?.currentStreak || 0}</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">days in a row</p></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Best Streak</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{activityStats?.bestStreak || 0}</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">best ever</p></div>
              </div>
              <div className="space-y-4">
                <ProgressRow label="Solved by attempted questions" value={stats?.totalQuestionsSolved || 0} max={Math.max(stats?.totalQuestionsAttempted || 0, 1)} tone="bg-gradient-to-r from-emerald-500 to-lime-400" />
                <ProgressRow label="Active days this year" value={activityStats?.totalActiveDays || 0} max={activityStats?.totalDaysInRange || 365} tone="bg-gradient-to-r from-sky-500 to-cyan-400" />
                <ProgressRow label="Video completion progress" value={stats?.totalVideosWatched || 0} max={videoTotal} tone="bg-gradient-to-r from-pink-500 to-rose-400" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/60"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Most Used Language</p><p className="mt-2 text-xl font-bold capitalize text-slate-900 dark:text-white">{stats?.mostUsedLanguage || 'N/A'}</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Based on your coding submissions.</p></div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Panel title="Solved by Difficulty" subtitle="How your accepted problems are distributed.">
            <div className="space-y-4">
              <ProgressRow label="Easy" value={stats?.solvedByDifficulty?.easy || 0} max={solvedMax} tone="bg-emerald-500" />
              <ProgressRow label="Medium" value={stats?.solvedByDifficulty?.medium || 0} max={solvedMax} tone="bg-amber-500" />
              <ProgressRow label="Hard" value={stats?.solvedByDifficulty?.hard || 0} max={solvedMax} tone="bg-rose-500" />
            </div>
          </Panel>
          <Panel title="Verdict Overview" subtitle="Submission quality across your coding activity.">
            <div className="space-y-3">
              {[
                { label: 'Accepted', key: 'AC' },
                { label: 'Wrong Answer', key: 'WA' },
                { label: 'Time Limit Exceeded', key: 'TLE' },
                { label: 'Runtime / Compile', key: 'RE' },
              ].map((item) => {
                const value = item.key === 'RE' ? (stats?.statusBreakdown?.RE || 0) + (stats?.statusBreakdown?.CE || 0) : (stats?.statusBreakdown?.[item.key] || 0);
                return (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
                    <span className="text-sm text-slate-700 dark:text-gray-200">{item.label}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="Languages Used" subtitle="Your coding stack inside the compiler.">
            {(stats?.languagesUsed || []).length === 0 ? (
              <EmptyState message="No compiler activity yet." />
            ) : (
              <div className="space-y-3">
                {stats.languagesUsed.slice(0, 5).map((item) => (
                  <div key={item.language} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
                    <span className="text-sm capitalize text-slate-700 dark:text-gray-200">{item.language}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Recent Solved Questions" subtitle="Your latest accepted coding wins.">
            {(stats?.recentSolvedProblems || []).length === 0 ? (
              <EmptyState message="Solve a problem to start building your accepted history." />
            ) : (
              <div className="space-y-3">
                {stats.recentSolvedProblems.map((problem, index) => (
                  <div key={`${problem.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">{problem.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Solved on {formatDateTime(problem.acceptedAt)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${difficultyClasses(problem.difficulty)}`}>{problem.difficulty}</span>
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
                  <div key={`${submission.problemTitle}-${submission.createdAt}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">{submission.problemTitle}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{submission.language} | {formatDuration(submission.executionTimeMs)} | {formatDateTime(submission.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${difficultyClasses(submission.difficulty)}`}>{submission.difficulty}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses(submission.status)}`}>{submission.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </motion.div>

      <AnimatePresence>
        {showPhotoModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closePhotoModal} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: 'spring', duration: 0.5 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
                <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-white"><FiCamera className="h-5 w-5" />Edit Photo</h2>
                  <button type="button" onClick={closePhotoModal} className="rounded-lg p-2 text-white transition-colors hover:bg-white/20"><FiX className="h-6 w-6" /></button>
                </div>
                <div className="p-6">
                  {error ? <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">{error}</motion.div> : null}
                  {success ? <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">{success}</motion.div> : null}
                  <div className="flex flex-col items-center">
                    <div className="relative mb-4">
                      {avatarPreview ? <img src={avatarPreview} alt="Preview" className="h-32 w-32 rounded-full border-4 border-blue-500 object-cover shadow-lg" /> : user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="h-32 w-32 rounded-full border-4 border-slate-200 object-cover shadow-lg dark:border-gray-600" /> : <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-slate-200 bg-gradient-to-br from-blue-500 to-indigo-600 text-4xl font-bold text-white shadow-lg dark:border-gray-600">{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</div>}
                      <label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-blue-600 p-3 text-white shadow-lg transition-colors hover:bg-blue-700"><FiCamera className="h-5 w-5" /><input type="file" accept="image/*" onChange={onAvatarChange} className="hidden" /></label>
                    </div>
                    <p className="mb-2 text-center text-sm text-slate-600 dark:text-gray-300">{avatarFile ? avatarFile.name : 'Click the camera icon to select a new photo'}</p>
                    <p className="text-center text-xs text-slate-500 dark:text-gray-400">Recommended: Square image, at least 256x256px</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
                  <button type="button" onClick={closePhotoModal} className="rounded-lg border border-slate-300 px-6 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
                  <button type="button" onClick={handleUpdatePhoto} disabled={!avatarFile} className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 font-medium text-white shadow-md transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">Update Photo</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
