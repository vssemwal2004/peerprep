import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, FileText, FileUp, ListChecks, Loader2, Pencil, RotateCcw, Upload, X } from 'lucide-react';
import { api } from '../../utils/api';

const maxBytes = 5 * 1024 * 1024;
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:outline-sky-500 disabled:opacity-60';
const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

export function CoreDetailsChecklist({ requirements, onLocate, onRestore, pageCount }) {
  const { missing, total, complete, ready, percent } = requirements;
  return <section data-guide="rs-quality" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><ListChecks size={18}/></span><div>
        <h2 className="text-sm font-bold">{ready ? 'Ready for an ATS check' : 'Finish your core details'}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{complete} of {total} details complete · {pageCount} {pageCount === 1 ? 'page' : 'pages'}</p>
      </div></div>
      {onRestore && <button type="button" onClick={onRestore} data-guide="rs-restore" className="inline-flex items-center gap-1 rounded-lg p-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><RotateCcw size={13}/> Restore</button>}
    </div>
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-sky-500 transition-[width] motion-reduce:transition-none" style={{width:`${percent}%`}} /></div>
    {missing.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Missing details">{missing.map(item =>
      <button key={item.id} type="button" onClick={() => onLocate(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50/60 px-2.5 py-1.5 text-left text-xs font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">{item.label}<ArrowRight size={12}/></button>
    )}</div>}
  </section>;
}

export function ResumeImportDialog({ welcome, onClose, onStart, onReady }) {
  const dialog = useRef(null);
  const fileInput = useRef(null);
  const currentRequest = useRef(0);
  const [reading, setReading] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => { currentRequest.current += 1; element.close(); };
  }, []);

  async function importFile(file) {
    if (!file || reading) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) { setError('Choose a PDF or Word (.docx) resume.'); return; }
    if (!file.size || file.size > maxBytes) { setError('Choose a non-empty resume of 5 MB or less.'); return; }
    const request = ++currentRequest.current;
    setReading(file.name);
    setError('');
    try {
      const result = await api.importResume(file);
      if (currentRequest.current === request) await onReady(result, file.name, () => currentRequest.current === request);
    } catch (failure) {
      if (currentRequest.current === request) setError(failure.message || 'The file could not be read. Try another resume.');
    } finally {
      if (currentRequest.current === request) setReading('');
    }
  }

  function close() {
    currentRequest.current += 1;
    onClose();
  }

  return (
    <dialog ref={dialog} aria-labelledby="import-resume-title" onCancel={close} className="m-auto w-[min(92vw,30rem)] max-h-[88dvh] overflow-y-auto rounded-3xl border border-sky-100 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
      <div className="relative p-6 sm:p-8">
        <button type="button" onClick={close} aria-label="Close resume import" className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        <span className="mb-4 inline-grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><FileUp size={24} /></span>
        <h2 id="import-resume-title" className="text-xl font-bold tracking-tight">{welcome ? 'Start your resume' : 'Import your resume'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Upload a resume to fill your template. You can review and edit every detail before saving.</p>
        <div className={`mt-5 rounded-2xl border border-dashed p-5 text-center ${dragging ? 'border-sky-500 bg-sky-100 dark:bg-sky-950' : 'border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30'}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); importFile(event.dataTransfer.files?.[0]); }}>
          <input ref={fileInput} type="file" className="hidden" accept=".pdf,.docx" aria-label="Resume file" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ''; }} />
          {reading ? <div role="status"><Loader2 className="mx-auto h-5 w-5 animate-spin text-sky-600 motion-reduce:animate-none" /><p className="mt-2 text-sm font-semibold">Reading your resume…</p><p className="mt-1 break-all text-xs text-slate-500">{reading}</p></div> :
            <><button className={primary} type="button" onClick={() => fileInput.current?.click()}><Upload size={16} />Upload your resume</button><p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Choose or drop a PDF or DOCX · up to 5 MB</p></>}
        </div>
        {error && <p role="alert" className="mt-3 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</p>}
        {welcome && !reading && <button type="button" onClick={onStart} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg p-2 text-sm font-semibold text-slate-600 hover:text-sky-700 dark:text-slate-300"><Pencil size={15} />Start from scratch<ArrowRight size={14} /></button>}
      </div>
    </dialog>
  );
}

const contactLabels = { name: 'Name', email: 'Email', mobile: 'Mobile', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio', location: 'Location' };

export function ImportSummary({ session, resume, onChoose, onSave, onCancel, saving, saveError }) {
  const { original, extracted, filename, warnings } = session;
  const conflicts = Object.entries(contactLabels).filter(([key]) =>
    original.basics[key] && extracted.basics[key] && original.basics[key].trim() !== extracted.basics[key].trim());
  return (
    <section aria-label="Review imported details" className="mx-auto mt-4 max-w-[1680px] px-4 sm:px-6">
      <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-900 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><FileText size={21}/></span>
          <div className="min-w-0 flex-1"><h2 className="text-base font-bold">Review imported details</h2><p className="mt-0.5 break-all text-xs text-slate-500">{filename}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={onCancel} className={secondary}>Cancel</button><button type="button" disabled={saving} onClick={onSave} className={primary}>{saving ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} {original.exists ? 'Replace saved draft' : 'Save imported draft'}</button></div>
        </div>
        {saveError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{saveError} Review your details and try saving again.</p>}
        {warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 rounded-xl bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
        {conflicts.length > 0 && <details className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700" open><summary className="cursor-pointer text-sm font-semibold text-sky-700 dark:text-sky-300">Review {conflicts.length} contact {conflicts.length === 1 ? 'difference' : 'differences'}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{conflicts.map(([key, label]) => <label key={key} className="min-w-0 text-xs font-semibold">{label}<select aria-label={`Choose ${label}`} value={resume.basics[key] || ''} onChange={(e) => onChoose(key, e.target.value)} className="mt-1 block w-full truncate rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-950">
            <option value={extracted.basics[key]}>From file · {extracted.basics[key]}</option><option value={original.basics[key]}>Current · {original.basics[key]}</option>
            {![extracted.basics[key], original.basics[key]].includes(resume.basics[key]) && <option value={resume.basics[key] || ''}>Edited · {resume.basics[key] || 'Empty'}</option>}
          </select></label>)}</div></details>}
      </div>
    </section>
  );
}
