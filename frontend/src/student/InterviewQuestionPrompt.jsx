import { useEffect, useState } from 'react';
import { api } from '../utils/api';

const today = new Date().toISOString().slice(0, 10);

function SelectOrAdd({ label, values, value, onChange }) {
  const [adding, setAdding] = useState(false);
  const selected = adding ? '__new__' : value;
  return <label className="block text-sm font-medium">
    {label}
    <select value={selected} onChange={(event) => {
      setAdding(event.target.value === '__new__');
      onChange(event.target.value === '__new__' ? '' : event.target.value);
    }}
      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white">
      <option value="">Choose {label.toLowerCase()}</option>
      {values.map((item) => <option key={item} value={item}>{item}</option>)}
      <option value="__new__">Add another {label.toLowerCase()}</option>
    </select>
    {adding && <input autoFocus value={value} onChange={(event) => onChange(event.target.value)}
      maxLength={80} placeholder={`Enter ${label.toLowerCase()}`}
      className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />}
  </label>;
}

export default function InterviewQuestionPrompt({ source, questionId, knownCompanies = [], onClose, onSaved }) {
  const [step, setStep] = useState('ask');
  const [options, setOptions] = useState({ companies: [], jobTitles: [] });
  const [interviewDate, setInterviewDate] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.questionInterviewOptions().then((data) => { if (mounted) setOptions(data); })
      .catch(() => { if (mounted) setOptions({ companies: [], jobTitles: [] }); });
    return () => { mounted = false; };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api.reportQuestionInterview(source, questionId, { interviewDate, company: company.trim(), jobTitle: jobTitle.trim() });
      onSaved?.();
      onClose();
    } catch (failure) { setError(failure.message || 'Could not save this interview report.'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/65 p-4" role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="interview-question-title"
      className="w-full max-w-md rounded-2xl bg-white p-6 text-zinc-900 shadow-xl dark:bg-[#282828] dark:text-white">
      <h2 id="interview-question-title" className="text-lg font-semibold">Was this question asked in an interview?</h2>
      {step === 'ask' ? <>
        <p className="mt-2 text-sm text-zinc-500">Your answer helps students find questions recently asked by companies.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600">No</button>
          <button type="button" onClick={() => setStep('details')} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Yes</button>
        </div>
      </> : <form onSubmit={save} className="mt-5 space-y-4">
        <label className="block text-sm font-medium">Interview date
          <input type="date" required min="2000-01-01" max={today} value={interviewDate}
            onChange={(event) => setInterviewDate(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
        </label>
        <SelectOrAdd label="Company" values={[...new Set([...(options.companies || []), ...knownCompanies].filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))} value={company} onChange={setCompany} />
        <SelectOrAdd label="Job title" values={options.jobTitles || []} value={jobTitle} onChange={setJobTitle} />
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600">Cancel</button>
          <button type="submit" disabled={busy || !interviewDate || company.trim().length < 2 || jobTitle.trim().length < 2}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>}
    </div>
  </div>;
}
