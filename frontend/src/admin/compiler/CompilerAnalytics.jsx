import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { formatDuration, formatPercent, getLanguageLabel } from './compilerUtils';
import { DifficultyBadge, LoadingPanel, MiniBarChart, ProgressList, SectionCard, StatCard } from './CompilerUi';

export default function CompilerAnalytics() {
  const toast = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAnalytics = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerAnalytics();
        if (isMounted) {
          setAnalytics(response);
        }
      } catch (error) {
        toast.error(error.message || 'Failed to load compiler analytics.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAnalytics();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  if (loading) {
    return <LoadingPanel label="Loading compiler analytics..." />;
  }

  const summary = analytics?.summary || {};

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Attempts" value={summary.totalAttempts || 0} helper="All judge submissions" />
        <StatCard label="Overall Success Rate" value={formatPercent(summary.overallSuccessRate || 0)} helper="Accepted submissions only" />
        <StatCard label="Avg Execution Time" value={formatDuration(summary.averageExecutionTimeMs || 0)} helper="Across completed submissions" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Attempts Trend" subtitle="Submissions processed during the last 7 days">
          <MiniBarChart
            data={(analytics?.attemptsTrend || []).map((item) => ({
              label: item.date.slice(5),
              count: item.count,
            }))}
          />
        </SectionCard>

        <SectionCard title="Status Distribution" subtitle="Judge result mix across all problem submissions">
          <ProgressList
            items={(analytics?.statusDistribution || []).map((item) => ({
              label: item.status,
              count: item.count,
            }))}
          />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <SectionCard title="Per-problem analytics" subtitle="Attempts, success rate, and average execution time for each authored problem.">
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
                <thead className="bg-slate-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Problem</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Attempts</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Success Rate</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                  {(analytics?.problemAnalytics || []).map((problem) => (
                    <tr key={problem.problemId} className="hover:bg-slate-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-800 dark:text-gray-100">{problem.title}</p>
                        <div className="mt-2"><DifficultyBadge difficulty={problem.difficulty} /></div>
                      </td>
                      <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{problem.attempts}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatPercent(problem.successRate)}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatDuration(problem.averageExecutionTimeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Language Usage" subtitle="Which runtimes are seeing the most admin activity">
          <ProgressList
            items={(analytics?.languageDistribution || []).map((item) => ({
              label: getLanguageLabel(item.language),
              count: item.count,
            }))}
          />
        </SectionCard>
      </div>
    </div>
  );
}
