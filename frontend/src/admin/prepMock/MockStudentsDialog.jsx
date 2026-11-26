import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Info, Loader2, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { api } from '../../utils/api';
import AudienceDialog from '../announcements/AudienceDialog';
import { DialogFrame } from './PublishToggle';
import { DIALOG_BUTTONS as dialogButton, isLiveMock } from './mockAccessModel';

// ⋮ → "Assign own students" for one Prep Mock (Master Admin, platform only): PeerPrep's own
// students (university students get every live mock through their university's Prep Mock package),
// with a date-time window in which they see it. Adding uses the announcement student picker
// (registered list with filters, CSV/Excel upload, select all); the server turns Prep Mock on for
// anyone added who did not have it. Removing asks first and never turns Prep Mock off.

const SHOWN = 300;
const inputClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:focus:ring-sky-900/30';

/** ISO date → value for <input type="datetime-local"> (local time), '' when unset. */
export const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);
const formatWhen = (value) => (value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function Chip({ tone = 'slate', title, children }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  };
  return <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

/** Window summary for the header line: "Open now · until 30 Nov 2026, 6:00 pm" etc. */
export function windowText(window, now = Date.now()) {
  const start = window?.startTime ? new Date(window.startTime).getTime() : null;
  const end = window?.endTime ? new Date(window.endTime).getTime() : null;
  if (end && end <= now) return { tone: 'amber', text: `Closed on ${formatWhen(window.endTime)}` };
  if (start && start > now) return { tone: 'slate', text: `Opens ${formatWhen(window.startTime)}${end ? ` · until ${formatWhen(window.endTime)}` : ''}` };
  return { tone: 'emerald', text: end ? `Open now · until ${formatWhen(window.endTime)}` : 'Open now · no end date' };
}

/**
 * mode 'own': Master Admin's platform students (they see the mock only inside the window).
 * mode 'university': a university SPOC's Prep Mock students; every enrolled student still sees
 * every live mock, the assignment adds "Assigned by your college" with these dates.
 */
const MODES = {
  own: {
    load: (id) => api.getMockOwnStudents(id),
    save: (id, body) => api.changeMockOwnStudents(id, body),
    title: 'Assign own students',
    intro: "PeerPrep's own students (not university students: universities get every live mock through their Prep Mock package). Students you add get Prep Mock access turned on automatically.",
    windowTitle: 'When these students can see it',
    windowHint: 'Leave "From" empty to open it now, and "Until" empty to keep it open until you unpublish. An attempt that is running when the window closes ends then.',
    countLabel: 'own student',
    pickerSubtitle: 'Pick registered PeerPrep students, upload a CSV or Excel list, or both. Students who already have this mock are skipped.',
    prepMockOnly: false,
  },
  university: {
    load: (id) => api.getMockUniversityAssignment(id),
    save: (id, body) => api.changeMockUniversityAssignment(id, body),
    title: 'Assign students',
    intro: 'Your Prep Mock students. Everyone uploaded for Prep Mock can already open every live mock; the students you assign here see it as "Assigned by your college" with these dates.',
    windowTitle: 'When they should take it',
    windowHint: 'Students see "Assigned by your college" with these dates. Leave "Until" empty for no end date.',
    countLabel: 'assigned student',
    pickerSubtitle: 'Pick students uploaded for Prep Mock, or upload a CSV or Excel list. Students who are not uploaded for Prep Mock are skipped.',
    prepMockOnly: true,
  },
};

export default function MockStudentsDialog({ mock, onClose, onSaved, toast, mode = 'own' }) {
  const copy = MODES[mode] || MODES.own;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState([]);
  const [live, setLive] = useState(isLiveMock(mock));
  const [saved, setSaved] = useState({ startTime: null, endTime: null });
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [query, setQuery] = useState('');
  const [ticked, setTicked] = useState(() => new Set());
  const [pendingRemove, setPendingRemove] = useState(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await copy.load(mock._id);
      setStudents(response.students || []);
      setLive(Boolean(response.mock?.live ?? isLiveMock(mock)));
      setSaved(response.window || { startTime: null, endTime: null });
      setStart(toLocalInput(response.window?.startTime));
      setEnd(toLocalInput(response.window?.endTime));
      setTicked(new Set());
    } catch (cause) {
      setError(cause?.message || 'Students could not be loaded.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [mock._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => [student.name, student.email, student.studentId, student.branch, student.college, student.semester]
      .some((value) => String(value ?? '').toLowerCase().includes(term)));
  }, [students, query]);
  const allShownTicked = shown.length > 0 && shown.every((student) => ticked.has(student._id));
  const assignedIds = useMemo(() => new Set(students.map((student) => String(student._id))), [students]);
  const windowChanged = start !== toLocalInput(saved.startTime) || end !== toLocalInput(saved.endTime);
  const windowError = start && end && new Date(end) <= new Date(start) ? 'The end must be after the start.' : '';
  const status = windowText(saved);

  const toggle = (id) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const tickShown = (on) => setTicked((current) => {
    const next = new Set(current);
    shown.forEach((student) => (on ? next.add(student._id) : next.delete(student._id)));
    return next;
  });

  /** Saves student changes together with the window shown in the form. */
  const change = async (body, describe) => {
    if (windowError) { setActionError(windowError); return; }
    setBusy(true);
    setActionError('');
    try {
      const response = await copy.save(mock._id, { ...body, startTime: fromLocalInput(start), endTime: fromLocalInput(end) });
      const message = describe(response);
      setNotice(`${message}${response.added && !response.live ? ' Publish the mock so they can open it.' : ''}`);
      toast?.success(message);
      onSaved?.(response);
      setPendingRemove(null);
      await load();
    } catch (cause) {
      setActionError(cause?.message || 'Changes could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const addDescribe = (response) => {
    const parts = [`${response.added || 0} student${response.added === 1 ? '' : 's'} added`];
    if (response.prepMockTurnedOn) parts.push(`Prep Mock turned on for ${response.prepMockTurnedOn}`);
    if (response.notEnrolled) parts.push(`${response.notEnrolled} skipped (not uploaded for Prep Mock)`);
    if (response.notFound) parts.push(`${response.notFound} not found`);
    return `${parts.join(' · ')}.`;
  };
  const removeDescribe = (response) => `${response.removed || 0} student${response.removed === 1 ? '' : 's'} removed from this mock.`;
  const windowDescribe = () => 'Dates saved.';

  const onPicked = (chosen) => {
    const add = [...new Set(chosen.map((student) => String(student._id)))].filter((id) => !assignedIds.has(id));
    setPicker(false);
    if (!add.length) { setActionError('Everyone you chose already has this mock.'); return; }
    change({ add }, addDescribe);
  };

  const removing = pendingRemove || [];
  const removeNames = removing.map((id) => students.find((student) => student._id === id)?.name || 'student');

  return (
    <>
      <DialogFrame
        size="lg"
        icon={Users}
        title={copy.title}
        subtitle={<span className="block truncate">{mock.title || 'Untitled mock'}{mock.company ? ` · ${mock.company}` : ''}{mock.role ? ` · ${mock.role}` : ''}</span>}
        onClose={onClose}
        busy={busy}
        closeDisabled={picker}
        footer={<>
          <p className="min-w-0 flex-1 text-xs text-slate-500 dark:text-gray-400">{loading ? 'Loading…' : `${students.length.toLocaleString()} ${copy.countLabel}${students.length === 1 ? '' : 's'} for this mock`}</p>
          <button type="button" onClick={onClose} disabled={busy} className={dialogButton.secondary}>Close</button>
          <button type="button" onClick={() => { setActionError(''); setPicker(true); }} disabled={busy || loading || Boolean(error) || Boolean(windowError)} className={dialogButton.primary}><UserPlus className="h-3.5 w-3.5" />Add students</button>
        </>}
      >
        <div className="space-y-3 px-5 py-4">
          <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{copy.intro}
              {!live && <b className="font-semibold"> This mock is not live: they see it only after you publish it.</b>}</span>
          </p>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Loading students…</div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {error} <button type="button" onClick={load} className="ml-1 font-semibold underline">Try again</button>
            </div>
          ) : (
            <>
              <section aria-labelledby="own-window-title" className="rounded-xl border border-slate-200 p-3.5 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="own-window-title" className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white"><CalendarClock className="h-4 w-4 text-sky-600" />{copy.windowTitle}</h3>
                  <Chip tone={status.tone}>{status.text}</Chip>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-gray-300">From
                    <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} disabled={busy} className={`mt-1 ${inputClass}`} />
                  </label>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-gray-300">Until
                    <input type="datetime-local" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} disabled={busy} className={`mt-1 ${inputClass}`} />
                  </label>
                  <button type="button" onClick={() => change({}, windowDescribe)} disabled={busy || !windowChanged || Boolean(windowError)} className={dialogButton.secondary}>Save dates</button>
                </div>
                <p className={`mt-2 text-[11px] ${windowError ? 'text-rose-600' : 'text-slate-500 dark:text-gray-400'}`}>
                  {windowError || copy.windowHint}
                </p>
              </section>

              {students.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center dark:border-gray-700">
                  <Users className="h-7 w-7 text-slate-300 dark:text-gray-600" />
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">No students yet</p>
                  <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-gray-400">Add registered students one by one, select a filtered list, or upload a CSV or Excel file.</p>
                  <button type="button" onClick={() => setPicker(true)} disabled={Boolean(windowError)} className={`${dialogButton.primary} mt-4`}><UserPlus className="h-3.5 w-3.5" />Add students</button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative min-w-[200px] flex-1">
                      <span className="sr-only">Search students of this mock</span>
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, ID, branch" className={`pl-8 ${inputClass} h-8`} />
                    </label>
                    {ticked.size > 0 && (
                      <button type="button" onClick={() => setPendingRemove([...ticked])} disabled={busy}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-gray-950 dark:text-rose-300 dark:hover:bg-rose-950/30">
                        <UserMinus className="h-3.5 w-3.5" />Remove {ticked.size}
                      </button>
                    )}
                  </div>

                  {pendingRemove && (
                    <div role="alertdialog" aria-label="Confirm removal" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        Remove {removing.length === 1 ? <b>{removeNames[0]}</b> : <b>{removing.length} students</b>} from this mock? They lose access to it now. Prep Mock stays on for them and past attempts are kept.
                      </span>
                      <button type="button" onClick={() => setPendingRemove(null)} disabled={busy} className={dialogButton.secondary}>Cancel</button>
                      <button type="button" autoFocus onClick={() => change({ remove: removing }, removeDescribe)} disabled={busy} className={dialogButton.warning}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Remove</button>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-800">
                    <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                      <input type="checkbox" aria-label="Tick every shown student" disabled={!shown.length} checked={allShownTicked}
                        ref={(node) => { if (node) node.indeterminate = !allShownTicked && shown.some((student) => ticked.has(student._id)); }}
                        onChange={(event) => tickShown(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                      <span className="flex-1">Student</span>
                      <span className="hidden w-40 md:block">Branch · Semester</span>
                      <span className="w-24 text-right">Prep Mock</span>
                      <span className="w-7" />
                    </div>
                    <ul className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto dark:divide-gray-800">
                      {shown.length === 0 && <li className="px-3 py-8 text-center text-xs text-slate-500 dark:text-gray-400">No student matches “{query}”.</li>}
                      {shown.slice(0, SHOWN).map((student) => (
                        <li key={student._id} className={`flex items-center gap-3 px-3 py-2 ${ticked.has(student._id) ? 'bg-sky-50/50 dark:bg-sky-500/[0.05]' : ''}`}>
                          <input type="checkbox" checked={ticked.has(student._id)} onChange={() => toggle(student._id)} aria-label={`Select ${student.name || student.email}`} className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-white">{student.name || 'Unnamed student'}</span>
                            <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{[student.email, student.studentId].filter(Boolean).join(' · ') || '—'}</span>
                          </span>
                          <span className="hidden w-40 truncate text-[11px] text-slate-500 md:block dark:text-gray-400">{[student.branch, student.semester ? `Sem ${student.semester}` : ''].filter(Boolean).join(' · ') || '—'}</span>
                          <span className="flex w-24 justify-end">{student.prepMockOn ? <Chip tone="emerald">On</Chip> : <Chip tone="amber" title="Prep Mock is off for this student: they cannot see any mock">Off</Chip>}</span>
                          <button type="button" onClick={() => setPendingRemove([student._id])} disabled={busy} aria-label={`Remove ${student.name || student.email}`} title="Remove from this mock"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
                        </li>
                      ))}
                      {shown.length > SHOWN && <li className="px-3 py-2 text-[11px] text-slate-500 dark:text-gray-400">…and {(shown.length - SHOWN).toLocaleString()} more. Search to find someone.</li>}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}

          {actionError && <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{actionError}</p>}
          {notice && !actionError && (
            <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</p>
          )}
        </div>
      </DialogFrame>

      <AudienceDialog
        open={picker}
        students={[]}
        onClose={() => setPicker(false)}
        onDone={onPicked}
        title={copy.title}
        subtitle={copy.pickerSubtitle}
        prepMockOnly={copy.prepMockOnly}
        uploadHint="Students are matched to registered PeerPrep accounts by email. Rows that do not match are listed so you can fix and upload them again; nothing is saved until you press Add."
        summary={(count) => (count ? <><strong>{count.toLocaleString()}</strong> student{count === 1 ? '' : 's'} chosen. They see the mock in the dates set above; Prep Mock access is turned on for anyone who does not have it.</> : 'Choose at least one student.')}
        doneLabel={(count) => `Add ${count.toLocaleString()} student${count === 1 ? '' : 's'}`}
      />
    </>
  );
}
