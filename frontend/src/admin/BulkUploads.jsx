import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileQuestion,
  FileSpreadsheet,
  Filter,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

const TYPE_OPTIONS = [
  { value: '', label: 'All data types' },
  { value: 'student', label: 'Students' },
  { value: 'coordinator', label: 'Coordinators' },
  { value: 'question_mcq', label: 'MCQ questions' },
  { value: 'question_short', label: 'Short-answer questions' },
  { value: 'question_one_line', label: 'One-word questions' },
  { value: 'question_coding', label: 'Coding questions' },
  { value: 'question_mixed', label: 'Mixed questions' },
];

const TYPE_META = {
  student: { label: 'Students', Icon: Users, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  coordinator: { label: 'Coordinators', Icon: UserCog, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  question_mcq: { label: 'MCQ questions', Icon: FileQuestion, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  question_short: { label: 'Short-answer questions', Icon: FileQuestion, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  question_one_line: { label: 'One-word questions', Icon: FileQuestion, tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300' },
  question_coding: { label: 'Coding questions', Icon: FileQuestion, tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
  question_mixed: { label: 'Mixed questions', Icon: FileQuestion, tone: 'bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300' },
};

const emptyFilters = { search: '', entityType: '', status: 'active', uploadedBy: '', dateFrom: '', dateTo: '' };

function StatusBadge({ status }) {
  const styles = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
    archived: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
    deleted: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300',
  };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[status] || styles.active}`}>{status || 'active'}</span>;
}

export default function BulkUploads() {
  const toast = useToast();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ batches: [], pagination: { page: 1, pages: 1, total: 0 }, facets: { types: [], statuses: [], uploaders: [] } });
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [selected, setSelected] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.listBulkUploads({ ...appliedFilters, page, limit: 25 });
      setData(response);
    } catch (error) {
      toast.error(error.message || 'Failed to load bulk uploads.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, toast]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    uploads: data.pagination?.total || 0,
    records: data.batches.reduce((sum, batch) => sum + Number(batch.recordCount || 0), 0),
    failed: data.batches.reduce((sum, batch) => sum + Number(batch.failedCount || 0), 0),
  }), [data]);

  const applyFilters = (event) => {
    event?.preventDefault?.();
    setPage(1);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  };

  const rename = async (batch) => {
    const name = window.prompt('Enter a new upload-list name', batch.name);
    if (!name?.trim() || name.trim() === batch.name) return;
    setWorkingId(batch._id);
    try {
      await api.renameBulkUpload(batch._id, name.trim());
      toast.success('Upload list renamed.');
      await load();
    } catch (error) { toast.error(error.message || 'Rename failed.'); }
    finally { setWorkingId(''); }
  };

  const changeStatus = async (batch) => {
    const status = batch.status === 'archived' ? 'active' : 'archived';
    setWorkingId(batch._id);
    try {
      await api.updateBulkUploadStatus(batch._id, status);
      toast.success(status === 'archived' ? 'Upload archived.' : 'Upload restored.');
      if (selected?._id === batch._id) setSelected(null);
      await load();
    } catch (error) { toast.error(error.message || 'Status update failed.'); }
    finally { setWorkingId(''); }
  };

  const openDelete = async (batch) => {
    setDeleteTarget(batch);
    setDeletePreview(null);
    setDeleteConfirmation('');
    try {
      const response = await api.getBulkUploadDeletePreview(batch._id);
      setDeletePreview(response.preview);
    } catch (error) {
      toast.error(error.message || 'Could not inspect deletion impact.');
      setDeleteTarget(null);
    }
  };

  const confirmDelete = async (mode) => {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.name) return;
    if (mode === 'created_records' && deletePreview?.blockers?.length) return;
    setWorkingId(deleteTarget._id);
    try {
      const response = await api.deleteBulkUpload(deleteTarget._id, deleteConfirmation, mode);
      toast.success(response.message || 'Upload deleted.');
      setDeleteTarget(null);
      setSelected(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Delete failed.');
    } finally { setWorkingId(''); }
  };

  const download = async (batch, kind) => {
    setWorkingId(batch._id);
    try { await api.downloadBulkUpload(batch._id, kind); }
    catch (error) { toast.error(error.message || 'Download failed.'); }
    finally { setWorkingId(''); }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 pb-12 pt-6 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section data-page-header className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-indigo-50 p-6 shadow-sm dark:border-sky-900/40 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-300/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="flex items-start gap-4"><span className="rounded-2xl bg-sky-600 p-3 text-white shadow-lg shadow-sky-600/20"><Database className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">Main settings</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Bulk uploads</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-gray-400">Track student, coordinator and question spreadsheets with record-level provenance, audit-safe downloads and guarded deletion.</p></div></div>
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => navigate('/admin/onboarding')} className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-200 bg-white px-3 text-xs font-bold text-sky-700 shadow-sm hover:bg-sky-50 dark:border-sky-900 dark:bg-gray-900 dark:text-sky-300">Upload students</button><button type="button" onClick={() => navigate('/admin/coordinators')} className="inline-flex h-10 items-center justify-center rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold text-violet-700 shadow-sm hover:bg-violet-50 dark:border-violet-900 dark:bg-gray-900 dark:text-violet-300">Upload coordinators</button><button type="button" onClick={() => navigate('/admin/library/add-question?type=mcq')} className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-amber-700 shadow-sm hover:bg-amber-50 dark:border-amber-900 dark:bg-gray-900 dark:text-amber-300">Upload questions</button><button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
          </div>
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[{ label: 'Matching uploads', value: totals.uploads, Icon: FileSpreadsheet, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30' }, { label: 'Records on this page', value: totals.records, Icon: Database, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' }, { label: 'Failed rows on this page', value: totals.failed, Icon: AlertTriangle, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30' }].map(({ label, value, Icon, tone }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3"><span className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-0.5 text-xl font-bold text-slate-950 dark:text-white">{value}</p></div></div></div>)}
        </div>

        <form onSubmit={applyFilters} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2"><Filter className="h-4 w-4 text-sky-600" /><h2 className="text-sm font-bold text-slate-900 dark:text-white">Filters</h2></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search list, file or uploader" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>
            <select value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"><option value="">All statuses</option><option value="active">Active</option><option value="archived">Archived</option><option value="deleted">Deleted audit records</option></select>
            <input type="date" title="Uploaded from" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200" />
            <input type="date" title="Uploaded until" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200" />
          </div>
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={resetFilters} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300">Reset</button><button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500">Apply filters</button></div>
        </form>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:border-gray-800 dark:bg-gray-800/70"><tr><th className="px-5 py-3">Upload list</th><th className="px-5 py-3">Data type</th><th className="px-5 py-3">Uploaded</th><th className="px-5 py-3">Records</th><th className="px-5 py-3">Result</th><th className="px-5 py-3">Owner</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">{loading ? <tr><td colSpan="8" className="px-5 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600" /></td></tr> : data.batches.map((batch) => { const meta = TYPE_META[batch.entityType] || TYPE_META.question_mixed; const Icon = meta.Icon; return <tr key={batch._id} onClick={() => setSelected(batch)} className="cursor-pointer transition hover:bg-sky-50/50 dark:hover:bg-sky-950/10"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-slate-100 p-2 text-slate-500 dark:bg-gray-800"><FileSpreadsheet className="h-4 w-4" /></span><div><p className="max-w-[260px] truncate font-bold text-slate-900 dark:text-white">{batch.name}</p><p className="mt-0.5 max-w-[260px] truncate text-[11px] text-slate-500">{batch.originalFileName}</p></div></div></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${meta.tone}`}><Icon className="h-3.5 w-3.5" />{meta.label}</span></td><td className="px-5 py-4 text-xs text-slate-600 dark:text-gray-300"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{new Date(batch.createdAt).toLocaleString()}</span></td><td className="px-5 py-4 font-bold text-slate-800 dark:text-gray-200">{batch.recordCount}</td><td className="px-5 py-4 text-xs"><span className="text-emerald-600">{batch.createdCount || 0} created</span><span className="mx-1 text-slate-300">•</span><span className="text-blue-600">{batch.updatedCount || 0} updated</span>{batch.failedCount > 0 && <><span className="mx-1 text-slate-300">•</span><span className="text-rose-600">{batch.failedCount} failed</span></>}</td><td className="px-5 py-4"><p className="text-xs font-bold text-slate-700 dark:text-gray-200">{batch.uploadedBy?.name || batch.uploadedByEmail || 'Administrator'}</p><p className="text-[10px] text-slate-400">{batch.uploadedBy?.email || batch.uploadedByEmail}</p></td><td className="px-5 py-4"><StatusBadge status={batch.status} /></td><td className="px-5 py-4" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1"><button title="Download uploaded data" onClick={() => download(batch, 'data')} disabled={workingId === batch._id} className="rounded-lg p-2 text-slate-500 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-40 dark:hover:bg-gray-800"><Download className="h-4 w-4" /></button>{batch.status !== 'deleted' && <><button title="Rename" onClick={() => rename(batch)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800"><Pencil className="h-4 w-4" /></button><button title={batch.status === 'archived' ? 'Restore' : 'Archive'} onClick={() => changeStatus(batch)} className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-gray-800">{batch.status === 'archived' ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button><button title="Delete uploaded data" onClick={() => openDelete(batch)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button></>}</div></td></tr>; })}{!loading && !data.batches.length && <tr><td colSpan="8" className="px-5 py-16 text-center text-sm text-slate-500">No uploads match these filters.</td></tr>}</tbody></table></div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-500 dark:border-gray-800"><span>{data.pagination.total || 0} uploads</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30 dark:border-gray-700"><ChevronLeft className="h-3.5 w-3.5" /></button><span>Page {data.pagination.page || 1} of {data.pagination.pages || 1}</span><button disabled={page >= (data.pagination.pages || 1)} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30 dark:border-gray-700"><ChevronRight className="h-3.5 w-3.5" /></button></div></div>
        </section>
      </div>

      {selected && <>
        <button type="button" aria-label="Close upload details" onClick={() => setSelected(null)} className="fixed inset-0 z-[90] bg-slate-950/35 backdrop-blur-[1px]" />
        <aside className="fixed right-0 top-0 z-[91] flex h-dvh w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-gray-800">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Upload details</p><h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{selected.name}</h2><p className="mt-1 break-all text-xs text-slate-500">{selected.originalFileName}</p></div>
            <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/60"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><p className="text-sm font-bold text-slate-900 dark:text-white">Provenance status</p></div><p className="mt-2 text-xs leading-5 text-slate-600 dark:text-gray-300">{selected.provenanceReady ? `${selected.createdRecordCount} created and ${selected.updatedRecordCount} pre-existing records are tracked separately.` : 'Legacy upload: created-record provenance is unavailable. The list can be deleted safely, but automatic account deletion is disabled.'}</p></div>
            <dl className="grid grid-cols-2 gap-3">{[['Status', selected.status], ['Data type', TYPE_META[selected.entityType]?.label || selected.entityType], ['Total rows', selected.totalRows], ['Tracked records', selected.recordCount], ['Created', selected.createdCount], ['Updated', selected.updatedCount], ['Failed', selected.failedCount], ['Uploaded', new Date(selected.createdAt).toLocaleString()]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-gray-700"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-bold capitalize text-slate-800 dark:text-gray-100">{value ?? 0}</dd></div>)}</dl>
            <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Uploaded by</p><p className="mt-1 text-sm font-bold text-slate-800 dark:text-white">{selected.uploadedBy?.name || selected.uploadedByEmail}</p><p className="text-xs text-slate-500">{selected.uploadedBy?.email || selected.uploadedByEmail}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-5 dark:border-gray-800">
            <button onClick={() => download(selected, 'data')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200"><Download className="h-4 w-4" />Download data</button>
            <button onClick={() => download(selected, 'errors')} disabled={!selected.failedCount} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200"><AlertTriangle className="h-4 w-4" />Error report</button>
            {selected.entityType === 'student' && <button onClick={() => navigate(`/admin/students?uploadBatchId=${encodeURIComponent(selected._id)}&batchName=${encodeURIComponent(selected.name)}`)} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-sky-500"><Users className="h-4 w-4" />Manage or delete students</button>}
          </div>
        </aside>
      </>}

      {deleteTarget && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
        <div role="alertdialog" aria-modal="true" className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/50 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3"><span className="rounded-xl bg-rose-100 p-2.5 text-rose-600 dark:bg-rose-950/50"><AlertTriangle className="h-6 w-6" /></span><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Delete bulk-upload list?</h2><p className="mt-1 text-sm text-slate-500">Remove only the list, records created by it, or every linked student account and its test data.</p></div></div>
            <button disabled={workingId === deleteTarget._id} onClick={() => setDeleteTarget(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
          </div>
          {!deletePreview ? <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600" /><p className="mt-2 text-xs text-slate-500">Checking linked records…</p></div> : <>
            <div className="mt-5 grid grid-cols-3 gap-2">{[['Linked records', deletePreview.linkedRecords], ['Created by upload', deletePreview.createdRecords], ['Can be deleted', deletePreview.deletableRecords]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3 text-center dark:border-gray-700"><p className="text-xl font-bold text-slate-950 dark:text-white">{value}</p><p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{label}</p></div>)}</div>
            {deletePreview.blockers?.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200"><p className="font-bold">Created-record deletion is unavailable</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{deletePreview.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul></div>}
            {deletePreview.warnings?.length > 0 && <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/25 dark:text-sky-200">{deletePreview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
            {deletePreview.linkedStudentBlockers?.length > 0 && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-200"><p className="font-bold">Student-account deletion is blocked</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{deletePreview.linkedStudentBlockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul></div>}
            {deletePreview.linkedStudentWarnings?.length > 0 && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">{deletePreview.linkedStudentWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
            <label className="mt-5 block"><span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-gray-300">Type <strong>{deleteTarget.name}</strong> to confirm</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold outline-none focus:border-rose-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-gray-700 dark:text-gray-200">Cancel</button>
              <button disabled={deleteConfirmation !== deleteTarget.name || workingId === deleteTarget._id} onClick={() => confirmDelete('list_only')} className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-800 dark:bg-gray-900 dark:text-rose-300"><Trash2 className="h-4 w-4" />Delete list only</button>
              <button disabled={deleteConfirmation !== deleteTarget.name || deletePreview.blockers?.length > 0 || deletePreview.createdRecords === 0 || workingId === deleteTarget._id} onClick={() => confirmDelete('created_records')} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">{workingId === deleteTarget._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}Delete created records</button>
              {deleteTarget.entityType === 'student' && <button disabled={deleteConfirmation !== deleteTarget.name || deletePreview.linkedStudentAccounts === 0 || deletePreview.linkedStudentBlockers?.length > 0 || workingId === deleteTarget._id} onClick={() => confirmDelete('linked_students')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-800 px-4 py-3 text-sm font-bold text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40">{workingId === deleteTarget._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}Delete list + {deletePreview.linkedStudentAccounts} student accounts and test data</button>}
            </div>
          </>}
        </div>
      </div>}
    </div>
  );
}
