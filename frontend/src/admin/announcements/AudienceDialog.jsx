import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Search, Trash2, Upload, UserCheck, Users, X,
} from 'lucide-react';
import { api } from '../../utils/api';
import StudentSelector from '../assessment/components/StudentSelector';
import {
  UPLOAD_STATUSES, UPLOAD_TEMPLATE_CSV, filterUploadRows, mergeStudents, problemRowsCsv, removeStudents, rowValue, searchStudents, uploadFilterOptions,
} from './audienceModel';

const button = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
const secondary = `${button} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200 dark:hover:bg-white/[0.05]`;
const primary = `${button} bg-sky-600 text-white hover:bg-sky-700`;
const control = 'h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200';
const ROWS_PER_PAGE = 50;
const SHOWN_SELECTED = 300;

const STATUS_TONE = {
  matched: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  not_found: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20',
  invalid: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
  duplicate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10',
};
const STATUS_TEXT = { matched: 'Registered', not_found: 'Not registered', invalid: 'Needs fixing', duplicate: 'Duplicate' };

function download(name, text) {
  // Byte-order mark first so Excel reads the file as UTF-8.
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Upload tab: template, drop zone, then the matched rows with filters and checkboxes. */
const DEFAULT_UPLOAD_HINT = 'Only students already registered on PeerPrep can see announcements. Rows that do not match are listed so you can fix and upload them again; nothing is saved until you publish.';

function UploadList({ selected, onChange, result, setResult, hint = DEFAULT_UPLOAD_HINT }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState('');
  const [view, setView] = useState({ status: 'all', query: '', semester: '', branch: '', college: '' });
  const [page, setPage] = useState(1);
  const selectedIds = useMemo(() => new Set(selected.map((student) => String(student._id))), [selected]);
  const rows = useMemo(() => result?.rows || [], [result]);
  const options = useMemo(() => uploadFilterOptions(rows), [rows]);
  const shown = useMemo(() => filterUploadRows(rows, view), [rows, view]);
  const pages = Math.max(1, Math.ceil(shown.length / ROWS_PER_PAGE));
  const pageRows = shown.slice((Math.min(page, pages) - 1) * ROWS_PER_PAGE, Math.min(page, pages) * ROWS_PER_PAGE);
  const shownMatched = shown.filter((row) => row.status === 'matched');
  const shownTicked = shownMatched.filter((row) => selectedIds.has(row.student._id)).length;
  const counts = result ? { all: result.totals.rows, matched: result.totals.matched, not_found: result.totals.notFound, invalid: result.totals.invalid, duplicate: result.totals.duplicate } : {};
  const setFilter = (key, value) => { setView((current) => ({ ...current, [key]: value })); setPage(1); };

  const upload = async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setError('Upload a .csv or .xlsx file. Download the template if you need one.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('The file must be 2 MB or smaller.'); return; }
    setBusy(true); setError(''); setNote('');
    try {
      const data = await api.uploadAnnouncementAudience(file);
      setResult(data);
      setView({ status: 'all', query: '', semester: '', branch: '', college: '' }); setPage(1);
      const matched = (data.rows || []).filter((row) => row.status === 'matched').map((row) => row.student);
      onChange(mergeStudents(selected, matched));
      setNote(matched.length
        ? `${matched.length.toLocaleString()} registered student${matched.length === 1 ? '' : 's'} from this file ${matched.length === 1 ? 'was' : 'were'} added to your selection. Untick anyone you don't want.`
        : 'No registered students were found in this file.');
    } catch (cause) {
      setError(cause.message || 'The file could not be read.');
    } finally { setBusy(false); }
  };

  const tickShown = (on) => {
    const students = shownMatched.map((row) => row.student);
    onChange(on ? mergeStudents(selected, students) : removeStudents(selected, students.map((student) => student._id)));
  };
  const toggle = (student) => onChange(selectedIds.has(student._id) ? removeStudents(selected, [student._id]) : mergeStudents(selected, [student]));

  if (!result) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Step 1</p>
            <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-white">Fill in the template</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">One student per row. Students are matched to registered PeerPrep accounts by email.</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px]">
              {['name', 'email'].map((key) => <span key={key} className="rounded-md bg-sky-50 px-2 py-0.5 font-mono font-semibold text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20">{key} · required</span>)}
              {['semester', 'college', 'branch'].map((key) => <span key={key} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{key} · optional</span>)}
            </div>
            <button type="button" className={`${secondary} mt-3`} onClick={() => download('announcement-students-template.csv', UPLOAD_TEMPLATE_CSV)}>
              <Download className="h-4 w-4" />Download CSV template
            </button>
          </div>
          <div
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${dragging ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-500/10' : 'border-slate-300 dark:border-gray-600'}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files?.[0]); }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Step 2</p>
            {busy ? <Loader2 className="mt-2 h-7 w-7 animate-spin text-sky-600" /> : <Upload className="mt-2 h-7 w-7 text-slate-400" />}
            <p className="mt-2 text-[14px] font-semibold text-slate-900 dark:text-white">{busy ? 'Checking your list…' : 'Drop the file here'}</p>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">CSV or Excel (.xlsx), up to 2 MB and 10,000 rows</p>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; upload(file); }} />
            <button type="button" className={`${primary} mt-3`} disabled={busy} onClick={() => inputRef.current?.click()}><FileSpreadsheet className="h-4 w-4" />Choose file</button>
          </div>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">{hint}</p>
        {error ? <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p> : null}
      </div>
    );
  }

  const problems = result.totals.rows - result.totals.matched;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-white"><FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" /><span className="truncate">{result.fileName}</span></span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">{result.totals.rows.toLocaleString()} rows</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {problems > 0 ? <button type="button" className={secondary} onClick={() => download('rows-to-fix.csv', problemRowsCsv(rows))}><Download className="h-4 w-4" />Rows to fix ({problems.toLocaleString()})</button> : null}
          <button type="button" className={secondary} onClick={() => { setResult(null); setNote(''); }}><Upload className="h-4 w-4" />Upload another file</button>
        </span>
      </div>
      {note ? <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{note}</p> : null}

      <div role="tablist" aria-label="Show rows" className="flex flex-wrap gap-1.5">
        {UPLOAD_STATUSES.filter((item) => item.key === 'all' || counts[item.key] > 0).map((item) => {
          const active = view.status === item.key;
          return (
            <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => setFilter('status', item.key)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ring-1 ring-inset transition ${active ? 'bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white' : item.key === 'all' ? 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-gray-900 dark:text-slate-200 dark:ring-gray-700' : STATUS_TONE[item.key]}`}>
              {item.label}<span className="tabular-nums opacity-80">{Number(counts[item.key] || 0).toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search the uploaded list</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={view.query} onChange={(event) => setFilter('query', event.target.value)} placeholder="Search name, email or ID" className={`${control} w-full pl-8`} />
        </label>
        {[['semester', 'All semesters', (value) => `Semester ${value}`], ['branch', 'All branches', (value) => value], ['college', 'All colleges', (value) => value]].map(([key, all, label]) => (
          options[key].length ? (
            <select key={key} value={view[key]} onChange={(event) => setFilter(key, event.target.value)} aria-label={`Filter by ${key}`} className={`${control} max-w-[180px]`}>
              <option value="">{all}</option>
              {options[key].map((value) => <option key={value} value={value}>{label(value)}</option>)}
            </select>
          ) : null
        ))}
        <button type="button" className={secondary} disabled={!shownMatched.length || shownTicked === shownMatched.length} onClick={() => tickShown(true)}>
          <UserCheck className="h-4 w-4" />Select {shownMatched.length === result.totals.matched ? 'all registered' : 'shown'} ({shownMatched.length.toLocaleString()})
        </button>
        {shownTicked > 0 ? <button type="button" className={secondary} onClick={() => tickShown(false)}>Unselect shown</button> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
        <table className="min-w-full text-left text-[12.5px]" data-no-serial>
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <input type="checkbox" aria-label="Select all shown registered students" disabled={!shownMatched.length}
                  checked={shownMatched.length > 0 && shownTicked === shownMatched.length}
                  ref={(node) => { if (node) node.indeterminate = shownTicked > 0 && shownTicked < shownMatched.length; }}
                  onChange={(event) => tickShown(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              </th>
              <th scope="col" className="px-2 py-2">Row</th>
              <th scope="col" className="px-2 py-2">Name</th>
              <th scope="col" className="px-2 py-2">Email</th>
              <th scope="col" className="hidden px-2 py-2 md:table-cell">Sem</th>
              <th scope="col" className="hidden px-2 py-2 md:table-cell">Branch</th>
              <th scope="col" className="hidden px-2 py-2 lg:table-cell">College</th>
              <th scope="col" className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {pageRows.length ? pageRows.map((row) => {
              const ticked = row.status === 'matched' && selectedIds.has(row.student._id);
              return (
                <tr key={row.row} className={ticked ? 'bg-sky-50/60 dark:bg-sky-500/[0.06]' : ''}>
                  <td className="px-3 py-2">
                    <input type="checkbox" disabled={row.status !== 'matched'} checked={ticked} onChange={() => toggle(row.student)}
                      aria-label={row.status === 'matched' ? `Select ${row.student.name}` : `Row ${row.row} cannot be selected`} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-30" />
                  </td>
                  <td className="px-2 py-2 tabular-nums text-slate-400">{row.row}</td>
                  <td className="max-w-[220px] px-2 py-2">
                    <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">{row.name || '—'}</span>
                    {row.nameDiffers ? <span className="block truncate text-[11px] text-amber-700 dark:text-amber-300" title="The name in the file is different from the registered name">Registered as {row.student.name}</span>
                      : row.student?.studentId ? <span className="block truncate text-[11px] text-slate-400">{row.student.studentId}</span> : null}
                  </td>
                  <td className="max-w-[240px] truncate px-2 py-2 text-slate-600 dark:text-slate-300">{row.email || '—'}</td>
                  <td className="hidden px-2 py-2 text-slate-600 md:table-cell dark:text-slate-300">{rowValue(row, 'semester') || '—'}</td>
                  <td className="hidden max-w-[140px] truncate px-2 py-2 text-slate-600 md:table-cell dark:text-slate-300">{rowValue(row, 'branch') || '—'}</td>
                  <td className="hidden max-w-[160px] truncate px-2 py-2 text-slate-600 lg:table-cell dark:text-slate-300">{rowValue(row, 'college') || '—'}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_TONE[row.status]}`}>{STATUS_TEXT[row.status]}</span>
                    {row.status !== 'matched' && row.reason ? <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{row.reason}</span> : null}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No rows match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-[12px] text-slate-500">
          <span>{((Math.min(page, pages) - 1) * ROWS_PER_PAGE) + 1}–{Math.min(Math.min(page, pages) * ROWS_PER_PAGE, shown.length)} of {shown.length.toLocaleString()}</span>
          <button type="button" aria-label="Previous page" className={`${secondary} h-8 w-8 px-0`} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="Next page" className={`${secondary} h-8 w-8 px-0`} disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
      ) : null}
    </div>
  );
}

/** Right side: everyone chosen so far, searchable, removable. */
function ChosenList({ selected, onChange, hiddenCount }) {
  const [query, setQuery] = useState('');
  const found = useMemo(() => searchStudents(selected, query), [query, selected]);
  return (
    <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 dark:border-gray-700" aria-label="Chosen students">
      <div className="border-b border-slate-200 p-3 dark:border-gray-700">
        <p className="flex items-center justify-between gap-2 text-[13px] font-semibold text-slate-900 dark:text-white">
          <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4 text-sky-600" />Chosen</span>
          <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11.5px] tabular-nums text-white">{selected.length.toLocaleString()}</span>
        </p>
        {hiddenCount > 0 ? <p className="mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">+ {hiddenCount.toLocaleString()} chosen by someone with wider access (not shown to you, kept as they are).</p> : null}
        {selected.length ? (
          <div className="mt-2 flex items-center gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Search chosen students</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chosen" className={`${control} w-full pl-8`} />
            </label>
            <button type="button" onClick={() => onChange([])} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" />Clear</button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!selected.length ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-slate-500 dark:text-slate-400"><Users className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-gray-600" />Nobody chosen yet. Tick students on the left or upload a list.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-800">
            {found.slice(0, SHOWN_SELECTED).map((student) => (
              <li key={student._id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{student.name || 'Unnamed student'}</span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{student.email || student.studentId || ''}</span>
                </span>
                <button type="button" aria-label={`Remove ${student.name}`} title="Remove" onClick={() => onChange(removeStudents(selected, [student._id]))}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
            {found.length > SHOWN_SELECTED ? <li className="px-3 py-2 text-[11.5px] text-slate-500">…and {(found.length - SHOWN_SELECTED).toLocaleString()} more. Search to find someone.</li> : null}
            {!found.length ? <li className="px-3 py-4 text-center text-[12px] text-slate-500">No chosen student matches.</li> : null}
          </ul>
        )}
      </div>
    </aside>
  );
}

/**
 * "Choose students" for an announcement: tick registered students (search + filters + select all
 * filtered) or upload a CSV/Excel list (name + email; semester, college, branch optional), see who
 * is chosen on the right, then confirm. Works on a copy: Cancel changes nothing.
 * Other pages reuse it (Prep Mock "Assign own students") with their own wording: `title`,
 * `subtitle`, `uploadHint`, `summary(count)` (footer text) and `doneLabel(count)`; every one
 * defaults to the announcement wording.
 */
export default function AudienceDialog({
  open, students = [], hiddenCount = 0, limit = 20000, onClose, onDone,
  title = 'Choose who sees this announcement',
  subtitle = 'Pick registered students, upload your own list, or both. Only the chosen students will see it.',
  uploadHint = DEFAULT_UPLOAD_HINT,
  summary = null,
  doneLabel = null,
  // Prep Mock on a university: list only the students uploaded for Prep Mock.
  prepMockOnly = false,
}) {
  const titleId = useId();
  const [tab, setTab] = useState('registered');
  const [draft, setDraft] = useState(students);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null);

  useEffect(() => { if (open) { setDraft(students); setBusy(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, open]);

  if (!open) return null;
  const over = draft.length + hiddenCount > limit;

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-2 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={close} />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950">
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-gray-700">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><Users className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
            <div role="tablist" aria-label="How to choose" className="inline-flex w-fit rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]">
              {[['registered', 'Registered students', Users], ['upload', 'Upload a list', FileSpreadsheet]].map(([key, label, Icon]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold transition-colors ${tab === key ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
                  <Icon className="h-3.5 w-3.5" />{label}{key === 'upload' && upload ? <span className="rounded-full bg-emerald-100 px-1.5 text-[10.5px] text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">{upload.totals.matched}</span> : null}
                </button>
              ))}
            </div>
            {tab === 'registered'
              ? <StudentSelector selected={draft} onChange={setDraft} onBusyChange={setBusy} selectAllMode="add" showSelectedList={false} prepMockOnly={prepMockOnly} />
              : <UploadList selected={draft} onChange={setDraft} result={upload} setResult={setUpload} hint={uploadHint} />}
          </div>
          <ChosenList selected={draft} onChange={setDraft} hiddenCount={hiddenCount} />
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-gray-700">
          <p className={`min-w-0 flex-1 text-[12.5px] ${over ? 'text-rose-600' : 'text-slate-600 dark:text-slate-300'}`}>
            {over ? <><AlertTriangle className="mr-1 inline h-4 w-4" />Up to {limit.toLocaleString()} students can be chosen. Use “All students” for more.</>
              : summary ? summary(draft.length + hiddenCount)
                : draft.length ? <>Only these <strong>{(draft.length + hiddenCount).toLocaleString()}</strong> student{draft.length + hiddenCount === 1 ? '' : 's'} will see this announcement.</>
                  : 'Choose at least one student.'}
          </p>
          <button type="button" className={secondary} onClick={close} disabled={busy}>Cancel</button>
          <button type="button" className={primary} disabled={busy || !draft.length || over} onClick={() => onDone(draft)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{doneLabel ? doneLabel(draft.length) : `Use ${draft.length.toLocaleString()} student${draft.length === 1 ? '' : 's'}`}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
