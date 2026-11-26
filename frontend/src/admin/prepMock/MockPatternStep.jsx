// Prep Mock builder, Pattern step: the exam pattern students read before they start, written per
// company + role like a test paper (S.No · Section · Type · Questions · Duration · Marks) and
// versioned by the month/year the company used it. The admin picks a version or writes one.
// Display only: it does not have to match the questions (the Questions step shows soft warnings).
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, CopyPlus, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api';
import MockPatternTable from '../../features/prepMock/MockPatternTable';
import {
  PATTERN_MONTHS,
  PATTERN_TYPES,
  blankPatternRow,
  formatPatternFrom,
  isFuturePatternMonth,
  patternCopy,
  patternDraftBody,
  patternDraftProblems,
  patternRowsFromSections,
  patternWarnings,
  patternYears,
  sectionTypeLabel,
  writtenPattern,
} from '../../features/prepMock/patternModel';

const field = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-sky-950';
const numberField = `${field} text-right tabular-nums`;
const ghostButton = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800';
const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200';

const sameText = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();

let rowSeed = 0;
const withKey = (row) => ({ ...row, key: `row-${(rowSeed += 1)}` });

function createDraft(rows = []) {
  return {
    mode: 'create',
    id: null,
    patternFrom: { month: '', year: '' },
    rows: (rows.length ? rows : [blankPatternRow('mcq')]).map(withKey),
    notes: '',
    mocks: 0,
  };
}

function editDraft(pattern, mode = 'edit') {
  return {
    mode,
    id: mode === 'edit' ? String(pattern._id) : null,
    patternFrom: mode === 'edit' ? { month: pattern.patternFrom?.month || '', year: pattern.patternFrom?.year || '' } : { month: '', year: '' },
    rows: (pattern.rows || []).map((row) => withKey({ name: row.name, type: row.type, questions: row.questions, minutes: row.minutes || '', marks: row.marks })),
    notes: pattern.notes || '',
    mocks: mode === 'edit' ? Number(pattern.mocks) || 0 : 0,
    label: formatPatternFrom(pattern.patternFrom, { long: true }),
  };
}

function PatternCard({ pattern, active, readOnly, onSelect, onEdit, onCopy, onDelete, confirmingDelete, deleting, onCancelDelete }) {
  const { rows, totals } = writtenPattern(pattern);
  const mocks = Number(pattern.mocks) || 0;
  const published = Number(pattern.published) || 0;
  return (
    <div className={`flex flex-col rounded-xl border transition ${active ? 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500 dark:border-sky-600 dark:bg-sky-950/25' : 'border-slate-200 bg-white hover:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-sky-800'}`}>
      <button type="button" onClick={onSelect} disabled={readOnly} aria-pressed={active} className="flex-1 rounded-t-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 disabled:cursor-default">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">OA pattern</span>
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{formatPatternFrom(pattern.patternFrom, { long: true }) || 'Month not set'}</span>
          </span>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-gray-600'}`} aria-hidden="true">{active && <Check className="h-3 w-3" />}</span>
        </span>
        <span className="mt-2 grid grid-cols-4 gap-1 text-center">
          {[[rows.length, 'Sections'], [totals.questions, 'Questions'], [totals.minutes || '–', 'Min'], [totals.marks, 'Marks']].map(([value, label]) => (
            <span key={label} className="rounded-md bg-slate-50 px-1 py-1 dark:bg-gray-800/70">
              <strong className="block text-xs tabular-nums text-slate-800 dark:text-gray-100">{value}</strong>
              <span className="block text-[9.5px] uppercase tracking-wide text-slate-400 dark:text-gray-500">{label}</span>
            </span>
          ))}
        </span>
        <span className="mt-2 block truncate text-[11px] text-slate-500 dark:text-gray-400">{rows.map((row) => row.name).join(' · ')}</span>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5 dark:border-gray-800">
        <span className="truncate text-[11px] text-slate-500 dark:text-gray-400">{mocks ? `Used by ${mocks} mock${mocks === 1 ? '' : 's'}${published ? ` · ${published} published` : ''}` : 'Not used yet'}</span>
        {!readOnly && (confirmingDelete ? (
          <span className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-300">Delete?</span>
            <button type="button" onClick={onDelete} disabled={deleting} className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-60">{deleting ? 'Deleting…' : 'Delete'}</button>
            <button type="button" onClick={onCancelDelete} disabled={deleting} className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800">Keep</button>
          </span>
        ) : (
          <span className="flex items-center">
            <button type="button" onClick={onEdit} className={iconButton} title="Edit this pattern" aria-label={`Edit pattern ${formatPatternFrom(pattern.patternFrom)}`}><Pencil className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={onCopy} className={iconButton} title="New version from this pattern" aria-label={`New version from pattern ${formatPatternFrom(pattern.patternFrom)}`}><CopyPlus className="h-3.5 w-3.5" /></button>
            {!mocks && <button type="button" onClick={onDelete} className={`${iconButton} hover:text-rose-600 dark:hover:text-rose-300`} title="Delete this pattern" aria-label={`Delete pattern ${formatPatternFrom(pattern.patternFrom)}`}><Trash2 className="h-3.5 w-3.5" /></button>}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MockPatternStep({ company, role, patternId, selected, onSelect, onEditBasics, sections = [], duration = 0, readOnly = false, notify }) {
  const ready = Boolean(String(company || '').trim() && String(role || '').trim());
  const [list, setList] = useState({ loading: ready, error: '', patterns: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState(null);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState('');
  const [serverError, setServerError] = useState('');
  const [confirmShared, setConfirmShared] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const autoOpenedRef = useRef('');
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    setList((previous) => ({ ...previous, loading: true, error: '' }));
    api.listMockPatterns({ company, role }).then((result) => {
      if (!active) return;
      const patterns = Array.isArray(result?.patterns) ? result.patterns : [];
      setList({ loading: false, error: '', patterns });
      // No pattern yet for this company + role: open the editor straight away (once).
      const key = `${company}|${role}`.toLowerCase();
      if (!patterns.length && !readOnly && autoOpenedRef.current !== key) {
        autoOpenedRef.current = key;
        setDraft((current) => current || createDraft(patternRowsFromSections(sectionsRef.current)));
      }
    }).catch((error) => {
      if (active) setList({ loading: false, error: error.message || 'Could not load the patterns.', patterns: [] });
    });
    return () => { active = false; };
  }, [company, role, ready, readOnly, reloadKey]);

  if (!ready) {
    return (
      <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-6 text-center dark:border-amber-900/60 dark:bg-amber-500/5">
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
        <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">Choose the company and role first</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-600 dark:text-gray-400">A pattern belongs to one company and role, for example Amazon · SDE 1. Go back to Basic details and choose both.</p>
        <button type="button" onClick={onEditBasics} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500"><ArrowLeft className="h-3.5 w-3.5" />Back to Basic details</button>
      </section>
    );
  }

  const selectedId = String(patternId || selected?.patternId || '');
  const selectedInList = list.patterns.some((pattern) => String(pattern._id) === selectedId);
  const selectedMismatch = selected && (!sameText(selected.company, company) || !sameText(selected.role, role));
  const problems = draft ? patternDraftProblems(draft) : [];
  const draftBody = draft ? patternDraftBody(draft) : null;
  const preview = draft
    ? { rows: draftBody.rows, patternFrom: draftBody.patternFrom.month && draftBody.patternFrom.year ? draftBody.patternFrom : null }
    : selected;
  const previewWarnings = preview && sections.length ? patternWarnings(preview, sections, duration) : [];
  const years = patternYears();
  if (draft?.patternFrom?.year && !years.includes(Number(draft.patternFrom.year))) years.push(Number(draft.patternFrom.year));
  const busy = Boolean(saving);

  const openDraft = (next) => {
    setDraft(next);
    setShowProblems(false);
    setServerError('');
    setConfirmShared(false);
  };
  const changeDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setConfirmShared(false);
    setServerError('');
  };
  const updateRow = (index, patch) => changeDraft({ rows: draft.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });
  const moveRow = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= draft.rows.length) return;
    const rows = [...draft.rows];
    [rows[index], rows[target]] = [rows[target], rows[index]];
    changeDraft({ rows });
  };

  const save = async (asNewVersion = false) => {
    if (!draft || busy) return;
    if (problems.length) {
      setShowProblems(true);
      return;
    }
    const editing = draft.mode === 'edit' && !asNewVersion;
    if (editing && draft.mocks > 0 && !confirmShared) {
      setConfirmShared(true);
      return;
    }
    setSaving(asNewVersion ? 'version' : 'save');
    setServerError('');
    try {
      const result = editing
        ? await api.updateMockPattern(draft.id, draftBody)
        : await api.createMockPattern({ ...draftBody, company, role });
      const pattern = result?.pattern;
      if (pattern && (!editing || !selectedId || String(pattern._id) === selectedId)) onSelect(patternCopy(pattern));
      if (editing) {
        const updated = Number(result?.mocksUpdated) || 0;
        notify?.success?.(updated ? `Pattern updated on ${updated} mock${updated === 1 ? '' : 's'}.` : 'Pattern updated.');
      } else {
        notify?.success?.(asNewVersion ? 'New pattern version saved and chosen for this mock.' : 'Pattern saved and chosen for this mock.');
      }
      setDraft(null);
      setShowProblems(false);
      setConfirmShared(false);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setServerError(error.message || 'Could not save the pattern.');
      setConfirmShared(false);
    } finally {
      setSaving('');
    }
  };

  const removePattern = async (pattern) => {
    const id = String(pattern._id);
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    try {
      await api.deleteMockPattern(id);
      if (id === selectedId) onSelect(null);
      notify?.success?.('Pattern deleted.');
      setReloadKey((value) => value + 1);
    } catch (error) {
      notify?.error?.(error.message || 'Could not delete the pattern.');
    } finally {
      setDeletingId('');
      setConfirmDeleteId('');
    }
  };

  const draftTotals = draft ? writtenPattern({ rows: draftBody.rows }).totals : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <div className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Exam pattern <span className="text-rose-500">*</span></h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
                Patterns of <strong className="font-semibold text-slate-700 dark:text-gray-200">{company} · {role}</strong>, one per OA month. Pick the one this mock follows, or write a new one.
              </p>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={list.loading} className={ghostButton} aria-label="Reload patterns"><RefreshCw className={`h-3.5 w-3.5 ${list.loading ? 'animate-spin' : ''}`} /></button>
                <button type="button" onClick={() => openDraft(createDraft(patternRowsFromSections(sections)))} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"><Plus className="h-3.5 w-3.5" />Create pattern</button>
              </div>
            )}
          </div>

          {selectedMismatch && (
            <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200">
              The chosen pattern is for {selected.company} · {selected.role}. Choose a pattern of {company} · {role}.
            </p>
          )}
          {list.error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300">{list.error}</p>}

          <div className="mt-3">
            {list.loading && !list.patterns.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((index) => <div key={index} className="h-36 animate-pulse rounded-xl bg-slate-100 dark:bg-gray-800" />)}
              </div>
            ) : list.patterns.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {list.patterns.map((pattern) => {
                  const id = String(pattern._id);
                  return (
                    <PatternCard
                      key={id}
                      pattern={pattern}
                      active={id === selectedId}
                      readOnly={readOnly}
                      onSelect={() => onSelect(patternCopy(pattern))}
                      onEdit={() => openDraft(editDraft(pattern, 'edit'))}
                      onCopy={() => openDraft(editDraft(pattern, 'copy'))}
                      onDelete={() => removePattern(pattern)}
                      onCancelDelete={() => setConfirmDeleteId('')}
                      confirmingDelete={confirmDeleteId === id}
                      deleting={deletingId === id}
                    />
                  );
                })}
              </div>
            ) : !list.error ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500 dark:border-gray-700 dark:text-gray-400">
                No pattern for {company} · {role} yet. {readOnly ? '' : 'Write the first one below.'}
              </p>
            ) : null}
            {selected && selectedId && !selectedInList && !list.loading && !selectedMismatch && (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-gray-400">This mock keeps its copy of the {formatPatternFrom(selected.patternFrom) || 'chosen'} pattern.</p>
            )}
          </div>
        </section>

        {draft && !readOnly && (
          <section aria-label={draft.mode === 'edit' ? 'Edit pattern' : 'New pattern'} className="rounded-2xl border border-sky-200 bg-white shadow-sm dark:border-sky-900/60 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-gray-800">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{draft.mode === 'edit' ? `Edit pattern · ${draft.label || ''}` : draft.mode === 'copy' ? `New version of ${draft.label || 'pattern'}` : 'New pattern'}</h3>
                <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-gray-400">{draft.mode === 'edit' && draft.mocks ? `Used by ${draft.mocks} mock${draft.mocks === 1 ? '' : 's'}: saving updates the pattern on all of them.` : `Write it like the exam paper of ${company} · ${role}.`}</p>
              </div>
              <button type="button" onClick={() => openDraft(null)} disabled={busy} aria-label="Close the pattern editor" className={iconButton}><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">OA pattern from: month <span className="text-rose-500">*</span></span>
                  <select value={draft.patternFrom.month || ''} onChange={(event) => changeDraft({ patternFrom: { ...draft.patternFrom, month: event.target.value ? Number(event.target.value) : '' } })} className={`${field} mt-1`}>
                    <option value="">Month</option>
                    {PATTERN_MONTHS.map((name, index) => (
                      <option key={name} value={index + 1} disabled={isFuturePatternMonth(index + 1, draft.patternFrom.year || new Date().getFullYear())}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">Year <span className="text-rose-500">*</span></span>
                  <select value={draft.patternFrom.year || ''} onChange={(event) => changeDraft({ patternFrom: { ...draft.patternFrom, year: event.target.value ? Number(event.target.value) : '' } })} className={`${field} mt-1`}>
                    <option value="">Year</option>
                    {years.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
                {sections.length > 0 && (
                  <button type="button" onClick={() => changeDraft({ rows: patternRowsFromSections(sections).map(withKey) })} className={`${ghostButton} h-9`} title="Replace the rows with this mock's sections">
                    <CopyPlus className="h-3.5 w-3.5" />From this mock's sections
                  </button>
                )}
              </div>
              <p className="-mt-1 text-[11px] text-slate-500 dark:text-gray-400">When the company used this pattern. Students see “{company} OA pattern · {formatPatternFrom(draft.patternFrom) || 'Mar 2025'}”.</p>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
                <table className="w-full min-w-[640px] border-collapse text-left" data-no-serial>
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:bg-gray-800/70 dark:text-gray-400">
                    <tr>
                      <th scope="col" className="w-10 px-2 py-2 text-center">S.No</th>
                      <th scope="col" className="px-2 py-2">Section</th>
                      <th scope="col" className="w-32 px-2 py-2">Type</th>
                      <th scope="col" className="w-24 px-2 py-2 text-right">Questions</th>
                      <th scope="col" className="w-28 px-2 py-2 text-right">Duration (min)</th>
                      <th scope="col" className="w-24 px-2 py-2 text-right">Marks</th>
                      <th scope="col" className="w-[6.5rem] px-2 py-2"><span className="sr-only">Row actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {draft.rows.map((row, index) => {
                      const nameMissing = showProblems && !String(row.name || '').trim();
                      return (
                        <tr key={row.key}>
                          <td className="px-2 py-1.5 text-center text-xs tabular-nums text-slate-500 dark:text-gray-400">{index + 1}</td>
                          <td className="px-2 py-1.5"><input value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} maxLength={80} placeholder="e.g. Aptitude" aria-label={`Section ${index + 1} name`} aria-invalid={nameMissing || undefined} className={`${field} ${nameMissing ? 'border-rose-400 dark:border-rose-700' : ''}`} /></td>
                          <td className="px-2 py-1.5">
                            <select value={row.type} onChange={(event) => updateRow(index, { type: event.target.value })} aria-label={`Section ${index + 1} type`} className={field}>
                              {PATTERN_TYPES.map((type) => <option key={type} value={type}>{sectionTypeLabel(type)}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5"><input type="number" min="0" max="500" inputMode="numeric" value={row.questions} onChange={(event) => updateRow(index, { questions: event.target.value })} aria-label={`Section ${index + 1} questions`} className={numberField} /></td>
                          <td className="px-2 py-1.5"><input type="number" min="0" max="1440" inputMode="numeric" value={row.minutes} onChange={(event) => updateRow(index, { minutes: event.target.value })} aria-label={`Section ${index + 1} duration in minutes`} className={numberField} /></td>
                          <td className="px-2 py-1.5"><input type="number" min="0" step="0.5" inputMode="decimal" value={row.marks} onChange={(event) => updateRow(index, { marks: event.target.value })} aria-label={`Section ${index + 1} marks`} className={numberField} /></td>
                          <td className="px-1 py-1.5">
                            <span className="flex items-center justify-end">
                              <button type="button" onClick={() => moveRow(index, -1)} disabled={index === 0} className={iconButton} aria-label={`Move section ${index + 1} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => moveRow(index, 1)} disabled={index === draft.rows.length - 1} className={iconButton} aria-label={`Move section ${index + 1} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => changeDraft({ rows: draft.rows.filter((_, rowIndex) => rowIndex !== index) })} disabled={draft.rows.length === 1} className={`${iconButton} hover:text-rose-600 dark:hover:text-rose-300`} aria-label={`Remove section ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50/80 text-sm font-semibold text-slate-900 dark:bg-gray-800/50 dark:text-white">
                    <tr>
                      <td className="px-2 py-2" />
                      <td className="px-2 py-2" colSpan={2}>Total</td>
                      <td className="py-2 pl-2 pr-[19px] text-right tabular-nums">{draftTotals.questions}</td>
                      <td className="py-2 pl-2 pr-[19px] text-right tabular-nums">{draftTotals.minutes || '–'}</td>
                      <td className="py-2 pl-2 pr-[19px] text-right tabular-nums">{draftTotals.marks}</td>
                      <td className="px-2 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button type="button" onClick={() => changeDraft({ rows: [...draft.rows, withKey(blankPatternRow())] })} disabled={draft.rows.length >= 30} className={ghostButton}><Plus className="h-3.5 w-3.5" />Add section</button>

              <label className="block">
                <span className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-gray-300">Notes <span className="text-[10px] font-medium text-slate-400">Optional · admins only</span></span>
                <textarea value={draft.notes} onChange={(event) => changeDraft({ notes: event.target.value })} maxLength={600} rows={2} placeholder="Source of this pattern, e.g. reported by 2025 candidates" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-sky-950" />
              </label>

              {showProblems && problems.length > 0 && (
                <ul role="alert" className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300">
                  {problems.map((problem) => <li key={problem}>{problem}</li>)}
                </ul>
              )}
              {serverError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300">{serverError}</p>}
              {confirmShared && (
                <div role="alertdialog" aria-label="Confirm pattern update" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />This updates the pattern shown on {draft.mocks} mock{draft.mocks === 1 ? '' : 's'}. To leave them as they are, save it as a new version instead.</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setConfirmShared(false)} className="rounded-md px-2 py-1 font-semibold hover:bg-amber-100 dark:hover:bg-amber-500/20">Cancel</button>
                    <button type="button" onClick={() => save(false)} disabled={busy} className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-500 disabled:opacity-60">Update {draft.mocks} mock{draft.mocks === 1 ? '' : 's'}</button>
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-gray-800">
                <button type="button" onClick={() => openDraft(null)} disabled={busy} className={ghostButton}>Cancel</button>
                {draft.mode === 'edit' && (
                  <button type="button" onClick={() => save(true)} disabled={busy} className={ghostButton} title="Keep the current pattern and save these rows as another month's version">
                    {saving === 'version' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}Save as new version
                  </button>
                )}
                <button type="button" onClick={() => save(false)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60">
                  {saving === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{draft.mode === 'edit' ? 'Save pattern' : 'Save and use'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      <aside className="min-w-0 space-y-3 lg:sticky lg:top-3" aria-label="Pattern preview">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-gray-500">{draft ? 'Preview while you edit' : 'Students see'}</p>
            {preview?.patternFrom && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{company} OA pattern · {formatPatternFrom(preview.patternFrom)}</span>}
          </div>
          {preview && writtenPattern(preview).rows.length ? (
            <MockPatternTable pattern={preview} caption={`${company} ${role} exam pattern`} />
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-gray-700 dark:text-gray-400">Choose or create a pattern to see the table students get before they start.</p>
          )}
        </section>
        {previewWarnings.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-500/5 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Differs from this mock's questions</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {previewWarnings.slice(0, 4).map((warning) => <li key={warning.message}>{warning.message}</li>)}
            </ul>
            {previewWarnings.length > 4 && <p className="mt-1 opacity-80">and {previewWarnings.length - 4} more.</p>}
            <p className="mt-1 opacity-80">This is allowed: the pattern is for students to read. It never blocks publishing.</p>
          </section>
        )}
      </aside>
    </div>
  );
}
