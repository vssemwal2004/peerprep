import { useEffect, useState } from 'react';
import { Activity, BarChart3, CheckCircle2, FileCode2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { formatDateTime, getLanguageLabel } from './compilerUtils';
import { LoadingPanel, MiniBarChart, ProgressList, SectionCard, StatCard, SubmissionStatusBadge } from './CompilerUi';

export default function CompilerOverview() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerOverview();
        if (isMounted) {
          setOverview(response);
        }
      } catch (error) {
        toast.error(error.message || 'Failed to load compiler overview.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadOverview();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  if (loading) {
    return <LoadingPanel label="Loading compiler overview..." />;
  }

  const stats = overview?.stats || {};
  const recentProblems = overview?.recentProblems || [];
  const recentSubmissions = overview?.recentSubmissions || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Problems" value={stats.totalProblems || 0} helper="All authored problems" Icon={FileCode2} />
        <StatCard label="Active Problems" value={stats.activeProblems || 0} helper="Published and available" Icon={CheckCircle2} />
        <StatCard label="Total Submissions" value={stats.totalSubmissions || 0} helper="Judge evaluations completed" Icon={Activity} />
        <StatCard label="Acceptance Rate" value={`${Number(stats.acceptanceRate || 0).toFixed(1)}%`} helper="Accepted / submitted" Icon={BarChart3} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Daily submissions" subtitle="Last 7 days of judge activity">
          <MiniBarChart
            data={(overview?.dailySubmissions || []).map((item) => ({
              label: item.date.slice(5),
              count: item.count,
            }))}
          />
        </SectionCard>

        <SectionCard title="Difficulty distribution" subtitle="How problems are spread across difficulty levels">
          <ProgressList
            items={(overview?.difficultyDistribution || []).map((item) => ({
              label: item.difficulty,
              count: item.count,
            }))}
          />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Latest problems created" subtitle="Recently authored problems in the system">
          <div className="space-y-3">
            {recentProblems.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-gray-400">No problems created yet.</p>
            ) : recentProblems.map((problem) => (
              <div key={problem._id} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{problem.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{formatDateTime(problem.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-300">{problem.difficulty}</span>
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">{problem.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent submissions" subtitle="Latest code submissions reaching the admin judge">
          <div className="space-y-3">
            {recentSubmissions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-gray-400">No submissions have been processed yet.</p>
            ) : recentSubmissions.map((submission) => (
              <div key={submission._id} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{submission.problem.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                      {submission.user.name} · {getLanguageLabel(submission.language)} · {formatDateTime(submission.createdAt)}
                    </p>
                  </div>
                  <SubmissionStatusBadge status={submission.status} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
