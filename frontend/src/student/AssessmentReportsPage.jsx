import { useMemo, useState } from 'react';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import AssessmentReportModal from './assessment-dashboard/AssessmentReportModal';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';
import { formatScore, formatShortDate } from './assessment-dashboard/assessmentDashboardUtils';
import { Search, ArrowLeft, ArrowRight, Trophy, Clock, X } from 'lucide-react';

const PAGE_SIZE = 10;

const statusConfig = {
  Completed: { label: 'Completed', bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800', icon: Trophy },
  InProgress: { label: 'In Progress', bg: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800', icon: Clock },
  Pending: { label: 'Pending', bg: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800', icon: Clock },
  Failed: { label: 'Failed', bg: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800', icon: X },
};

function StatusBadge({ value }) {
  const config = statusConfig[value] || statusConfig.Pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.bg}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

export default function AssessmentReportsPage() {
  const { dashboard, loading, error } = useStudentAssessmentDashboardData();
  const [selectedReport, setSelectedReport] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const rows = dashboard.reports || [];
    if (!search) return rows;
    return rows.filter((row) => row.assessmentName?.toLowerCase().includes(search));
  }, [dashboard.reports, query]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <AssessmentModuleLayout title="Assessment Reports">
      <div className="space-y-5">
        {/* Search bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search assessments..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none ring-sky-200 transition-all placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:ring-sky-900"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-gray-400">
            {filteredRows.length} result{filteredRows.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-white px-6 py-10 text-sm text-rose-600 dark:border-rose-800 dark:bg-gray-900 dark:text-rose-400">
            {error}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-5 py-4">Assessment Name</th>
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4 text-right">Total Marks</th>
                      <th className="px-5 py-4 text-right">Score</th>
                      <th className="px-5 py-4 text-center">Status</th>
                      <th className="px-5 py-4 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {pagedRows.length ? pagedRows.map((row, idx) => {
                      const percentage = row.totalMarks ? ((row.score / row.totalMarks) * 100).toFixed(1) : 0;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedReport(row)}
                          className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-sky-50/50 dark:border-gray-800 dark:hover:bg-sky-900/10"
                        >
                          <td className="px-5 py-4 text-sm font-medium text-slate-900 dark:text-white">{row.assessmentName}</td>
                          <td className="px-5 py-4 text-sm text-slate-600 dark:text-gray-300">{formatShortDate(row.dateAttempted)}</td>
                          <td className="px-5 py-4 text-sm text-slate-600 text-right dark:text-gray-300">{formatScore(row.totalMarks)}</td>
                          <td className="px-5 py-4 text-sm font-bold text-slate-900 text-right dark:text-white">{formatScore(row.score)}</td>
                          <td className="px-5 py-4 text-center"><StatusBadge value={row.status} /></td>
                          <td className="px-5 py-4 text-sm text-right">
                            <span className={`font-semibold ${percentage >= 75 ? 'text-emerald-600 dark:text-emerald-400' : percentage >= 50 ? 'text-sky-600 dark:text-sky-400' : percentage >= 35 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {percentage}%
                            </span>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-gray-800">
                              <Search className="h-6 w-6 text-slate-300 dark:text-gray-600" />
                            </div>
                            <div className="text-sm font-semibold text-slate-700 dark:text-gray-300">No reports found</div>
                            <div className="max-w-xs text-xs text-slate-400 dark:text-gray-500">Try adjusting your search or check back later.</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagedRows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-gray-700">
                  <span className="text-xs text-slate-500 dark:text-gray-400">
                    Showing <span className="font-semibold text-slate-700 dark:text-gray-300">{pagedRows.length}</span> of{' '}
                    <span className="font-semibold text-slate-700 dark:text-gray-300">{filteredRows.length}</span> results
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page === 1}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <ArrowLeft className="h-3 w-3" />Prev
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let p;
                        if (totalPages <= 5) p = i + 1;
                        else if (page <= 3) p = i + 1;
                        else if (page >= totalPages - 2) p = totalPages - 4 + i;
                        else p = page - 2 + i;
                        return (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                              p === page
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={page === totalPages}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Next<ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AssessmentReportModal
        report={selectedReport}
        open={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
      />
    </AssessmentModuleLayout>
  );
}
