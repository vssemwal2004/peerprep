import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Check, FileText, Loader2, Pencil, Plus, Upload, Users, X } from 'lucide-react';
import { api } from '../utils/api';
import { useActivityLogger } from '../hooks/useActivityLogger';
import { useToast } from '../components/CustomToast';
import DateTimePicker from '../components/DateTimePicker';
import InterviewWorkspaceNav from '../components/interviews/InterviewWorkspaceNav';
import InterviewStudentEditor from '../components/interviews/InterviewStudentEditor';
import StudentSelector from './assessment/components/StudentSelector';
import { studentCsvFile, validateInterviewSetup } from '../components/interviews/interviewSetup';

const inputClass = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
const panelClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5';
const steps = ['Interview setup', 'Add students', 'Review & create'];

function Choice({ active, onClick, icon: Icon, title, description, disabled }) {
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={'flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-sky-500 disabled:opacity-50 ' + (active ? 'border-sky-400 bg-sky-50/70 ring-1 ring-sky-100 dark:border-sky-700 dark:bg-sky-950/30 dark:ring-sky-950' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-gray-700 dark:bg-gray-900')}>
    <Icon className={'mt-0.5 h-4 w-4 shrink-0 ' + (active ? 'text-sky-600' : 'text-slate-400')} />
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-gray-400">{description}</span></span>
    {active && <Check className="h-4 w-4 shrink-0 text-sky-600" />}
  </button>;
}

function SummaryItem({ label, children }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium text-slate-800 dark:text-gray-200">{children}</dd></div>;
}

export default function EventManagement() {
  const { pathname } = useLocation();
  const root = pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const navigate = useNavigate();
  const toast = useToast();
  const { logCreate } = useActivityLogger();
  const [step, setStep] = useState(0);
  const [visitedStudents, setVisitedStudents] = useState(false);
  const [setup, setSetup] = useState({ title: '', description: '', startDate: '', endDate: '', template: null });
  const [special, setSpecial] = useState(false);
  const [audience, setAudience] = useState('all');
  const [entryMode, setEntryMode] = useState('existing');
  const [selected, setSelected] = useState([]);
  const [pendingImport, setPendingImport] = useState(false);
  const [selectingStudents, setSelectingStudents] = useState(false);
  const [specialCsv, setSpecialCsv] = useState(null);
  const [validationRows, setValidationRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const headingRef = useRef(null);
  const templateRef = useRef(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const requiresSelection = special || audience === 'selected';

  const updateSetup = (field, value) => { setSetup((current) => ({ ...current, [field]: value })); setError(''); };
  const changeStudents = (students) => { setSelected(students); setSpecialCsv(null); setValidationRows([]); setError(''); };
  const goTo = (value) => {
    setStep(value); setError('');
    if (value === 1) setVisitedStudents(true);
    requestAnimationFrame(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  };

  const validateStudents = () => {
    if (selectingStudents) return 'Wait for the student selection to finish.';
    if (pendingImport) return 'Finish adding the reviewed CSV students, or discard the import before continuing.';
    if (requiresSelection && !selected.length) return 'Add at least one registered student.';
    if (requiresSelection && selected.length > 1000) return 'Select up to 1,000 students for this interview.';
    return '';
  };

  const next = async () => {
    if (busyRef.current) return;
    const problem = step === 0 ? validateInterviewSetup(setup) : validateStudents();
    if (problem) { setError(problem); return; }
    if (step === 0) { goTo(1); return; }
    busyRef.current = true; setBusy(true); setError(''); setValidationRows([]);
    try {
      if (special) {
        const file = studentCsvFile(selected);
        const response = await api.checkSpecialEventCsv(file);
        const invalid = response.results?.filter((row) => row.status !== 'ready') || [];
        if (response.results?.length !== selected.length || invalid.length) {
          setValidationRows(invalid);
          throw new Error('Some student records need attention. Resolve the details below before continuing.');
        }
        setSpecialCsv(file);
      } else if (requiresSelection) {
        // Recheck IDs and access scope after selection, without creating accounts.
        const response = await api.checkInterviewParticipantCsv(studentCsvFile(selected));
        const invalid = response.results?.filter((row) => row.status !== 'ready') || [];
        if (response.results?.length !== selected.length || invalid.length) {
          setValidationRows(invalid);
          throw new Error('Some selected students are no longer eligible. Review the records below.');
        }
      }
      goTo(2);
    } catch (err) { setError(err.message || 'Could not validate the selected students.'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const submit = async () => {
    if (busyRef.current) return;
    const problem = validateInterviewSetup(setup) || validateStudents();
    if (problem) { setError(problem); return; }
    if (special && !specialCsv) { setError('Return to Add students and validate the Special interview roster.'); return; }
    busyRef.current = true; setSubmitting(true); setError('');
    try {
      const payload = { name: setup.title.trim(), description: setup.description.trim(), startDate: new Date(setup.startDate).toISOString(), endDate: new Date(setup.endDate).toISOString(), template: setup.template };
      const event = special
        ? await api.createSpecialEvent({ ...payload, csv: specialCsv })
        : await api.createEvent({ ...payload, selectionMode: audience, allowedParticipants: requiresSelection ? selected.map((student) => student._id) : [] });
      const id = event._id || event.eventId;
      // Activity logging is secondary; never turn a successful create into a retry.
      try { Promise.resolve(logCreate('EVENT', id, 'Created ' + (special ? 'special' : 'regular') + ' interview: ' + payload.name, { eventType: special ? 'special' : 'general', hasTemplate: !!setup.template, startDate: payload.startDate, endDate: payload.endDate })).catch(() => {}); } catch { /* The interview was already created. */ }
      toast.success('Interview "' + payload.name + '" created.');
      toast.info('Invitation emails are queued automatically. Manage them from interview details.');
      navigate(id ? root + '/interviews/one-to-one/' + id : root + '/interviews/one-to-one', { state: { eventCreated: true } });
    } catch (err) {
      setError(err.message || 'Could not create the interview. Your entries have been kept.');
      busyRef.current = false; setSubmitting(false);
    }
  };

  const formatDate = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set';
  const audienceLabel = requiresSelection ? selected.length + ' selected students' : 'All eligible students';
  const canEdit = !busy && !submitting && !selectingStudents;

  return (
    <InterviewWorkspaceNav>
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <nav aria-label="Interview creation steps" className="mb-5 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-4">
          <ol className="grid grid-cols-3 gap-2 sm:gap-4">
            {steps.map((label, index) => <li key={label}><button type="button" disabled={index > step || !canEdit} onClick={() => index < step && goTo(index)} aria-current={step === index ? 'step' : undefined} className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline-sky-500 disabled:cursor-default sm:gap-3">
              <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ' + (index <= step ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-gray-800')}>{index < step ? <Check className="h-4 w-4" /> : index + 1}</span>
              <span className={'text-xs font-semibold sm:text-sm ' + (index === step ? 'text-sky-700 dark:text-sky-400' : 'text-slate-500 dark:text-gray-400')}>{label}</span>
            </button></li>)}
          </ol>
        </nav>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight text-slate-900 outline-none dark:text-white">{steps[step]}</h2>
          <span className="text-xs text-slate-500">Step {step + 1} of 3</span>
        </div>

        <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
          {step === 0 && <>
            <section className={panelClass}>
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-white">Interview type</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Choice active={!special} disabled={pendingImport} onClick={() => { setSpecial(false); setSpecialCsv(null); setError(''); }} icon={Users} title="Regular interview" description="Open to all eligible students or a selected audience." />
                <Choice active={special} disabled={pendingImport} onClick={() => { setSpecial(true); setSpecialCsv(null); setError(''); }} icon={CalendarDays} title="Special interview" description="A dedicated round for a verified, selected student roster." />
              </div>
              {pendingImport && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Finish or discard the student import in step 2 before changing interview type.</p>}
            </section>
            <section className={panelClass}>
              <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-white">Details & instructions</h3>
              <div className="space-y-4">
                <div><label htmlFor="interview-name" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-gray-300">Interview name <span className="text-rose-500">*</span></label><input id="interview-name" className={inputClass} value={setup.title} onChange={(e) => updateSetup('title', e.target.value)} placeholder="e.g. Semester 5 · Technical mock interview" required /></div>
                <div><label htmlFor="interview-instructions" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-gray-300">Student instructions <span className="text-rose-500">*</span></label><textarea id="interview-instructions" className={inputClass} rows={4} value={setup.description} onChange={(e) => updateSetup('description', e.target.value)} placeholder="Describe the focus, preparation requirements, and expectations for this round." required /></div>
              </div>
            </section>
            <section className={panelClass}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800 dark:text-white">Interview window</h3><span className="text-xs text-slate-500">{timezone}</span></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-gray-300">Starts <span className="text-rose-500">*</span></span><DateTimePicker value={setup.startDate} onChange={(value) => updateSetup('startDate', value)} placeholder="Interview start date and time" /></div>
                <div><span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-gray-300">Ends <span className="text-rose-500">*</span></span><DateTimePicker value={setup.endDate} min={setup.startDate} onChange={(value) => updateSetup('endDate', value)} placeholder="Interview end date and time" /></div>
              </div>
              <p className="mt-3 text-xs text-slate-500">This is the round's availability window, not the duration of each student pair's interview.</p>
            </section>
            <section className={panelClass}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800 dark:text-white">Interview template <span className="font-normal text-slate-400">· Optional</span></h3><p className="mt-1 text-xs text-slate-500">Attach shared questions or preparation material. Maximum 10 MB.</p></div><button type="button" onClick={() => templateRef.current?.click()} className={secondaryButton}><Upload className="h-4 w-4" />{setup.template ? 'Replace file' : 'Attach file'}</button></div>
              <input type="file" ref={templateRef} aria-label="Upload interview template" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file?.size > 10 * 1024 * 1024) setError('The template must be 10 MB or smaller.'); else if (file) updateSetup('template', file); e.target.value = ''; }} />
              {setup.template && <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-gray-800"><FileText className="h-4 w-4 shrink-0 text-sky-600" /><span className="min-w-0 flex-1 break-all text-slate-700 dark:text-gray-200">{setup.template.name} · {(setup.template.size / 1024).toFixed(0)} KB</span><button type="button" aria-label="Remove template" className={secondaryButton} onClick={() => updateSetup('template', null)}><X className="h-4 w-4" /></button></div>}
            </section>
          </>}

          {visitedStudents && <div hidden={step !== 1} className="space-y-5">
            <section className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800 dark:text-white">Who can participate?</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">{special ? 'Special' : 'Regular'}</span></div>
              {!special ? <div className="grid gap-3 md:grid-cols-2">
                <Choice active={audience === 'all'} disabled={pendingImport} onClick={() => { setAudience('all'); setError(''); }} icon={Users} title="All eligible students" description={root === '/coordinator' ? 'Use the existing interview eligibility rules for your coordinator scope.' : 'Use the existing eligibility rules for an open interview round.'} />
                <Choice active={audience === 'selected'} onClick={() => { setAudience('selected'); setError(''); }} icon={Check} title="Selected students" description="Choose a fixed roster using individual entry, CSV, or saved lists." />
              </div> : <p className="text-sm text-slate-500 dark:text-gray-400">Select the registered students for this dedicated round. Their records and coordinator assignments are checked before creation.</p>}
              {!requiresSelection && <p className="mt-3 text-xs text-slate-500">No manual roster is required. Any selections made below are kept if you switch back, but will not restrict this round.</p>}
            </section>
            <div hidden={!requiresSelection} className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-3">
                {[{ id: 'individual', title: 'Add individual student', description: 'Find a registered email or ID.', icon: Plus }, { id: 'bulk', title: 'Add bulk students', description: 'Upload, review, and correct a CSV.', icon: Upload }, { id: 'existing', title: 'Add existing students', description: 'Browse students, filters, and saved lists.', icon: Users }].map((item) => <Choice key={item.id} active={entryMode === item.id} disabled={pendingImport} onClick={() => { setEntryMode(item.id); setError(''); }} {...item} />)}
              </div>
              {entryMode === 'existing'
                ? <div className={panelClass}><StudentSelector selected={selected} onChange={changeStudents} onBusyChange={setSelectingStudents} /></div>
                : <InterviewStudentEditor key={special ? 'special' : 'regular'} mode={entryMode} special={special} selected={selected} onChange={changeStudents} onPendingChange={setPendingImport} />}
              <div className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800 dark:text-white">Selected students <span className="ml-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300">{selected.length}</span></h3><button type="button" disabled={!selected.length || pendingImport} className={secondaryButton} onClick={() => changeStudents([])}>Clear selection</button></div>
                {selected.length ? <ul className="mt-3 max-h-60 divide-y divide-slate-100 overflow-auto dark:divide-gray-800">{selected.map((student) => <li key={student._id} className="flex items-center gap-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-gray-800">{student.name?.slice(0, 1) || 'S'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700 dark:text-gray-200">{student.name}</p><p className="break-all text-xs text-slate-500">{student.studentId || student.studentid} · {student.email}</p></div><button type="button" disabled={pendingImport} className={secondaryButton} aria-label={'Remove ' + student.name} onClick={() => changeStudents(selected.filter((entry) => entry._id !== student._id))}><X className="h-3.5 w-3.5" /></button></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No students selected. Choose an option above to build the roster.</p>}
                <p className="mt-3 text-xs text-slate-500">Maximum 1,000 selected students. Duplicate selections are not added twice.</p>
              </div>
            </div>
            {validationRows.length > 0 && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"><h3 className="font-semibold">Student records need attention</h3><ul className="mt-2 max-h-60 space-y-2 overflow-auto">{validationRows.map((row, index) => <li key={index}>Row {row.row}: {row.name || row.email || row.studentid || selected[index]?.name} — {row.message || row.status?.replaceAll('_', ' ')}</li>)}</ul><p className="mt-3">Remove an ineligible student, or correct their registered profile and select them again.</p></div>}
          </div>}

          {step === 2 && <>
            <section className={panelClass}>
              <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800 dark:text-white">Interview details</h3><button type="button" onClick={() => goTo(0)} className={secondaryButton}><Pencil className="h-3.5 w-3.5" />Edit setup</button></div>
              <dl className="grid gap-5 sm:grid-cols-2"><SummaryItem label="Name">{setup.title}</SummaryItem><SummaryItem label="Type">{special ? 'Special interview' : 'Regular interview'}</SummaryItem><SummaryItem label={'Starts · ' + timezone}>{formatDate(setup.startDate)}</SummaryItem><SummaryItem label={'Ends · ' + timezone}>{formatDate(setup.endDate)}</SummaryItem><div className="sm:col-span-2"><SummaryItem label="Student instructions"><span className="whitespace-pre-wrap font-normal leading-relaxed">{setup.description}</span></SummaryItem></div><SummaryItem label="Template">{setup.template?.name || 'No attachment'}</SummaryItem></dl>
            </section>
            <section className={panelClass}>
              <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800 dark:text-white">Students & access</h3><button type="button" onClick={() => goTo(1)} className={secondaryButton}><Pencil className="h-3.5 w-3.5" />Edit students</button></div>
              <div className="flex items-center gap-3"><span className="rounded-xl bg-sky-50 p-3 text-sky-600 dark:bg-sky-950"><Users className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-slate-800 dark:text-white">{audienceLabel}</p><p className="mt-1 text-xs text-slate-500">{requiresSelection ? 'Only students in this roster can participate.' : 'Student access follows the existing round eligibility rules.'}</p></div></div>
              {requiresSelection && <details className="mt-4 rounded-lg border border-slate-200 dark:border-gray-700"><summary className="cursor-pointer p-3 text-xs font-semibold text-slate-600 dark:text-gray-300">View selected students ({selected.length})</summary><ul className="max-h-64 space-y-2 overflow-auto border-t border-slate-100 p-3 text-xs text-slate-500 dark:border-gray-800">{selected.map((student) => <li key={student._id} className="break-words">{student.name} · {student.studentId || student.studentid} · {student.email}</li>)}</ul></details>}
            </section>
            <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20"><h3 className="text-sm font-semibold text-slate-800 dark:text-white">After you create</h3><ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600 dark:text-gray-400"><li>The interview is published and invitation emails are queued automatically.</li><li>{special ? 'The verified roster is enrolled using the existing Special interview pairing workflow.' : 'Students join through the existing Regular interview workflow.'}</li><li>Manage participants, pairs, scheduling, and feedback from interview details.</li></ul></section>
          </>}
        </fieldset>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{error}</div>}
        <footer className="sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950 sm:-mx-6 sm:px-6">
          <span className="text-xs text-slate-500">{step === 0 ? 'Nothing is published until the final step.' : audienceLabel}</span>
          <div className="ml-auto flex items-center gap-2">{step > 0 && <button type="button" disabled={!canEdit} onClick={() => goTo(step - 1)} className={secondaryButton}><ArrowLeft className="h-4 w-4" />Back</button>}{step < 2 ? <button type="button" disabled={!canEdit} onClick={next} className={primaryButton}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy ? 'Checking students…' : step === 0 ? 'Continue to students' : 'Review interview'}{!busy && <ArrowRight className="h-4 w-4" />}</button> : <button type="button" disabled={!canEdit} onClick={submit} className={primaryButton}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{submitting ? 'Creating interview…' : 'Create interview'}</button>}</div>
        </footer>
      </div>
    </InterviewWorkspaceNav>
  );
}
