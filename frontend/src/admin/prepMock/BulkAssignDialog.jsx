import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ChevronDown, ClipboardList, Info, Loader2, RotateCcw, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { api } from '../../utils/api';
import AudienceDialog from '../announcements/AudienceDialog';
import { DialogFrame } from './PublishToggle';
import {
  BULK_LIMITS, DIALOG_BUTTONS as dialogButton, EMPTY_ASSIGN_RESULT, assignSummary, isLiveMock, mergeAssignResult,
  planAssignBatches, publishStateOf, runBatches, windowError as windowErrorOf,
} from './mockAccessModel';

// Bulk "own students" for many Prep Mocks at once (Master Admin, platform only). Opened from the
// bulk bar (selected mocks), the global ⋮ (every mock), a company ⋮ or a role ⋮. Flow:
//   form    — which mocks (listed), which students (announcement picker), the window, and whether
//             students already on those mocks get the new dates too;
//   confirm — one summary of exactly what will be written;
//   running — batches sent one by one within the server caps (mocks, students, mock × student pairs);
//   result  — granted / updated / removed / Prep Mock turned on / not found, and a row per mock.
// mode 'remove' drops the chosen students' grants on those mocks (Prep Mock stays on for them).

const SHOWN_MOCKS = 200;
const SHOWN_RESULTS = 300;
const inputClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:focus:ring-sky-900/30';
const sectionClass = 'rounded-xl border border-slate-200 p-3.5 dark:border-gray-800';
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);
const formatWhen = (value) => (value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const plural = (number, word, many = `${word}s`) => `${Number(number || 0).toLocaleString()} ${number === 1 ? word : many}`;

const STATE_CHIP = {
  live: ['Live', 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30'],
  hidden: ['Hidden', 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30'],
  ready: ['Ready', 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30'],
  draft: ['Draft', 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700'],
};

export function StateChip({ mock }) {
  const [label, tone] = STATE_CHIP[publishStateOf(mock)] || STATE_CHIP.draft;
  return <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset ${tone}`}>{label}</span>;
}

/** Collapsible list of the mocks a bulk action targets (titles, company · role, publish state). */
export function TargetMocks({ title, mocks, note }) {
  const [open, setOpen] = useState(false);
  const live = mocks.filter(isLiveMock).length;
  return (
    <section aria-label="Mocks" className={sectionClass}>
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white" title={title}>{title}</p>
          <p className="text-[11px] text-slate-500 dark:text-gray-400">{plural(mocks.length, 'mock')} · {live.toLocaleString()} live · {(mocks.length - live).toLocaleString()} not live{note ? ` · ${note}` : ''}</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} disabled={!mocks.length}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 dark:text-sky-300 dark:hover:bg-sky-500/10">
          {open ? 'Hide mocks' : 'Show mocks'}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul className="mt-2.5 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100 dark:divide-gray-800 dark:border-gray-800">
          {mocks.slice(0, SHOWN_MOCKS).map((mock) => (
            <li key={mock._id} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-800 dark:text-gray-100">{mock.title || 'Untitled mock'}</span>
                <span className="block truncate text-[10.5px] text-slate-500 dark:text-gray-400">{[mock.company, mock.role].filter(Boolean).join(' · ') || 'No company or role'}</span>
              </span>
              <StateChip mock={mock} />
            </li>
          ))}
          {mocks.length > SHOWN_MOCKS && <li className="px-2.5 py-1.5 text-[11px] text-slate-500 dark:text-gray-400">…and {(mocks.length - SHOWN_MOCKS).toLocaleString()} more</li>}
        </ul>
      )}
    </section>
  );
}

/** One number in a result panel. */
export function ResultTile({ label, value, tone = 'slate', hint }) {
  const tones = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    sky: 'text-sky-700 dark:text-sky-300',
    amber: 'text-amber-700 dark:text-amber-300',
    rose: 'text-rose-700 dark:text-rose-300',
  };
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950" title={hint}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-gray-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tones[tone] || tones.slate}`}>{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

/** Progress while batches are sent. */
export function BatchProgress({ progress, label }) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-sky-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      {progress.total > 1 && <>
        <div className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
          <div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-slate-500 dark:text-gray-400">Part {Math.min(progress.done + 1, progress.total)} of {progress.total}. Keep this window open.</p>
      </>}
    </div>
  );
}

/**
 * target: { title: 'All 4 Google mocks', mocks: [mock] } — already resolved to the exact mocks.
 * mode: 'assign' | 'remove'. onDone(result) runs once after anything was saved (refresh the list).
 */
export default function BulkAssignDialog(props) {
  return props.target ? <BulkAssignFlow {...props} /> : null;
}

function BulkAssignFlow({ target, mode = 'assign', onClose, onDone, toast }) {
  const removing = mode === 'remove';
  const [step, setStep] = useState('form');
  const [students, setStudents] = useState([]);
  const [picker, setPicker] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [onlyLive, setOnlyLive] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);
  const [formError, setFormError] = useState('');

  const allMocks = target.mocks;
  const liveCount = useMemo(() => allMocks.filter(isLiveMock).length, [allMocks]);
  const mixed = !removing && liveCount > 0 && liveCount < allMocks.length;
  const mocks = useMemo(() => (mixed && onlyLive ? allMocks.filter(isLiveMock) : allMocks), [allMocks, mixed, onlyLive]);
  const titleById = useMemo(() => new Map(allMocks.map((mock) => [String(mock._id), mock.title || 'Untitled mock'])), [allMocks]);
  const dateError = removing ? '' : windowErrorOf(start, end);
  const studentIds = useMemo(() => [...new Set(students.map((student) => String(student._id)))], [students]);

  let plan = [];
  let planError = '';
  try { plan = planAssignBatches(mocks.map((mock) => mock._id), studentIds.length, BULK_LIMITS); } catch (cause) { planError = cause.message; }

  const nothingToDo = removing ? !studentIds.length : !studentIds.length && !updateExisting;
  const blocker = !mocks.length ? 'There are no mocks to change.'
    : planError || dateError
      || (nothingToDo ? (removing ? 'Choose the students to remove.' : 'Choose students, or tick “Also change the dates” to update students already assigned.') : '');
  const summary = assignSummary({ mode, students: studentIds.length, mocks: mocks.length, updateExisting });
  const busy = step === 'running';

  const run = async (batches, previous = EMPTY_ASSIGN_RESULT) => {
    setStep('running');
    setProgress({ done: 0, total: batches.length });
    const body = {
      add: removing ? [] : studentIds,
      remove: removing ? studentIds : [],
      startTime: removing ? null : fromLocalInput(start),
      endTime: removing ? null : fromLocalInput(end),
      updateExisting: !removing && updateExisting,
    };
    const response = await runBatches(
      batches,
      (mockIds) => api.bulkMockOwnStudents({ ...body, scope: { mockIds } }),
      mergeAssignResult,
      previous,
      setProgress,
    );
    setOutcome(response);
    setStep('result');
    if (response.done > 0) onDone?.(response.result);
    const { result } = response;
    if (response.error) toast?.error(response.error?.message || 'Some changes could not be saved.');
    else if (result.skipped.length || result.missingMocks.length || result.notFound || result.prepMockActivationFailed) toast?.warning('Some assignments need attention. Review the results.');
    else if (removing) toast?.success(`${plural(result.removed, 'grant')} removed across ${plural(result.mocks, 'mock')}.`);
    else toast?.success(`${plural(result.granted, 'student grant')} added${result.updated ? `, ${result.updated.toLocaleString()} updated` : ''} across ${plural(result.mocks, 'mock')}.`);
  };

  const onPicked = (chosen) => {
    setPicker(false);
    setFormError('');
    setStudents(chosen);
  };

  const review = () => {
    if (blocker) { setFormError(blocker); return; }
    setFormError('');
    setStep('confirm');
  };

  const result = outcome?.result || EMPTY_ASSIGN_RESULT;
  const hasIssues = result.skipped.length > 0 || result.missingMocks.length > 0 || result.notFound > 0 || result.prepMockActivationFailed;
  const perMock = useMemo(() => [...(outcome?.result?.perMock || [])]
    .map((row) => ({ ...row, title: row.title || titleById.get(String(row._id)) || 'Untitled mock' }))
    .sort((left, right) => String(left.title).localeCompare(String(right.title))), [outcome, titleById]);
  const windowLine = !start && !end ? 'Open now, no end date'
    : `${start ? `From ${formatWhen(fromLocalInput(start))}` : 'Open now'}${end ? ` until ${formatWhen(fromLocalInput(end))}` : ', no end date'}`;

  let body;
  let footer;
  if (step === 'running') {
    body = <BatchProgress progress={progress} label={removing ? 'Removing students…' : 'Assigning students…'} />;
    footer = <p className="min-w-0 flex-1 text-xs text-slate-500 dark:text-gray-400">{summary}</p>;
  } else if (step === 'result') {
    const columns = removing ? [['removed', 'Removed']] : [['granted', 'Added'], ['updated', 'Dates changed']];
    body = (
      <div className="space-y-3 px-5 py-4">
        {outcome?.error ? (
          <div role="alert" className="flex flex-wrap items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {outcome.done > 0 ? `Completed ${outcome.done} of ${outcome.done + outcome.remaining.length} parts in this run. ` : ''}The remaining changes could not be confirmed.{' '}
              {outcome.error?.message || 'The request failed.'}
            </span>
            <button type="button" onClick={() => run(outcome.remaining, outcome.result)} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 dark:bg-gray-900 dark:text-rose-300 dark:ring-rose-900">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />{outcome.done > 0 ? 'Retry the rest' : 'Try again'}
            </button>
          </div>
        ) : hasIssues ? (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />The results below show which assignments were changed and which need attention.
          </p>
        ) : (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {removing ? `Done. Removed students lose access to these mocks now; Prep Mock stays on for them.` : `Done. ${result.updated || updateExisting ? 'Students see the mocks in their own dates.' : 'New students see the mocks in the dates you set.'}${liveCount < mocks.length ? ' Drafts open for them once you publish.' : ''}`}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ResultTile label="Mocks" value={result.mocks} />
          {removing ? <ResultTile label="Removed" value={result.removed} tone="amber" hint="Student grants removed" />
            : <>
              <ResultTile label="Added" value={result.granted} tone="emerald" hint="New student grants (student × mock)" />
              <ResultTile label="Dates changed" value={result.updated} tone="sky" hint="Students already on a mock whose dates were changed" />
            </>}
          {!removing && <ResultTile label="Prep Mock turned on" value={result.prepMockTurnedOn} tone="emerald" hint="Students who did not have Prep Mock access before" />}
          <ResultTile label="Students not found" value={result.notFound} tone={result.notFound ? 'rose' : 'slate'} hint="Not a PeerPrep (platform) student, or the account no longer exists" />
        </div>
        {result.missingMocks.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{plural(result.missingMocks.length, 'mock was', 'mocks were')} not found (deleted since the list loaded) and skipped.
          </p>
        )}
        {result.prepMockActivationFailed && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />The listed mock grants were saved. Prep Mock access could not be confirmed for some students. Assigning the same students again retries activation.
          </p>
        )}
        {result.skipped.length > 0 && (
          <section aria-label="Skipped mocks" className="overflow-hidden rounded-xl border border-amber-200 dark:border-amber-500/30">
            <h3 className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">{plural(result.skipped.length, 'mock')} skipped</h3>
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto dark:divide-gray-800">
              {result.skipped.slice(0, SHOWN_RESULTS).map((row) => (
                <li key={row._id} className="px-3 py-2 text-xs">
                  <p className="font-semibold text-slate-800 dark:text-gray-100">{row.title || titleById.get(String(row._id)) || 'Untitled mock'}</p>
                  <p className="mt-0.5 text-slate-500 dark:text-gray-400">{row.reason || 'Could not change this mock.'}</p>
                </li>
              ))}
              {result.skipped.length > SHOWN_RESULTS && <li className="px-3 py-2 text-xs text-slate-500 dark:text-gray-400">{plural(result.skipped.length - SHOWN_RESULTS, 'additional mock')} skipped</li>}
            </ul>
          </section>
        )}
        {perMock.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-800">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
              <span className="flex-1">Mock</span>
              {columns.map(([key, label]) => <span key={key} className="w-20 text-right sm:w-24">{label}</span>)}
            </div>
            <ul className="max-h-[36vh] divide-y divide-slate-100 overflow-y-auto dark:divide-gray-800">
              {perMock.slice(0, SHOWN_RESULTS).map((row) => (
                <li key={row._id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-gray-100" title={row.title}>{row.title}</span>
                  {columns.map(([key]) => <span key={key} className={`w-20 text-right tabular-nums sm:w-24 ${Number(row[key]) ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-400 dark:text-gray-500'}`}>{Number(row[key] || 0).toLocaleString()}</span>)}
                </li>
              ))}
              {perMock.length > SHOWN_RESULTS && <li className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-gray-400">…and {(perMock.length - SHOWN_RESULTS).toLocaleString()} more mocks</li>}
            </ul>
          </div>
        )}
      </div>
    );
    footer = <>
      <span className="min-w-0 flex-1" />
      {!outcome?.error && <button type="button" onClick={() => { setStudents([]); setOutcome(null); setStep('form'); }} className={dialogButton.secondary}>{removing ? 'Remove more' : 'Assign more'}</button>}
      <button type="button" data-close onClick={onClose} className={dialogButton.primary}>Close</button>
    </>;
  } else if (step === 'confirm') {
    body = (
      <div className="space-y-3 px-5 py-4">
        <div role="group" aria-label="Summary" className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/60">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{summary}?</p>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[140px_minmax(0,1fr)]">
            <dt className="font-semibold text-slate-500 dark:text-gray-400">Mocks</dt>
            <dd className="text-slate-800 dark:text-gray-100">{target.title}{mocks.length !== allMocks.length ? ` (only the ${mocks.length.toLocaleString()} live)` : ''}</dd>
            <dt className="font-semibold text-slate-500 dark:text-gray-400">Students</dt>
            <dd className="text-slate-800 dark:text-gray-100">{studentIds.length ? `${plural(studentIds.length, 'student')}${removing ? '' : ' (Prep Mock is turned on for anyone without it)'}` : 'No new students'}</dd>
            {!removing && <>
              <dt className="font-semibold text-slate-500 dark:text-gray-400">Dates</dt>
              <dd className="text-slate-800 dark:text-gray-100">{windowLine}</dd>
              <dt className="font-semibold text-slate-500 dark:text-gray-400">Already assigned</dt>
              <dd className="text-slate-800 dark:text-gray-100">{updateExisting ? 'Get these dates too (their own dates are replaced)' : 'Keep their own dates'}</dd>
            </>}
            {plan.length > 1 && <>
              <dt className="font-semibold text-slate-500 dark:text-gray-400">Sent as</dt>
              <dd className="text-slate-800 dark:text-gray-100">{plan.length} parts, one after another</dd>
            </>}
          </dl>
        </div>
        {removing ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />They lose access to these mocks now (an attempt in progress ends). Prep Mock stays on for them; past attempts and reports are kept. Students who are not on a mock are skipped.
          </p>
        ) : updateExisting && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Every student already on these mocks gets these dates, replacing their own. An attempt that is running when a window closes ends then.
          </p>
        )}
      </div>
    );
    footer = <>
      <button type="button" onClick={() => setStep('form')} className={dialogButton.secondary}><ArrowLeft className="h-3.5 w-3.5" />Back</button>
      <span className="min-w-0 flex-1" />
      <button type="button" data-confirm onClick={() => run(plan)} className={removing ? dialogButton.warning : dialogButton.primary}>
        {removing ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}Confirm
      </button>
    </>;
  } else {
    const preview = students.slice(0, 6);
    body = (
      <div className="space-y-3 px-5 py-4">
        <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{removing
            ? "Removes PeerPrep's own students from every mock listed below. University students are not affected: they get live mocks through their university's Prep Mock package."
            : "PeerPrep's own students (not university students). Each student gets their own dates on each mock; students you add get Prep Mock access turned on automatically."}</span>
        </p>

        <TargetMocks title={target.title} mocks={mocks} />
        {mixed && (
          <label className="flex items-start gap-2 px-1 text-xs text-slate-700 dark:text-gray-200">
            <input type="checkbox" checked={onlyLive} onChange={(event) => setOnlyLive(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
            <span>Only the {liveCount.toLocaleString()} live mocks <span className="text-slate-500 dark:text-gray-400">({(allMocks.length - liveCount).toLocaleString()} not live: students would see them only after you publish)</span></span>
          </label>
        )}

        <section aria-labelledby="bulk-students-title" className={sectionClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="bulk-students-title" className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white"><Users className="h-4 w-4 text-sky-600" aria-hidden="true" />{removing ? 'Students to remove' : 'Students to add'}</h3>
            {students.length > 0 && <span className="flex gap-1.5">
              <button type="button" onClick={() => setPicker(true)} className={dialogButton.secondary}>Change</button>
              <button type="button" onClick={() => setStudents([])} aria-label="Clear chosen students" className={dialogButton.secondary}><X className="h-3.5 w-3.5" /></button>
            </span>}
          </div>
          {students.length === 0 ? (
            <div className="mt-3 flex flex-col items-center rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center dark:border-gray-700">
              <p className="text-xs text-slate-500 dark:text-gray-400">{removing ? 'Pick the students to take off these mocks.' : 'Pick registered students, a filtered list, or upload a CSV or Excel file.'}</p>
              <button type="button" onClick={() => setPicker(true)} className={`${dialogButton.primary} mt-3`}>{removing ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}Choose students</button>
            </div>
          ) : (
            <div className="mt-2.5">
              <p className="text-xs text-slate-600 dark:text-gray-300"><b className="font-semibold text-slate-900 dark:text-white">{plural(studentIds.length, 'student')}</b> chosen</p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Chosen students">
                {preview.map((student) => (
                  <li key={student._id} className="max-w-[14rem] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-gray-800 dark:text-gray-200" title={student.email}>{student.name || student.email || 'Student'}</li>
                ))}
                {students.length > preview.length && <li className="rounded-full px-1 py-0.5 text-[11px] text-slate-500 dark:text-gray-400">+{(students.length - preview.length).toLocaleString()} more</li>}
              </ul>
            </div>
          )}
        </section>

        {!removing && (
          <section aria-labelledby="bulk-window-title" className={sectionClass}>
            <h3 id="bulk-window-title" className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white"><CalendarClock className="h-4 w-4 text-sky-600" aria-hidden="true" />When they can see these mocks</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-gray-300">From
                <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-gray-300">Until
                <input type="datetime-local" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
            </div>
            <p className={`mt-2 text-[11px] ${dateError ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-gray-400'}`}>
              {dateError || 'Leave “From” empty to open now and “Until” empty for no end date. An attempt that is running when the window closes ends then.'}
            </p>
            <label className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs text-slate-700 dark:border-gray-800 dark:text-gray-200">
              <input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              <span>Also change the dates for students already assigned
                <span className="block text-[11px] text-slate-500 dark:text-gray-400">Off: students already on a mock keep their own dates; only new students get these.</span></span>
            </label>
          </section>
        )}

        {formError && <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{formError}</p>}
      </div>
    );
    footer = <>
      <p className="min-w-0 flex-1 text-xs font-medium text-slate-600 dark:text-gray-300">{blocker && !studentIds.length && !updateExisting ? (removing ? 'Choose the students to remove.' : 'Choose students to continue.') : summary}</p>
      <button type="button" onClick={onClose} className={dialogButton.secondary}>Cancel</button>
      <button type="button" onClick={review} disabled={Boolean(blocker)} title={blocker || undefined} className={removing ? dialogButton.warning : dialogButton.primary}>Review</button>
    </>;
  }

  return (
    <>
      <DialogFrame
        size="lg"
        icon={removing ? UserMinus : UserPlus}
        tone={removing ? 'amber' : 'sky'}
        title={removing ? 'Remove own students from mocks' : 'Assign own students to mocks'}
        subtitle={<span className="block truncate">{target.title}</span>}
        onClose={onClose}
        busy={busy}
        closeDisabled={picker}
        initialFocus={step === 'confirm' ? '[data-confirm]' : step === 'result' ? '[data-close]' : undefined}
        key={step}
        footer={footer}
      >
        {body}
      </DialogFrame>
      <AudienceDialog
        open={picker}
        students={students}
        limit={BULK_LIMITS.students}
        onClose={() => setPicker(false)}
        onDone={onPicked}
        title={removing ? 'Students to remove' : 'Students to add'}
        subtitle={removing ? 'Pick the PeerPrep students to take off these mocks. Students who are not on a mock are skipped.' : 'Pick registered PeerPrep students, upload a CSV or Excel list, or both. Students already on a mock keep their grant.'}
        uploadHint="Students are matched to registered PeerPrep accounts by email. Rows that do not match are listed so you can fix and upload them again; nothing is saved until you confirm."
        summary={(chosen) => (chosen ? <><strong>{chosen.toLocaleString()}</strong> student{chosen === 1 ? '' : 's'} chosen for {plural(mocks.length, 'mock')}.</> : 'Choose at least one student.')}
        doneLabel={(chosen) => `Use ${chosen.toLocaleString()} student${chosen === 1 ? '' : 's'}`}
      />
    </>
  );
}
