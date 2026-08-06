import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarDays, FileSpreadsheet, Loader2, Mail, MoreVertical, Pencil, Search, Trash2, UploadCloud, Users, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { useAuth } from '../context/AuthContext';

export default function StudentBulkLists() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isCoordinator = user?.role === 'coordinator';
  const rolePrefix = isCoordinator ? '/coordinator' : '/admin';
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeMenu, setActiveMenu] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listStudentUploadBatches();
      setBatches(data.batches || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load bulk lists.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return batches;
    return batches.filter((batch) => [batch.name, batch.originalFileName, batch.uploadedByEmail]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [batches, search]);
  const totalStudents = useMemo(() => batches.reduce((sum, batch) => sum + (batch.studentIds?.length || 0), 0), [batches]);
  const latestUpload = batches[0]?.createdAt ? new Date(batches[0].createdAt).toLocaleDateString() : '—';

  const viewStudents = (batch) => navigate(`${rolePrefix}/students?uploadBatchId=${batch._id}&batchName=${encodeURIComponent(batch.name)}`);

  const sendCredentials = async (batch) => {
    setActiveMenu('');
    setWorkingId(batch._id);
    try {
      const data = await api.listAllStudents({ uploadBatchId: batch._id });
      const ids = (data.students || []).filter((student) => student.canResendCredentials).map((student) => student._id);
      if (!ids.length) return toast.error('No eligible students in this bulk list.');
      const result = await api.resendStudentCredentials(ids);
      toast.success(result.message || `Credentials queued for ${ids.length} students.`);
    } catch (error) {
      toast.error(error.message || 'Failed to send credentials.');
    } finally {
      setWorkingId('');
    }
  };

  const rename = async (batch) => {
    setActiveMenu('');
    const name = window.prompt('Enter a new bulk list name', batch.name);
    if (!name?.trim() || name.trim() === batch.name) return;
    try {
      const data = await api.renameStudentUploadBatch(batch._id, name.trim());
      setBatches((current) => current.map((item) => item._id === batch._id ? data.batch : item));
      toast.success('Bulk list renamed.');
    } catch (error) { toast.error(error.message || 'Rename failed.'); }
  };

  const remove = async (batch) => {
    setActiveMenu('');
    setDeleteTarget(batch);
    setDeleteConfirmation('');
  };

  const confirmRemove = async () => {
    if (!deleteTarget || deleteConfirmation !== 'DELETE') return;
    const batch = deleteTarget;
    setWorkingId(batch._id);
    try {
      const result = await api.deleteStudentUploadBatch(batch._id);
      setBatches((current) => current.filter((item) => item._id !== batch._id));
      toast.success(result.message);
    } catch (error) { toast.error(error.message || 'Delete failed.'); }
    finally {
      setWorkingId('');
      setDeleteTarget(null);
      setDeleteConfirmation('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 pb-12 pt-20 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="relative mb-5 overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/70 to-indigo-50 p-5 shadow-sm dark:border-sky-900/40 dark:from-gray-900 dark:via-sky-950/30 dark:to-indigo-950/20 sm:p-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-200/30 blur-3xl dark:bg-sky-600/10" />
          <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="flex items-start gap-4">
              <span className="rounded-2xl bg-sky-600 p-3 text-white shadow-lg shadow-sky-600/20"><UploadCloud className="h-6 w-6" /></span>
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">Student management</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Bulk student lists</h1><p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-gray-400">Manage every CSV upload, open its student roster, and perform controlled actions from one workspace.</p></div>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search list or file name" className="h-10 w-full rounded-xl border border-white/80 bg-white/90 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900/90 dark:text-white" />
            </div>
          </div>
        </section>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[{ label: 'Saved bulk lists', value: batches.length, Icon: FileSpreadsheet, toneClass: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30' }, { label: 'Students represented', value: totalStudents, Icon: Users, toneClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' }, { label: 'Latest upload', value: latestUpload, Icon: CalendarDays, toneClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30' }].map(({ label, value, Icon, toneClass }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3"><span className={`rounded-xl p-2.5 ${toneClass}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-slate-500 dark:text-gray-400">{label}</p><p className="mt-0.5 text-xl font-bold text-slate-950 dark:text-white">{value}</p></div></div></div>
          ))}
        </div>

        <div className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <tr><th className="px-5 py-3">List name</th><th className="px-5 py-3">Original file</th><th className="px-5 py-3">Upload date</th><th className="px-5 py-3">Students</th><th className="px-5 py-3">Results</th><th className="px-5 py-3">Uploaded by</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading ? <tr><td colSpan="7" className="px-5 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600" /></td></tr> : visible.map((batch) => (
                  <tr key={batch._id} onClick={() => viewStudents(batch)} className="cursor-pointer transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-950/10">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/40"><FileSpreadsheet className="h-4 w-4" /></span><span className="font-semibold text-slate-900 dark:text-white">{batch.name}</span></div></td>
                    <td className="px-5 py-4 text-slate-600 dark:text-gray-300">{batch.originalFileName}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-gray-300"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{new Date(batch.createdAt).toLocaleString()}</span></td>
                    <td className="px-5 py-4 font-semibold text-slate-800 dark:text-gray-200"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{batch.studentIds?.length || 0}</span></td>
                    <td className="px-5 py-4 text-xs">{isCoordinator ? <span className="text-sky-600">Assigned students only</span> : <><span className="text-emerald-600">{batch.createdCount} added</span><span className="mx-1.5 text-slate-300">•</span><span className="text-blue-600">{batch.updatedCount} updated</span>{batch.failedCount > 0 && <><span className="mx-1.5 text-slate-300">•</span><span className="text-red-600">{batch.failedCount} failed</span></>}</>}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-gray-300">{batch.uploadedBy?.name || batch.uploadedByEmail || 'Admin'}</td>
                    <td className="relative px-5 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                      <button data-platform-menu-trigger aria-expanded={activeMenu === batch._id} onClick={() => setActiveMenu((value) => value === batch._id ? '' : batch._id)} className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-gray-700">{workingId === batch._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}</button>
                      {activeMenu === batch._id && <div data-platform-action-menu className="absolute right-5 top-12 z-[80] w-52 rounded-xl border border-slate-200 bg-white py-1 text-left shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                        <button onClick={() => viewStudents(batch)} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-gray-800"><Users className="h-4 w-4 text-sky-600" />View students</button>
                        {!isCoordinator && <button onClick={() => sendCredentials(batch)} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-gray-800"><Mail className="h-4 w-4 text-indigo-600" />Send credential mail</button>}
                        {!isCoordinator && <button onClick={() => rename(batch)} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-gray-800"><Pencil className="h-4 w-4" />Rename list</button>}
                        {!isCoordinator && <button onClick={() => remove(batch)} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:border-gray-800 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" />Remove bulk list</button>}
                      </div>}
                    </td>
                  </tr>
                ))}
                {!loading && visible.length === 0 && <tr><td colSpan="7" className="px-5 py-16 text-center text-slate-500">No bulk student lists found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {deleteTarget && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !workingId) setDeleteTarget(null); }}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-900/50 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="rounded-xl bg-red-100 p-2.5 text-red-600 dark:bg-red-950/50 dark:text-red-400"><AlertTriangle className="h-6 w-6" /></span><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Permanently delete bulk list?</h2><p className="mt-1 text-sm text-slate-500 dark:text-gray-400">This is a destructive action and cannot be undone.</p></div></div><button disabled={Boolean(workingId)} onClick={() => setDeleteTarget(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200"><p className="font-bold">Warning: deleting “{deleteTarget.name}” will also permanently delete all {deleteTarget.studentIds?.length || 0} registered student accounts in this list.</p><p className="mt-2 text-xs leading-5">Student profiles and login access will be removed. This action does not only remove the saved list.</p></div>
            <label className="mt-5 block"><span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-gray-300">Type DELETE to confirm</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></label>
            <div className="mt-6 flex justify-end gap-2"><button disabled={Boolean(workingId)} onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button><button disabled={deleteConfirmation !== 'DELETE' || Boolean(workingId)} onClick={confirmRemove} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">{workingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete list & students</button></div>
          </div>
        </div>}
      </div>
    </div>
  );
}
