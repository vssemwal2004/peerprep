import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, FileText, Search, Trophy } from 'lucide-react';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import AssessmentReportModal from './assessment-dashboard/AssessmentReportModal';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';
import { formatScore, formatShortDate, formatSeconds } from './assessment-dashboard/assessmentDashboardUtils';

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
  const completedCount = dashboard.history?.length || 0;
  const scoredRows = (dashboard.history || []).filter((row) => row.score !== null && row.score !== undefined);
  const bestScore = scoredRows.length ? Math.max(...scoredRows.map((row) => Number(row.score || 0))) : 0;

  return (
    <AssessmentModuleLayout title="Assessment History">
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Completed Tests', value: completedCount, Icon: CheckCircle2, tone: 'emerald' },
            { label: 'Best Score', value: scoredRows.length ? formatScore(bestScore) : 'Hidden', Icon: Trophy, tone: 'amber' },
            { label: 'Reports Ready', value: filteredRows.length, Icon: FileText, tone: 'sky' },
          ].map(({ label, value, Icon, tone }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${
                tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-semibold text-slate-900">{value}</div>
              <div className="mt-1 text-sm text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Completed Assessment Records</h2>
            <p className="mt-1 text-sm text-slate-500">Open any completed test to review the available report details.</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search assessment"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-white px-6 py-10 text-sm text-rose-600">{error}</div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Assessment Name</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Completed On</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Score</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-slate-500">Time</th>
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
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold text-slate-900">{row.assessmentName}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.assessmentType || 'mixed'} assessment</div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-slate-400" />
                            {formatShortDate(row.submittedAt || row.dateAttempted)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-800">
                          {row.score === null || row.score === undefined ? 'Hidden' : `${formatScore(row.score)}${row.totalMarks ? ` / ${formatScore(row.totalMarks)}` : ''}`}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{formatSeconds(row.timeTakenSec)}</td>
                        <td className="px-5 py-4 text-sm">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {row.status || 'Completed'}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-14 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                            <FileText className="h-6 w-6" />
                          </div>
                          <div className="mt-3 text-sm font-semibold text-slate-700">No completed assessments found</div>
                          <div className="mt-1 text-sm text-slate-500">Submitted tests will appear here after completion.</div>
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
