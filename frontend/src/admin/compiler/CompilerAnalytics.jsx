import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { formatDateTime, formatPercent } from './compilerUtils';
import { DifficultyBadge, LoadingPanel, SectionCard } from './CompilerUi';

function SimpleLineChart({ data }) {
  const max = Math.max(...data.map((item) => item.count || 0), 1);
  const points = data.map((item, index) => {
    const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
    const y = 100 - ((item.count || 0) / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 100 100" className="h-56 w-full overflow-visible rounded-2xl bg-slate-50 p-4 dark:bg-gray-800">
        <polyline fill="none" stroke="url(#compilerLineChart)" strokeWidth="2.5" points={points} vectorEffect="non-scaling-stroke" />
        <defs>
          <linearGradient id="compilerLineChart" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="grid grid-cols-5 gap-2 text-[11px] text-slate-500 dark:text-gray-400">
        {data.slice(-5).map((item) => <span key={item.date}>{item.date.slice(5)}</span>)}
      </div>
    </div>
  );
}

function SimpleBarChart({ data }) {
  const max = Math.max(...data.map((item) => item.successRate || 0), 1);
  return (
    <div className="flex h-56 items-end gap-4">
      {data.map((item) => (
        <div key={item.difficulty} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-gray-400">{formatPercent(item.successRate)}</span>
          <div className="flex h-40 w-full items-end rounded-2xl bg-slate-100 p-2 dark:bg-gray-800">
            <div className="w-full rounded-xl bg-gradient-to-t from-sky-500 to-sky-300" style={{ height: `${Math.max(((item.successRate || 0) / max) * 100, item.successRate ? 10 : 0)}%` }} />
          </div>
          <span className="text-xs font-medium text-slate-600 dark:text-gray-300">{item.difficulty}</span>
        </div>
      ))}
    </div>
  );
}

function PieLegend({ data }) {
  const colors = ['bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${colors[index % colors.length]}`} />
            <span className="text-sm font-medium text-slate-700 dark:text-gray-200">{item.label}</span>
          </div>
          <span className="text-sm text-slate-500 dark:text-gray-400">{item.count} ({formatPercent(item.percentage)})</span>
        </div>
      ))}
    </div>
  );
}

export default function CompilerAnalytics() {
  const navigate = useNavigate();
  const toast = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    studentId: '',
    problemId: '',
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => {
    let isMounted = true;

    const loadAnalytics = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerAnalytics(filters);
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
  }, [filters, toast]);

  const selectedStudent = useMemo(
    () => analytics?.filters?.students?.find((student) => student._id === filters.studentId) || null,
    [analytics, filters.studentId],
  );

  if (loading) {
    return <LoadingPanel label="Loading compiler analytics..." />;
  }

  const availableStudents = analytics?.filters?.students || [];
  const availableProblems = analytics?.filters?.problems || [];
  const studentPerformance = analytics?.studentPerformance || [];
  const problemAnalysis = analytics?.problemAnalysis || [];
  const charts = analytics?.charts || {};

  return (
    <div className="space-y-6">
      <SectionCard title="Filters" subtitle="Slice analytics by student, problem, or date range without overloading the view.">
        <div className="grid gap-4 md:grid-cols-4">
          <select value={filters.studentId} onChange={(event) => setFilters((previous) => ({ ...previous, studentId: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900">
            <option value="">All students</option>
            {availableStudents.map((student) => <option key={student._id} value={student._id}>{student.name}</option>)}
          </select>
          <select value={filters.problemId} onChange={(event) => setFilters((previous) => ({ ...previous, problemId: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900">
            <option value="">All problems</option>
            {availableProblems.map((problem) => <option key={problem._id} value={problem._id}>{problem.title}</option>)}
          </select>
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((previous) => ({ ...previous, dateFrom: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters((previous) => ({ ...previous, dateTo: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Student Performance" subtitle="Controlled student performance with click-through drill-down." className="xl:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
                <thead className="bg-slate-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Student Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Total Attempts</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Problems Solved</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Acceptance Rate</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                  {studentPerformance.map((student) => (
                    <tr key={student.studentId} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-800/60" onClick={() => navigate(`/admin/students/${student.studentId}`)}>
                      <td className="px-4 py-4 font-semibold text-slate-800 dark:text-gray-100">{student.name}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{student.totalAttempts}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{student.problemsSolved}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatPercent(student.acceptanceRate)}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{student.lastActive ? formatDateTime(student.lastActive) : 'No activity yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Student Drill-down" subtitle="Open a dedicated full-page profile for clear, structured analytics.">
          {selectedStudent ? (
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{selectedStudent.name}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Selection applied to filtered analytics.</p>
              <button
                type="button"
                onClick={() => navigate(`/admin/students/${selectedStudent._id}`)}
                className="mt-3 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700"
              >
                Open Full Student Profile
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-gray-400">Select a student filter or click a row to open a dedicated student analytics page.</p>
          )}
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
            The detailed view now opens as a separate page so large student data stays easier to scan and compare.
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Problem-wise Analysis" subtitle="Attempts, unique student solves, and failure rate by problem.">
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
              <thead className="bg-slate-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Problem</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Difficulty</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Attempts</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Students Solved</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Failure Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {problemAnalysis.map((problem) => (
                  <tr key={problem.problemId}>
                    <td className="px-4 py-4 font-semibold text-slate-800 dark:text-gray-100">{problem.title}</td>
                    <td className="px-4 py-4"><DifficultyBadge difficulty={problem.difficulty} /></td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{problem.totalAttempts}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{problem.studentsSolved}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatPercent(problem.failureRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Submissions Over Time" subtitle="Trend line for controlled practice activity." className="xl:col-span-2">
          <SimpleLineChart data={charts.submissionsOverTime || []} />
        </SectionCard>
        <SectionCard title="Verdict Mix" subtitle="Accepted vs wrong answers vs errors.">
          <PieLegend data={charts.verdictDistribution || []} />
        </SectionCard>
      </div>

      <SectionCard title="Difficulty vs Success Rate" subtitle="Bar chart of success rate by problem difficulty.">
        <SimpleBarChart data={charts.difficultyVsSuccessRate || []} />
      </SectionCard>
    </div>
  );
}
