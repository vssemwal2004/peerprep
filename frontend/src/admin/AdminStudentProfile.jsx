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
  GraduationCap,
  LineChart,
  Mail,
  MapPin,
  PlayCircle,
  UserCircle2,
} from 'lucide-react';
import ContributionCalendar from '../components/ContributionCalendar';
import { useToast } from '../components/CustomToast';
import { api } from '../utils/api';
import { DifficultyBadge, EmptyState, LoadingPanel, SectionCard, StatCard, SubmissionStatusBadge } from './compiler/CompilerUi';
import { formatDate, formatDateTime, formatDuration, formatPercent } from './compiler/compilerUtils';

function SubmissionTrendChart({ data = [] }) {
  const safeData = data.length ? data : [{ date: new Date().toISOString().slice(0, 10), count: 0, accepted: 0 }];
  const max = Math.max(...safeData.map((item) => item.count || 0), 1);
  const points = safeData.map((item, index) => {
    const x = safeData.length === 1 ? 0 : (index / (safeData.length - 1)) * 100;
    const y = 100 - ((item.count || 0) / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 100 100" className="h-60 w-full overflow-visible rounded-2xl bg-slate-50 p-4 dark:bg-gray-800">
        <polyline fill="none" stroke="url(#studentSubmissionTrend)" strokeWidth="2.5" points={points} vectorEffect="non-scaling-stroke" />
        <defs>
          <linearGradient id="studentSubmissionTrend" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="grid grid-cols-5 gap-2 text-[11px] text-slate-500 dark:text-gray-400">
        {safeData.slice(-5).map((item) => (
          <span key={item.date}>{item.date.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}

function VerdictMix({ items = [] }) {
  if (!items.length) {
    return <EmptyState title="No compiler submissions yet" description="Verdict analytics will appear once this student starts solving problems." />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.status} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <SubmissionStatusBadge status={item.status} />
            <span className="text-sm text-slate-700 dark:text-gray-200">{item.label}</span>
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminStudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
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

      if (!isMounted) {
        return;
      }

      if (studentResult.status === 'fulfilled') {
        setStudent(studentResult.value.student || null);
      } else {
        setError(studentResult.reason?.message || 'Failed to load student profile.');
      }

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.stats || null);
      }

      if (activityResult.status === 'fulfilled') {
        setActivity(activityResult.value.activityByDate || {});
        setActivityStats(activityResult.value.stats || null);
      }

      if (videosResult.status === 'fulfilled') {
        setVideos(videosResult.value.videos || []);
      }

      if (coursesResult.status === 'fulfilled') {
        setCourses(coursesResult.value.courses || []);
      }

      if (compilerResult.status === 'fulfilled') {
        setCompiler(compilerResult.value || null);
      } else if (!studentResult.value?.student) {
        toast.error(compilerResult.reason?.message || 'Failed to load compiler analytics.');
      }

      setLoading(false);
    };

    loadStudentProfile();
    return () => {
      isMounted = false;
    };
  }, [studentId, toast]);

  const verdictMix = useMemo(() => {
    const labels = {
      AC: 'Accepted',
      WA: 'Wrong Answer',
      TLE: 'Time Limit Exceeded',
      CE: 'Compilation Error',
      RE: 'Runtime Error',
    };
    const entries = compiler?.statusBreakdown || {};
    return Object.entries(entries)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([status, count]) => ({
        status,
        count,
        label: labels[status] || status,
      }));
  }, [compiler]);

  const heatmapActivity = useMemo(() => {
    const compilerActivity = compiler?.activityHeatmap || {};
    return Object.keys(compilerActivity).length ? compilerActivity : activity;
  }, [activity, compiler]);

  const primaryStats = useMemo(() => ([
    {
      label: 'Total Questions Solved',
      value: compiler?.summary?.problemsSolved ?? stats?.problemsSolved ?? 0,
      helper: 'Accepted compiler problems',
      Icon: CheckCircle2,
    },
    {
      label: 'Total Submissions',
      value: compiler?.summary?.totalAttempts ?? stats?.totalSubmissions ?? 0,
      helper: 'All compiler submissions',
      Icon: Code2,
    },
    {
      label: 'Acceptance Rate',
      value: formatPercent(compiler?.summary?.acceptanceRate ?? stats?.acceptanceRate ?? 0),
      helper: 'Accepted submissions ratio',
      Icon: LineChart,
    },
    {
      label: 'Questions Attempted',
      value: compiler?.attemptedProblems?.length ?? 0,
      helper: 'Unique problems touched',
      Icon: BookOpen,
    },
    {
      label: 'Current Streak',
      value: `${activityStats?.currentStreak || 0} days`,
      helper: 'Recent consistent activity',
      Icon: Flame,
    },
    {
      label: 'Videos Watched',
      value: stats?.totalVideosWatched ?? 0,
      helper: 'Learning videos completed',
      Icon: PlayCircle,
    },
    {
      label: 'Courses Enrolled',
      value: stats?.totalCoursesEnrolled ?? 0,
      helper: 'Assigned learning tracks',
      Icon: GraduationCap,
    },
    {
      label: 'Watch Time',
      value: `${stats?.totalWatchTimeHours || 0} hrs`,
      helper: 'Accumulated learning time',
      Icon: Clock3,
    },
  ]), [activityStats, compiler, stats]);

  const topVideos = videos.slice(0, 8);
  const topCourses = courses.slice(0, 8);

  if (loading) {
    return (
      <div className="min-h-screen bg-white pt-16 dark:bg-gray-900">
        <div className="mx-auto w-full px-4 py-6">
          <LoadingPanel label="Loading student profile..." />
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-white pt-16 dark:bg-gray-900">
        <div className="mx-auto w-full px-4 py-6">
          <SectionCard title="Student profile unavailable" subtitle={error || 'This student could not be found.'}>
            <button
              type="button"
              onClick={() => navigate('/admin/students')}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700"
            >
              Back to Student Database
            </button>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pt-16 dark:bg-gray-900">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mx-auto w-full space-y-6 px-4 py-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/students')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sky-500 dark:hover:text-sky-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Student Database
          </button>
        </div>

        <SectionCard
          title={student.name || 'Student'}
          subtitle={`Full student profile with learning and compiler analytics`}
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="flex items-start gap-4">
              {student.avatarUrl ? (
                <img
                  src={student.avatarUrl}
                  alt={student.name}
                  className="h-20 w-20 rounded-2xl border border-slate-200 object-cover dark:border-gray-700"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-sky-100 text-2xl font-bold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                  {student.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <div className="space-y-3">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{student.name}</h1>
                <div className="flex flex-wrap gap-2 text-sm text-slate-500 dark:text-gray-400">
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-gray-800">{student.studentId || 'No student ID'}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-gray-800">{student.course || 'Course not set'}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-gray-800">Semester {student.semester || '-'}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500"><Mail className="h-3.5 w-3.5" /> Email</p>
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-gray-100">{student.email || 'Not available'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500"><UserCircle2 className="h-3.5 w-3.5" /> Coordinator</p>
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-gray-100">{student.teacherId || 'Not assigned'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Branch</p>
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-gray-100">{student.branch || 'Not available'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500"><MapPin className="h-3.5 w-3.5" /> College</p>
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-gray-100">{student.college || 'Not available'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Group</p>
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-gray-100">{student.group || 'Not assigned'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Joined</p>
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-gray-100">{formatDate(student.createdAt)}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {primaryStats.map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={item.value}
              helper={item.helper}
              Icon={item.Icon}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Submission Heatmap" subtitle="Every compiler submission and tracked activity contributes to the calendar.">
            <ContributionCalendar
              title="Submission Activity"
              activity={heatmapActivity}
              stats={activityStats}
              tooltipFormatter={({ value, formattedDate }) => `${value} ${Object.keys(compiler?.activityHeatmap || {}).length ? 'submissions' : 'activities'} on ${formattedDate}`}
              legendLabels={{
                none: 'No submissions',
                low: '1-2 submissions',
                medium: '3-4 submissions',
                high: '5-7 submissions',
                highest: '8+ submissions',
              }}
            />
          </SectionCard>

          <SectionCard title="Performance Trend" subtitle="Compiler submission volume across the last 30 days.">
            <SubmissionTrendChart data={compiler?.performanceTrend || []} />
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Compiler Snapshot" subtitle="A focused view of problem-solving behavior and latest activity.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Last Active</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-gray-100">
                  {compiler?.summary?.lastActive ? formatDateTime(compiler.summary.lastActive) : 'No compiler activity yet'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Active Days</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-gray-100">
                  {activityStats?.totalActiveDays || 0} / {activityStats?.totalDaysInRange || 365}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <VerdictMix items={verdictMix} />
            </div>
          </SectionCard>

          <SectionCard title="Learning Snapshot" subtitle="Progress across the official learning content assigned to this student.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Best Streak</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-gray-100">{activityStats?.bestStreak || 0} days</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Total Activities</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-gray-100">{activityStats?.totalActivities || 0}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600 dark:text-gray-300">Completed videos</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-gray-100">{stats?.totalVideosWatched || 0}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600 dark:text-gray-300">Enrolled courses</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-gray-100">{stats?.totalCoursesEnrolled || 0}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600 dark:text-gray-300">Watch time</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-gray-100">{stats?.totalWatchTimeHours || 0} hrs</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Attempted Problems" subtitle="Every problem the student has interacted with.">
            {(compiler?.attemptedProblems || []).length === 0 ? (
              <EmptyState title="No attempted problems yet" description="Attempted problems will appear here once the student starts using the compiler." />
            ) : (
              <div className="space-y-3">
                {compiler.attemptedProblems.map((problem) => (
                  <div key={problem.problemId} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{problem.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                          {problem.attempts} attempts • Last activity {formatDateTime(problem.lastSubmittedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DifficultyBadge difficulty={problem.difficulty} />
                        <SubmissionStatusBadge status={problem.lastStatus} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Solved Problems" subtitle="Questions the student has solved successfully.">
            {(compiler?.solvedProblems || []).length === 0 ? (
              <EmptyState title="No solved problems yet" description="Accepted problems will appear here after successful submissions." />
            ) : (
              <div className="space-y-3">
                {compiler.solvedProblems.map((problem) => (
                  <div key={problem.problemId} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{problem.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Solved on {formatDateTime(problem.acceptedAt)}</p>
                      </div>
                      <DifficultyBadge difficulty={problem.difficulty} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Recent Submission History" subtitle="Latest compiler submissions with verdict and runtime details.">
          {(compiler?.submissionHistory || []).length === 0 ? (
            <EmptyState title="No submission history yet" description="Recent submissions will be listed here once the student uses the compiler." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
                  <thead className="bg-slate-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Problem</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Language</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Execution</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {compiler.submissionHistory.map((submission) => (
                      <tr key={submission._id}>
                        <td className="px-4 py-4 text-slate-800 dark:text-gray-100">{submission.problemTitle}</td>
                        <td className="px-4 py-4"><SubmissionStatusBadge status={submission.status} /></td>
                        <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{submission.language}</td>
                        <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatDuration(submission.executionTimeMs)}</td>
                        <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatDateTime(submission.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Courses Enrolled" subtitle="Official course access and progress for this student.">
            {!topCourses.length ? (
              <EmptyState title="No course enrollments found" description="Course enrollment details will appear here when the student is assigned learning content." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
                    <thead className="bg-slate-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Course</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Enrolled</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                      {topCourses.map((course, index) => (
                        <tr key={`${course.courseName || 'course'}-${index}`}>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-800 dark:text-gray-100">{course.courseName || 'Untitled Course'}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{course.semesterName || 'Semester not set'}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{course.enrollmentDate ? formatDate(course.enrollmentDate) : 'Not available'}</td>
                          <td className="px-4 py-4 text-slate-700 dark:text-gray-200">
                            {course.progressPercentage || 0}% • {course.progressStatus || 'Not Started'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent Videos Watched" subtitle="Latest learning content this student has consumed.">
            {!topVideos.length ? (
              <EmptyState title="No watched videos found" description="Video watch analytics will appear once the student starts learning through the platform." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
                    <thead className="bg-slate-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Video</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Watch Time</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Watched</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                      {topVideos.map((video, index) => (
                        <tr key={`${video.videoTitle || 'video'}-${index}`}>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-800 dark:text-gray-100">{video.videoTitle || 'Untitled Video'}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{video.subjectName || 'Subject'} • {video.chapterName || 'Chapter'}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{video.durationDisplay || '0m'}</td>
                          <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{video.watchedDate ? formatDateTime(video.watchedDate) : 'Not available'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </motion.div>
    </div>
  );
}
