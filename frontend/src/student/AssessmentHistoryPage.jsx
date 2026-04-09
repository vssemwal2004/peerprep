import { useMemo, useState } from 'react';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import AssessmentReportModal from './assessment-dashboard/AssessmentReportModal';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';
import { formatScore, formatShortDate } from './assessment-dashboard/assessmentDashboardUtils';

const PAGE_SIZE = 8;

export default function AssessmentHistoryPage() {
  const { dashboard, loading, error } = useStudentAssessmentDashboardData();
  const [selectedReport, setSelectedReport] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const rows = dashboard.history || [];
    if (!search) return rows;
    return rows.filter((row) => row.assessmentName?.toLowerCase().includes(search));
  }, [dashboard.history, query]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <AssessmentModuleLayout title="Assessment History">
      <div className="space-y-4">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search assessment"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 sm:max-w-xs"
        />

        {loading ? (
          <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-white px-6 py-10 text-sm text-rose-600">{error}</div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Assessment Name</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Date</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Score</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Attempt Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.length ? pagedRows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedReport(row)}
                        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 text-sm font-medium text-slate-900">{row.assessmentName}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{formatShortDate(row.dateAttempted)}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{formatScore(row.score)}</td>
                        <td className="px-5 py-4 text-sm">
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                            Completed
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-14 text-center text-sm text-slate-500">
                          No history found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {!pagedRows.length ? null : (
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <span className="text-slate-500">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
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
