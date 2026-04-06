import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { Download, Filter } from 'lucide-react';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Completed' },
  { value: 'violation', label: 'Violation' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'expired', label: 'Expired' },
  { value: 'incomplete', label: 'Incomplete' },
];

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'mcq', label: 'MCQ' },
  { value: 'short', label: 'Short' },
  { value: 'one_line', label: 'One Line' },
  { value: 'coding', label: 'Coding' },
  { value: 'mixed', label: 'Mixed' },
];

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function AssessmentReports() {
  const toast = useToast();
  const [filters, setFilters] = useState({
    assessmentId: '',
    assessmentType: '',
    studentId: '',
    status: '',
    from: '',
    to: '',
    scoreMin: '',
    scoreMax: '',
  });
  const [assessments, setAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState({ avgScore: 0, maxScore: 0, minScore: 0, passCount: 0, failCount: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [loading, setLoading] = useState(true);

  const selectedAssessment = useMemo(() => assessments.find((a) => String(a._id) === String(filters.assessmentId)), [assessments, filters.assessmentId]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.getAssessmentReports({
          ...filters,
          page: pagination.page,
          limit: pagination.limit,
        });
        if (!active) return;
        setAssessments(data.assessments || []);
        setStudents(data.students || []);
        setSummary(data.summary || {});
        setPagination((prev) => ({ ...prev, total: data.pagination?.total || 0 }));
      } catch (err) {
        toast.error(err.message || 'Failed to load reports');
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [filters, pagination.page, pagination.limit, toast]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit));

  const handleExport = async () => {
    try {
      await api.exportAssessmentReports(filters);
    } catch (err) {
      toast.error(err.message || 'Failed to export report');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Assessment Reports</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Deep performance analytics with anti-cheat visibility.</p>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-gray-300">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <select
              value={filters.assessmentId}
              onChange={(e) => updateFilter('assessmentId', e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="">All Assessments</option>
              {assessments.map((assessment) => (
                <option key={assessment._id} value={assessment._id}>{assessment.title || 'Untitled'}</option>
              ))}
            </select>
            <select
              value={filters.assessmentType}
              onChange={(e) => updateFilter('assessmentType', e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              value={filters.studentId}
              onChange={(e) => updateFilter('studentId', e.target.value)}
              placeholder="Student ID"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
            <input
              type="number"
              value={filters.scoreMin}
              onChange={(e) => updateFilter('scoreMin', e.target.value)}
              placeholder="Min Score"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
            <input
              type="number"
              value={filters.scoreMax}
              onChange={(e) => updateFilter('scoreMax', e.target.value)}
              placeholder="Max Score"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-200">
              Assessments Overview
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-400 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3">Assessment</th>
                    <th className="px-4 py-3">Attempted</th>
                    <th className="px-4 py-3">Questions</th>
                    <th className="px-4 py-3">Total Marks</th>
                    <th className="px-4 py-3">Last Attempt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                  {loading ? (
                    <tr><td colSpan="5" className="px-4 py-4 text-center text-slate-500">Loading...</td></tr>
                  ) : assessments.length === 0 ? (
                    <tr><td colSpan="5" className="px-4 py-4 text-center text-slate-500">No data found.</td></tr>
                  ) : (
                    assessments.map((assessment) => (
                      <tr
                        key={assessment._id}
                        className={`cursor-pointer text-slate-700 dark:text-slate-200 ${String(filters.assessmentId) === String(assessment._id) ? 'bg-sky-50 dark:bg-sky-900/20' : ''}`}
                        onClick={() => updateFilter('assessmentId', assessment._id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{assessment.title || 'Untitled'}</div>
                          <div className="text-[11px] text-slate-400">{assessment.assessmentType || 'mixed'}</div>
                        </td>
                        <td className="px-4 py-3">{assessment.attempted || 0}</td>
                        <td className="px-4 py-3">{assessment.totalQuestions || 0}</td>
                        <td className="px-4 py-3">{assessment.totalMarks || 0}</td>
                        <td className="px-4 py-3">{formatDateTime(assessment.lastAttemptAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">Advanced Summary</div>
            <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-gray-300">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Average Score</span>
                <span className="font-semibold text-slate-900 dark:text-white">{summary.avgScore?.toFixed?.(2) || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Highest Score</span>
                <span className="font-semibold text-slate-900 dark:text-white">{summary.maxScore || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Lowest Score</span>
                <span className="font-semibold text-slate-900 dark:text-white">{summary.minScore || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Pass / Fail</span>
                <span className="font-semibold text-slate-900 dark:text-white">{summary.passCount || 0} / {summary.failCount || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-200">
            Student Attempts {selectedAssessment ? `- ${selectedAssessment.title}` : ''}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-400 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Attempt Date</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Accuracy</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Violations</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan="8" className="px-4 py-4 text-center text-slate-500">Loading...</td></tr>
                ) : students.length === 0 ? (
                  <tr><td colSpan="8" className="px-4 py-4 text-center text-slate-500">No attempts found.</td></tr>
                ) : (
                  students.map((row) => (
                    <tr key={row._id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{row.studentName || 'Unknown'}</div>
                        <div className="text-[11px] text-slate-400">{row.studentId || '-'}</div>
                      </td>
                      <td className="px-4 py-3">{formatDateTime(row.attemptDate)}</td>
                      <td className="px-4 py-3">{row.attempts || 0}</td>
                      <td className="px-4 py-3">{row.score ?? '-'}</td>
                      <td className="px-4 py-3">{row.accuracy ?? 0}%</td>
                      <td className="px-4 py-3">{row.timeTakenSec ?? 0}s</td>
                      <td className="px-4 py-3">{row.violationCount ?? 0}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {row.status || 'in_progress'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-gray-700">
            <span>Page {pagination.page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={pagination.page >= totalPages}
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

