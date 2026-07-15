import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, GraduationCap, Loader2, Search, Users, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

function PromotionConfirm({ action, onClose, onConfirm, loading }) {
  if (!action) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200"><GraduationCap className="h-5 w-5" /></div><div><h3 className="font-bold text-slate-950 dark:text-white">Confirm student promotion</h3><p className="mt-1 text-sm text-slate-500">This updates the selected student records immediately.</p></div></div><button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-slate-200 p-1.5 text-slate-400 dark:border-white/10"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100"><strong>{action.count} student{action.count === 1 ? '' : 's'}</strong> will move from Semester {action.fromSemester} to Semester {action.fromSemester + 1}.</div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Assessment history, learning progress, accounts, and coordinator assignments remain unchanged.</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 dark:border-white/10 dark:text-slate-300">Cancel</button><button type="button" onClick={onConfirm} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{loading ? 'Promoting...' : 'Confirm promotion'}</button></div>
      </motion.div>
    </div>
  );
}

export default function StudentPromotion() {
  const toast = useToast();
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const loadSemesters = async () => {
    const data = await api.listPromotionSemesters();
    setSemesters(data.semesters || []);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listPromotionSemesters()
      .then((data) => { if (active) setSemesters(data.semesters || []); })
      .catch((error) => { if (active) toast.error(error.message || 'Failed to load semesters.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  const openSemester = async (semester) => {
    setSelectedSemester(semester);
    setSelectedIds([]);
    setQuery('');
    setStudentsLoading(true);
    try {
      const data = await api.listPromotionStudents(semester);
      setStudents(data.students || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load students.');
    } finally {
      setStudentsLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return students;
    return students.filter((student) => [student.name, student.email, student.studentId, student.course, student.branch, student.college]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(text)));
  }, [students, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every((student) => selectedSet.has(String(student._id)));
  const toggleAllVisible = () => {
    const visibleIds = filteredStudents.map((student) => String(student._id));
    setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  };

  const requestPromotion = ({ promoteAll = false, ids = selectedIds } = {}) => {
    if (!selectedSemester || selectedSemester >= 8) return;
    const count = promoteAll ? students.length : ids.length;
    if (!count) { toast.error('Select at least one student.'); return; }
    setConfirmAction({ fromSemester: selectedSemester, promoteAll, studentIds: ids, count });
  };

  const confirmPromotion = async () => {
    if (!confirmAction) return;
    setPromoting(true);
    try {
      const result = await api.promoteStudents({
        fromSemester: confirmAction.fromSemester,
        promoteAll: confirmAction.promoteAll,
        studentIds: confirmAction.promoteAll ? [] : confirmAction.studentIds,
      });
      toast.success(`${result.promoted} student${result.promoted === 1 ? '' : 's'} promoted to Semester ${result.toSemester}.`);
      setConfirmAction(null);
      await Promise.all([loadSemesters(), openSemester(confirmAction.fromSemester)]);
    } catch (error) {
      toast.error(error.message || 'Student promotion failed.');
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6"><div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200"><GraduationCap className="h-3.5 w-3.5" />Academic progression</div><h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Promote Students</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">Open a semester, review its complete student roster, then promote individuals, selected students, or the whole semester by one level.</p></div>

        {loading ? <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-gray-900"><Loader2 className="h-8 w-8 animate-spin text-sky-600" /></div> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {semesters.map((item) => <button key={item.semester} type="button" onClick={() => openSemester(item.semester)} className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:bg-gray-900 ${selectedSemester === item.semester ? 'border-sky-400 ring-2 ring-sky-100 dark:ring-sky-400/10' : 'border-slate-200 dark:border-white/10'}`}><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 font-bold text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">S{item.semester}</div>{item.promotable ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">Promotable</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Final</span>}</div><h2 className="mt-4 text-lg font-bold text-slate-950 dark:text-white">Semester {item.semester}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{item.studentCount} registered student{item.studentCount === 1 ? '' : 's'}</p></button>)}
          </div>
        )}

        {selectedSemester && <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900"><div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Semester {selectedSemester} student roster</h2><p className="mt-1 text-sm text-slate-500">{students.length} students · {selectedIds.length} selected</p></div>{selectedSemester < 8 ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => requestPromotion()} disabled={!selectedIds.length} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 disabled:opacity-50">Promote selected</button><button type="button" onClick={() => requestPromotion({ promoteAll: true })} disabled={!students.length} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Users className="h-4 w-4" />Promote all to Semester {selectedSemester + 1}</button></div> : <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800">Final semester students cannot be promoted further.</div>}</div>
          <div className="border-b border-slate-100 p-4 dark:border-white/10"><div className="relative max-w-lg"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, ID, email, course, or branch..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-400 dark:border-white/10 dark:bg-gray-950 dark:text-white" /></div></div>
          {studentsLoading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-sky-600" /></div> : filteredStudents.length === 0 ? <div className="p-12 text-center"><Users className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-bold text-slate-700 dark:text-slate-200">No students found</p></div> : <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:bg-white/[0.03]"><tr><th className="px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={selectedSemester >= 8} /></th>{['Student', 'Student ID', 'Email', 'Course', 'Branch', 'College', 'Group', 'Action'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/10">{filteredStudents.map((student) => { const id = String(student._id); return <tr key={id} className="hover:bg-sky-50/50 dark:hover:bg-sky-400/5"><td className="px-4 py-3"><input type="checkbox" checked={selectedSet.has(id)} disabled={selectedSemester >= 8} onChange={() => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} /></td><td className="px-4 py-3"><div className="font-bold text-slate-950 dark:text-white">{student.name || 'Unnamed'}</div></td><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{student.studentId || '-'}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{student.email || '-'}</td><td className="px-4 py-3 text-slate-500">{student.course || '-'}</td><td className="px-4 py-3 text-slate-500">{student.branch || '-'}</td><td className="px-4 py-3 text-slate-500">{student.college || '-'}</td><td className="px-4 py-3 text-slate-500">{student.group || '-'}</td><td className="px-4 py-3">{selectedSemester < 8 ? <button type="button" onClick={() => requestPromotion({ ids: [id] })} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50">Promote <ArrowRight className="h-3.5 w-3.5" /></button> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}</td></tr>; })}</tbody></table></div>}
        </section>}
      </div>
      <PromotionConfirm action={confirmAction} onClose={() => setConfirmAction(null)} onConfirm={confirmPromotion} loading={promoting} />
    </div>
  );
}
