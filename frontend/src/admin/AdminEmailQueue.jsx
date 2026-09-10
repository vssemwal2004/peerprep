import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Loader2, Mail, RefreshCw, Search, Send } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

const MAIL_TYPES = {
  student_credentials: 'Student credentials',
  coordinator_onboarding: 'Coordinator onboarding',
  assessment_invitation: 'Assessment invitation',
  event_invitation: 'Interview invitation',
  event_cancellation: 'Interview cancellation',
};

const STATUS_STYLES = {
  sent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  processing: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  queued: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300',
};

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminEmailQueue() {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [summary, setSummary] = useState({ byStatus: {}, byType: {} });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 25 });
  const [filters, setFilters] = useState({ search: '', type: '', status: '', dateFrom: '', dateTo: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listMailQueue({
        search: debouncedSearch,
        type: filters.type,
        status: filters.status,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        page: pagination.page,
        limit: pagination.limit,
      });
      setJobs(data.jobs || []);
      setSummary(data.summary || { byStatus: {}, byType: {} });
      setPagination((current) => ({ ...current, ...(data.pagination || {}) }));
    } catch (error) {
      toast.error(error.message || 'Failed to load email queue.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.type, filters.status, filters.dateFrom, filters.dateTo, pagination.page, pagination.limit, toast]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const cards = useMemo(() => [
    { label: 'All emails', value: Object.values(summary.byStatus || {}).reduce((sum, count) => sum + count, 0), Icon: Mail, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40' },
    { label: 'Waiting', value: (summary.byStatus?.queued || 0) + (summary.byStatus?.processing || 0), Icon: Clock3, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40' },
    { label: 'Delivered', value: summary.byStatus?.sent || 0, Icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' },
    { label: 'Failed', value: summary.byStatus?.failed || 0, Icon: AlertCircle, tone: 'bg-red-50 text-red-600 dark:bg-red-950/40' },
  ], [summary]);

  return (
    <div className="min-h-screen bg-slate-50/70 px-3 pb-12 pt-24 dark:bg-gray-950 sm:px-5">
      <div className="mx-auto max-w-[1500px]">
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-sky-50 p-3 text-sky-600 dark:bg-sky-950/40"><Send className="h-5 w-5" /></span>
              <div><h1 className="text-xl font-bold text-slate-950 dark:text-white">Email Queue</h1><p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Track queued, delivered, and failed system emails. Delivery logs are retained for seven days.</p></div>
            </div>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </section>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3"><span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span><div><p className="text-xs font-semibold text-slate-500 dark:text-gray-400">{label}</p><p className="text-xl font-bold text-slate-950 dark:text-white">{value.toLocaleString()}</p></div></div></div>)}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-2 border-b border-slate-200 p-4 dark:border-gray-800 md:grid-cols-2 xl:grid-cols-6">
            <label className="relative md:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search recipient, requester, batch or error" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></label>
            <select aria-label="Mail type" value={filters.type} onChange={(event) => updateFilter('type', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"><option value="">All mail types</option>{Object.entries(MAIL_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Delivery status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm capitalize dark:border-gray-700 dark:bg-gray-800 dark:text-white"><option value="">All statuses</option>{['queued', 'processing', 'sent', 'failed', 'cancelled'].map((status) => <option key={status} value={status}>{status}</option>)}</select>
            <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="From date" type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></label>
            <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="To date" type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-gray-800 dark:text-gray-400"><tr><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Mail type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Queued</th><th className="px-4 py-3">Completed</th><th className="px-4 py-3">Details</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading && !jobs.length ? <tr><td colSpan="7" className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600" /></td></tr> : jobs.length ? jobs.map((job) => <tr key={job._id} className="hover:bg-slate-50/70 dark:hover:bg-gray-800/60"><td className="px-4 py-3"><p className="font-semibold text-slate-900 dark:text-white">{job.recipientId?.name || 'Recipient'}</p><p className="text-xs text-slate-500">{job.to}</p>{(job.recipientId?.studentId || job.recipientId?.coordinatorId) && <p className="text-[11px] text-slate-400">{job.recipientId.studentId || job.recipientId.coordinatorId}</p>}</td><td className="px-4 py-3 text-slate-700 dark:text-gray-200">{MAIL_TYPES[job.type] || job.type}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[job.status] || STATUS_STYLES.cancelled}`}>{job.status}</span></td><td className="px-4 py-3 text-slate-600 dark:text-gray-300">{job.attempts} / {job.maxAttempts}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-gray-300">{formatDate(job.createdAt)}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-gray-300">{formatDate(job.sentAt || job.failedAt)}</td><td className="max-w-[260px] px-4 py-3"><p className={`truncate text-xs ${job.lastError ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`} title={job.lastError || job.batchId}>{job.lastError || `Batch ${job.batchId || '—'}`}</p></td></tr>) : <tr><td colSpan="7" className="py-16 text-center text-sm text-slate-500">No email logs match these filters.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-gray-800"><p className="text-xs text-slate-500">{pagination.total.toLocaleString()} matching email{pagination.total === 1 ? '' : 's'}</p><div className="flex items-center gap-2"><button type="button" aria-label="Previous page" disabled={pagination.page <= 1 || loading} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40 dark:border-gray-700"><ChevronLeft className="h-4 w-4" /></button><span className="text-xs font-semibold text-slate-600 dark:text-gray-300">Page {pagination.page} of {pagination.pages}</span><button type="button" aria-label="Next page" disabled={pagination.page >= pagination.pages || loading} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40 dark:border-gray-700"><ChevronRight className="h-4 w-4" /></button></div></div>
        </section>
      </div>
    </div>
  );
}
