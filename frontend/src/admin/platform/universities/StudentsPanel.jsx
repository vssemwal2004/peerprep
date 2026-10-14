import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Search, Users } from 'lucide-react';
import { api } from '../../../utils/api';
import { Notice } from '../../quickprep/ui';
import { EmptyState } from './primitives';
import { formatDateTime } from './universityModel';
import { ghostButton, inputClass, primaryButton, secondaryButton } from './styles';

/**
 * Read-only student records fetched live from the university's own API. Mount with
 * `key={universityId}` so switching universities starts fresh.
 */
export default function StudentsPanel({ university }) {
  const universityId = university.universityId;
  const [view, setView] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const reachable = university.active && university.apiUrl;

  const load = useCallback(async (page = 1, term = '') => {
    setBusy('list');
    setError('');
    setDetail(null);
    try { setView(await api.platformStudents(universityId, page, term)); }
    catch (cause) { setView(null); setError(cause.message || 'University student records are unavailable.'); }
    finally { setBusy(''); }
  }, [universityId]);

  useEffect(() => { if (reachable) void load(1, ''); }, [reachable, load]);

  async function open(studentId) {
    setBusy(studentId);
    setError('');
    try { setDetail(await api.platformStudent(universityId, studentId)); }
    catch (cause) { setDetail(null); setError(cause.message || 'Student details are unavailable.'); }
    finally { setBusy(''); }
  }

  if (!reachable) {
    return <EmptyState icon={Users} title="Student records are not available">
      {university.active ? 'Add the University API URL on the Overview tab so this control plane can read its student records.' : 'Enable this university to read its student records.'}
      {' '}The last reported count is {university.usage?.students ?? 0}.
    </EmptyState>;
  }

  if (detail) {
    const student = detail.student;
    return <div className="space-y-4">
      <button type="button" className={ghostButton} onClick={() => setDetail(null)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to students</button>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#242424]">
        <h4 className="text-base font-semibold">{student.name || student.studentId || student.email}</h4>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[['Student ID', student.studentId], ['Email', student.email], ['Course', student.course], ['Branch', student.branch], ['Semester', student.semester], ['Status', student.isActive === false ? 'Inactive' : 'Active']].map(([label, value]) => <div key={label} className="min-w-0">
            <dt className="text-[12px] text-slate-500 dark:text-zinc-400">{label}</dt><dd className="mt-0.5 break-words font-medium [overflow-wrap:anywhere]">{value || '—'}</dd>
          </div>)}
        </dl>
      </div>
      <section>
        <h5 className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-zinc-200">Assessment results</h5>
        {detail.assessments.length ? <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-[#242424]">
          {detail.assessments.map((row) => <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{row.title}</span>
            <span className="text-[12.5px] text-slate-500 dark:text-zinc-400"><span className="capitalize">{row.status}</span> · {row.score == null ? 'No score yet' : `${row.score}/${row.maxMarks ?? '—'}`}</span>
          </li>)}
        </ul> : <p className="text-sm text-slate-500 dark:text-zinc-400">No assessment submissions.</p>}
      </section>
      <section>
        <h5 className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-zinc-200">AI interview status</h5>
        {detail.interviewSessions.length ? <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-[#242424]">
          {detail.interviewSessions.map((row) => <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="font-medium capitalize">{row.status || 'Status unavailable'}</span>
            <span className="text-[12.5px] text-slate-500 dark:text-zinc-400">{row.updatedAt ? formatDateTime(row.updatedAt) : 'No update time'}</span>
          </li>)}
        </ul> : <p className="text-sm text-slate-500 dark:text-zinc-400">No interview sessions found.</p>}
      </section>
    </div>;
  }

  const total = view?.total ?? 0;
  const page = view?.page ?? 1;
  const pageSize = view?.pageSize ?? 25;
  return <div className="space-y-3">
    <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Read-only data from the university's API. Every view is recorded in the audit log.</p>
    <form className="flex gap-2" role="search" onSubmit={(event) => { event.preventDefault(); load(1, search); }}>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search students</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, student ID or email" className={`${inputClass} py-2 pl-9`} />
      </label>
      <button className={`${primaryButton} py-2`} disabled={busy === 'list'}>Search</button>
    </form>
    {error && <Notice tone="error">{error} <button type="button" className="font-semibold underline" onClick={() => load(page, search)}>Retry</button></Notice>}
    {busy === 'list' && !view ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />)}</div>
      : view && <>
        <p className="text-sm font-medium" aria-live="polite">{total.toLocaleString()} student{total === 1 ? '' : 's'}</p>
        {view.students.length ? <ul className={`divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-[#242424] ${busy === 'list' ? 'opacity-60' : ''}`}>
          {view.students.map((student) => <li key={student._id}>
            <button type="button" onClick={() => open(student._id)} disabled={Boolean(busy)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 focus-visible:bg-sky-50 focus-visible:outline-none disabled:cursor-wait dark:hover:bg-zinc-800/60 dark:focus-visible:bg-zinc-800">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-zinc-50">{student.name || student.email}</span>
                <span className="block truncate text-[12px] text-slate-500 dark:text-zinc-400">{[student.studentId, student.course].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${student.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{student.isActive ? 'Active' : 'Inactive'}</span>
              {busy === student._id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" aria-label="Loading details" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
            </button>
          </li>)}
        </ul> : <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">No students match this search.</p>}
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={`${secondaryButton} px-3 py-2`} disabled={Boolean(busy) || page <= 1} onClick={() => load(page - 1, search)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button>
          <span className="text-[12.5px] text-slate-500 dark:text-zinc-400">Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
          <button type="button" className={`${secondaryButton} px-3 py-2`} disabled={Boolean(busy) || page * pageSize >= total} onClick={() => load(page + 1, search)}>Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </>}
  </div>;
}
