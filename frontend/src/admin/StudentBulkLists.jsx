import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FileSpreadsheet, Loader2, Mail, MoreVertical, Pencil, Search, Trash2, Users } from 'lucide-react';
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
    if (!window.confirm(`Remove “${batch.name}” from bulk lists? Student accounts will remain safe.`)) return;
    try {
      const result = await api.deleteStudentUploadBatch(batch._id);
      setBatches((current) => current.filter((item) => item._id !== batch._id));
      toast.success(result.message);
    } catch (error) { toast.error(error.message || 'Delete failed.'); }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-12 pt-24 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Student management</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Bulk student lists</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Open an uploaded file as a complete student list and perform individual or bulk actions.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search list or file name" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          </div>
        </div>

        <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <tr><th className="px-5 py-3">List name</th><th className="px-5 py-3">Original file</th><th className="px-5 py-3">Upload date</th><th className="px-5 py-3">Students</th><th className="px-5 py-3">Results</th><th className="px-5 py-3">Uploaded by</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading ? <tr><td colSpan="7" className="px-5 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600" /></td></tr> : visible.map((batch) => (
                  <tr key={batch._id} onClick={() => viewStudents(batch)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-800/60">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/40"><FileSpreadsheet className="h-4 w-4" /></span><span className="font-semibold text-slate-900 dark:text-white">{batch.name}</span></div></td>
                    <td className="px-5 py-4 text-slate-600 dark:text-gray-300">{batch.originalFileName}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-gray-300"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{new Date(batch.createdAt).toLocaleString()}</span></td>
                    <td className="px-5 py-4 font-semibold text-slate-800 dark:text-gray-200"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{batch.studentIds?.length || 0}</span></td>
                    <td className="px-5 py-4 text-xs">{isCoordinator ? <span className="text-sky-600">Assigned students only</span> : <><span className="text-emerald-600">{batch.createdCount} added</span><span className="mx-1.5 text-slate-300">•</span><span className="text-blue-600">{batch.updatedCount} updated</span>{batch.failedCount > 0 && <><span className="mx-1.5 text-slate-300">•</span><span className="text-red-600">{batch.failedCount} failed</span></>}</>}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-gray-300">{batch.uploadedBy?.name || batch.uploadedByEmail || 'Admin'}</td>
                    <td className="relative px-5 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => setActiveMenu((value) => value === batch._id ? '' : batch._id)} className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-gray-700">{workingId === batch._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}</button>
                      {activeMenu === batch._id && <div className="absolute right-5 top-12 z-30 w-52 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900">
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
      </div>
    </div>
  );
}
