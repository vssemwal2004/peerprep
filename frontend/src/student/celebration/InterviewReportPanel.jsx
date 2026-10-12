import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BriefcaseBusiness, Check, ChevronDown, CircleCheck, Plus, Sparkles } from 'lucide-react';
import { api } from '../../utils/api';
import { useOptionalAuth } from '../../context/AuthContext';
import { closestCompany, filterOptions } from './companyMatch';

const MotionDiv = motion.div;
const field = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500';
const ghost = 'rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800';
const primary = 'rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-500/30 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40';
const CLOSE_AFTER_SAVE_MS = 2600;

// Keyed per student so a shared lab browser still asks the next student; without a known student nothing is remembered.
const reportStorageKey = (userId, source, questionId) => `peerprep:interview-report:${userId}:${source}:${questionId}`;
function readReportAnswer(userId, source, questionId) {
  if (!userId) return '';
  try { return localStorage.getItem(reportStorageKey(userId, source, questionId)) || ''; } catch { return ''; }
}
function rememberAnswer(userId, source, questionId, answer) {
  if (!userId) return;
  try { localStorage.setItem(reportStorageKey(userId, source, questionId), answer); } catch { /* Storage can be unavailable in private windows. */ }
}
// The server accepts up to one day past its UTC date, so the student's local calendar date is always valid.
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function Highlight({ text, query }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark className="rounded bg-sky-100 px-0.5 text-inherit dark:bg-sky-500/25">{text.slice(at, at + query.length)}</mark>{text.slice(at + query.length)}</>;
}

function Combobox({ label, value, onChange, options, placeholder, inputRef, describedBy, children }) {
  const id = useId();
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim();
  const matches = useMemo(() => filterOptions(options, query), [options, query]);
  const shown = open && matches.length > 0 && !(matches.length === 1 && matches[0] === value);
  const pick = (option) => { onChange(option); setOpen(false); setActive(-1); };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!matches.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActive((current) => (current < 0 && step < 0 ? matches.length - 1 : (current + step + matches.length) % matches.length));
    } else if (event.key === 'Enter' && shown && active >= 0) { event.preventDefault(); pick(matches[active]); }
    else if (event.key === 'Escape' && shown) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
  };
  return <div className="relative">
    <label htmlFor={`${id}-input`} className="block text-sm font-medium text-slate-700 dark:text-zinc-200">{label}</label>
    <div className="relative">
      <input ref={ref} id={`${id}-input`} role="combobox" aria-expanded={shown} aria-describedby={describedBy} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${id}-option-${active}` : undefined} autoComplete="off" maxLength={80}
        value={value} placeholder={placeholder} className={`${field} pr-10`} onKeyDown={onKeyDown}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} />
      <button type="button" tabIndex={-1} aria-label={`Show all ${label.toLowerCase()} options`}
        onMouseDown={(event) => { event.preventDefault(); ref.current?.focus(); setOpen((current) => !current); }}
        className="absolute inset-y-0 right-0 mt-1.5 flex w-10 items-center justify-center text-slate-400 hover:text-sky-600 dark:text-zinc-500">
        <ChevronDown className={`h-4 w-4 transition-transform ${shown ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    </div>
    <ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`} hidden={!shown}
      className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      {matches.map((option, index) => <li key={option} id={`${id}-option-${index}`} role="option" aria-selected={index === active}
        onMouseDown={(event) => { event.preventDefault(); pick(option); }} onMouseEnter={() => setActive(index)}
        className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${index === active ? 'bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200' : 'text-slate-700 dark:text-zinc-200'}`}>
        <span className="truncate"><Highlight text={option} query={query} /></span>
        {option === value && <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />}
      </li>)}
    </ul>
    {children}
  </div>;
}

/** "Was this question asked in a company interview?" Hidden when this student already answered for the question here.
 * No closes the celebration right away; a saved report shows a short thank-you and then closes it. */
export default function InterviewReportPanel({ source, questionId, delay = 0, onReported, onFinished }) {
  const auth = useOptionalAuth();
  const userId = auth?.user?._id || auth?.user?.id || '';
  const [step, setStep] = useState(() => (readReportAnswer(userId, source, questionId) ? 'hidden' : 'ask'));
  const yesRef = useRef(null), dateRef = useRef(null), companyRef = useRef(null), statusRef = useRef(null);
  // Each step replaces the focused button, so focus follows to the new content (only after the student acted).
  const pendingFocus = useRef(null);
  useEffect(() => {
    const target = { ask: yesRef, form: dateRef, no: statusRef, done: statusRef, company: companyRef }[pendingFocus.current];
    pendingFocus.current = null;
    target?.current?.focus();
  });
  const go = (next, focus = next) => { pendingFocus.current = focus; setStep(next); };
  const [options, setOptions] = useState({ companies: [], jobTitles: [] });
  const [interviewDate, setInterviewDate] = useState('');
  const [company, setCompany] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const today = useMemo(localToday, []);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => { onFinishedRef.current = onFinished; }, [onFinished]);
  useEffect(() => {
    if (step !== 'done') return undefined;
    const timer = setTimeout(() => onFinishedRef.current?.(), CLOSE_AFTER_SAVE_MS);
    return () => clearTimeout(timer);
  }, [step]);
  const typed = company.trim();
  const listed = options.companies.find((name) => name.toLowerCase() === typed.toLowerCase());
  const suggestion = useMemo(() => (listed ? null : closestCompany(typed, options.companies)), [listed, typed, options.companies]);
  const isNew = Boolean(newCompany) && newCompany === typed;
  // A name outside the catalog is sent only after the explicit "Add … as a new company" step.
  const companyConfirmed = Boolean(listed) || isNew;
  const ready = Boolean(interviewDate) && typed.length >= 2 && companyConfirmed && jobTitle.trim().length >= 2 && !busy;
  if (step === 'hidden') return null;

  const answerNo = () => {
    rememberAnswer(userId, source, questionId, 'no');
    if (onFinished) onFinished(); else go('no');
  };
  const answerYes = () => {
    go('form');
    api.questionInterviewOptions().then((data) => setOptions({
      companies: Array.isArray(data?.companies) ? data.companies.filter(Boolean) : [],
      jobTitles: Array.isArray(data?.jobTitles) ? data.jobTitles.filter(Boolean) : [],
    })).catch(() => {});
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true); setError('');
    try {
      const response = await api.reportQuestionInterview(source, questionId, { interviewDate, company: listed || typed, jobTitle: jobTitle.trim() });
      rememberAnswer(userId, source, questionId, 'yes');
      const status = response?.company?.status || (listed ? 'listed' : 'pending');
      setSaved({ name: response?.company?.name || listed || typed, status: status === 'listed' ? 'listed' : 'pending' });
      go('done');
      onReported?.();
    } catch (failure) { setError(failure?.message || 'Could not save your interview report. Please try again.'); }
    finally { setBusy(false); }
  };

  return <MotionDiv initial={delay ? { opacity: 0, y: 24 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}
    className="rounded-2xl bg-gradient-to-br from-sky-400 via-indigo-400 to-sky-500 p-px shadow-lg shadow-sky-500/15" data-interview-report>
    <section aria-labelledby="interview-report-title" className="rounded-[15px] bg-gradient-to-br from-sky-50 to-indigo-50 p-4 text-left dark:from-zinc-900 dark:to-indigo-950/60 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm dark:bg-zinc-800 dark:text-sky-300"><BriefcaseBusiness className="h-5 w-5" aria-hidden="true" /></span>
        <h3 id="interview-report-title" className="min-w-0 self-center text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">Was this question asked in any company interview?</h3>
      </div>

      {step === 'ask' && <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={answerNo} className={ghost}>No</button>
        <button ref={yesRef} type="button" onClick={answerYes} className={primary}>Yes</button>
      </div>}

      {step === 'no' && <p ref={statusRef} tabIndex={-1} role="status" className="mt-3 text-sm text-slate-600 focus:outline-none dark:text-zinc-300">Thanks — good luck with your next one.</p>}

      {step === 'done' && saved && <p ref={statusRef} tabIndex={-1} role="status" className="mt-3 flex gap-2 text-sm leading-relaxed text-slate-700 focus:outline-none dark:text-zinc-200">
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span>{saved.status === 'pending'
          ? `Thanks! “${saved.name}” was sent to the PeerPrep team for review. Once approved and confirmed by enough students, it will appear on this question.`
          : `Thanks! When enough students confirm, this question will show the ${saved.name} tag.`}</span>
      </p>}

      {step === 'form' && <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <label className="block text-sm font-medium text-slate-700 dark:text-zinc-200">Interview date
          <input ref={dateRef} type="date" required min="2000-01-01" max={today} value={interviewDate} onChange={(event) => setInterviewDate(event.target.value)} className={field} />
        </label>
        <Combobox label="Company" value={company} options={options.companies} placeholder="Choose or search a company" inputRef={companyRef}
          onChange={(next) => { setCompany(next); setError(''); }}>
          {typed.length >= 2 && !companyConfirmed && <div className="mt-2 flex flex-wrap items-center gap-2">
            {suggestion && <button type="button" onClick={() => { pendingFocus.current = 'company'; setCompany(suggestion); }}
              className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:hover:bg-sky-500/25">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Did you mean <strong className="font-semibold">{suggestion}</strong>?
            </button>}
            <button type="button" onClick={() => { pendingFocus.current = 'company'; setNewCompany(typed); }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-400 px-3 py-1 text-xs font-medium text-slate-700 hover:border-sky-500 hover:text-sky-700 dark:border-zinc-500 dark:text-zinc-200 dark:hover:text-sky-300">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add “{typed}” as a new company
            </button>
          </div>}
          {isNew && <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">New company · reviewed by PeerPrep before it appears on questions</p>}
        </Combobox>
        <Combobox label="Job title" value={jobTitle} options={options.jobTitles} placeholder="Choose or type a job title" onChange={setJobTitle} />
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => { go('ask'); setError(''); }} className={ghost}>Cancel</button>
          <button type="submit" disabled={!ready} className={primary}>{busy ? 'Saving…' : 'Continue'}</button>
        </div>
      </form>}
    </section>
  </MotionDiv>;
}
