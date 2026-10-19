import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Search, X } from 'lucide-react';
import { api } from '../../../utils/api';
import { Button, Card, EmptyState, Notice, Pill, helper, inputClass } from '../ui';

function StudentPanel({ detail, onClose }) {
  const { student } = detail;
  return (
    <aside className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/30" aria-label="Student details">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-semibold text-slate-900 dark:text-white">{student.name || student.studentId}</p><p className={helper}>{[student.studentId, student.email, student.course, student.branch, student.semester && `Semester ${student.semester}`].filter(Boolean).join(' · ')}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-800" aria-label="Close details"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Assessments</p>
      {detail.assessments.length ? <ul className="mt-1 divide-y divide-slate-200 text-sm dark:divide-slate-700">{detail.assessments.map((row) => <li key={row._id} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{row.title}</span><span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">{row.score == null ? row.status : `${row.score}/${row.maxMarks ?? '—'}`}</span></li>)}</ul> : <p className={`mt-1 ${helper}`}>No assessment submissions.</p>}
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">AI interviews</p>
      {detail.interviewSessions.length ? <ul className="mt-1 space-y-1 text-sm">{detail.interviewSessions.map((row) => <li key={row._id} className="flex justify-between gap-3"><span>{row.status}</span><span className={helper}>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : ''}</span></li>)}</ul> : <p className={`mt-1 ${helper}`}>No interview sessions.</p>}
    </aside>
  );
}

/** Read-only view of this university's students, straight from its own database. Every view is logged. */
export default function StudentsTab({ university }) {
  const id = university.universityId;
  const [search, setSearch] = useState('');
  const [view, setView] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (page = 1, term = '') => {
    setLoading(true); setError('');
    try { setView(await api.platformStudents(id, page, term)); }
    catch (cause) { setView(null); setError(cause.message || 'Student records are unavailable.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(1, ''); }, [load]);

  async function open(studentId) {
    setError('');
    try { setDetail(await api.platformStudent(id, studentId)); }
    catch (cause) { setError(cause.message || 'Student details are unavailable.'); }
  }

  const pages = view ? Math.max(1, Math.ceil(view.total / view.pageSize)) : 1;
  return (
    <Card id="students-title" title="Students" icon={GraduationCap} description="Read-only, from this university's database. Students are created and edited by the university's own admins.">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void load(1, search); }}>
        <label className="relative min-w-[16rem] flex-1">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, student ID or email" />
        </label>
        <Button type="submit" variant="secondary" busy={loading}>Search</Button>
      </form>
      {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
      <div className={`mt-4 grid gap-4 ${detail ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
        <div className="min-w-0">
          {view && view.students.length === 0 ? <EmptyState icon={GraduationCap} title={search ? 'No student matches' : 'No students yet'}>{search ? 'Try another name or ID.' : 'The university admin adds students from its own portal.'}</EmptyState> : view && (
            <>
              <p className={helper}>{view.total.toLocaleString()} student{view.total === 1 ? '' : 's'}</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm" data-no-serial>
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800"><tr><th className="py-2 pr-3 font-semibold">Name</th><th className="py-2 pr-3 font-semibold">Student ID</th><th className="py-2 pr-3 font-semibold">Course</th><th className="py-2 pr-3 font-semibold">Status</th><th className="py-2" /></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {view.students.map((student) => (
                      <tr key={student._id} className={detail?.student?._id === student._id ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''}>
                        <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-white">{student.name || student.email}</td>
                        <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{student.studentId || '—'}</td>
                        <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{student.course || '—'}</td>
                        <td className="py-2.5 pr-3"><Pill tone={student.isActive === false ? 'neutral' : 'success'}>{student.isActive === false ? 'Inactive' : 'Active'}</Pill></td>
                        <td className="py-2.5 text-right"><button type="button" onClick={() => open(student._id)} className="rounded-lg px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40">View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Button variant="ghost" disabled={loading || view.page <= 1} onClick={() => load(view.page - 1, search)}>Previous</Button>
                <span className={helper}>Page {view.page} of {pages}</span>
                <Button variant="ghost" disabled={loading || view.page >= pages} onClick={() => load(view.page + 1, search)}>Next</Button>
              </div>
            </>
          )}
        </div>
        {detail && <StudentPanel detail={detail} onClose={() => setDetail(null)} />}
      </div>
    </Card>
  );
}
