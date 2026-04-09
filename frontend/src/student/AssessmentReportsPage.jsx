import { useMemo, useState } from 'react';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import AssessmentReportModal from './assessment-dashboard/AssessmentReportModal';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';
import { formatScore, formatShortDate } from './assessment-dashboard/assessmentDashboardUtils';

const PAGE_SIZE = 8;

function StatusPill({ value }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
      value === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
    }`}>
      {value}
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
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search assessment"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 sm:max-w-xs"
          />
        </div>

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
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Total Marks</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Score Obtained</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Status</th>
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
                        <td className="px-5 py-4 text-sm text-slate-700">{formatScore(row.totalMarks)}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{formatScore(row.score)}</td>
                        <td className="px-5 py-4 text-sm"><StatusPill value={row.status} /></td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-14 text-center text-sm text-slate-500">
                          No reports found.
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
