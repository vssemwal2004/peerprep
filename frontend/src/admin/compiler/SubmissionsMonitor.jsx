import { startTransition, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../utils/api';
import socketService from '../../utils/socket';
import { useToast } from '../../components/CustomToast';
import { formatDuration, formatDateTime, getLanguageLabel } from './compilerUtils';
import { LoadingPanel, SectionCard, SubmissionStatusBadge } from './CompilerUi';

export default function SubmissionsMonitor() {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const loadSubmissions = async () => {
      try {
        setLoading(true);
        const response = await api.listCompilerSubmissions({
          search: searchQuery,
          status,
          limit: 15,
        });
        if (isMounted) {
          setSubmissions(response.submissions || []);
        }
      } catch (error) {
        toast.error(error.message || 'Failed to load submissions.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadSubmissions();
    return () => {
      isMounted = false;
    };
  }, [searchQuery, status, toast]);

  useEffect(() => {
    socketService.connect();

    const handleSubmissionUpdate = (submission) => {
      startTransition(() => {
        setSubmissions((previous) => {
          const next = [submission, ...previous.filter((item) => item._id !== submission._id)];
          return next.slice(0, 15);
        });
      });
    };

    socketService.on('compiler-submission-updated', handleSubmissionUpdate);
    return () => {
      socketService.off('compiler-submission-updated', handleSubmissionUpdate);
    };
  }, []);

  if (loading) {
    return <LoadingPanel label="Loading live submissions..." />;
  }

  return (
    <SectionCard title="Submissions Monitor" subtitle="Live judge stream for admin testing, execution status, and turnaround time.">
      <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by user or problem" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="RUNNING">Running</option>
          <option value="AC">Accepted</option>
          <option value="WA">Wrong Answer</option>
          <option value="TLE">Time Limit</option>
          <option value="RE">Runtime Error</option>
          <option value="CE">Compilation Error</option>
        </select>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
        Live stream enabled
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
            <thead className="bg-slate-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">User</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Problem</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Language</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Execution Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {submissions.map((submission) => (
                <tr key={submission._id} className="hover:bg-slate-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-800 dark:text-gray-100">{submission.user.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{formatDateTime(submission.createdAt)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-700 dark:text-gray-200">{submission.problem.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{submission.mode}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{getLanguageLabel(submission.language)}</td>
                  <td className="px-4 py-4"><SubmissionStatusBadge status={submission.status} /></td>
                  <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatDuration(submission.executionTimeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
