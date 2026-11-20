import { useId, useRef, useState } from 'react';
import { Globe, Loader2, Upload, WandSparkles } from 'lucide-react';
import { api } from '../../utils/api';
import { logoFileProblem } from './catalog';

/**
 * Sets a company's logo: find it from the company website, or upload an image.
 * onSaved({ company, domain?, logo }) runs after a logo is stored.
 */
export default function CompanyLogoEditor({ company, domain = '', onSaved, compact = false, autoFocus = false }) {
  const inputId = useId();
  const fileRef = useRef(null);
  const [website, setWebsite] = useState(domain);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const run = async (kind, task) => {
    setBusy(kind);
    setMessage(null);
    try {
      const result = await task();
      setMessage({ tone: 'success', text: kind === 'website' ? `Logo found on ${result.domain || website}.` : 'Logo uploaded.' });
      onSaved?.(result);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message || 'The logo could not be saved.' });
    } finally {
      setBusy('');
    }
  };

  const findFromWebsite = () => {
    if (!website.trim()) { setMessage({ tone: 'error', text: 'Type the company website, for example google.com.' }); return; }
    run('website', () => api.setCompanyLogoFromWebsite({ company, website: website.trim() }));
  };
  const upload = (file) => {
    const problem = logoFileProblem(file);
    if (problem) { setMessage({ tone: 'error', text: problem }); return; }
    run('upload', () => api.uploadCompanyLogo(company, file));
  };

  const button = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900';
  return (
    <div className={compact ? '' : 'space-y-2'}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={inputId} className="relative min-w-0 flex-1">
          <span className="sr-only">Website of {company}</span>
          <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id={inputId} value={website} onChange={(event) => setWebsite(event.target.value)} autoFocus={autoFocus} disabled={Boolean(busy)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); findFromWebsite(); } }}
            placeholder="Company website, e.g. google.com" inputMode="url" autoComplete="off" spellCheck={false}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-sky-500/20" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={findFromWebsite} disabled={Boolean(busy)} className={`${button} flex-1 bg-sky-600 text-white shadow-sm hover:bg-sky-500 sm:flex-none`}>
            {busy === 'website' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />}
            {busy === 'website' ? 'Finding…' : 'Find logo'}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)} className={`${button} flex-1 border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 sm:flex-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800`}>
            {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
            {busy === 'upload' ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" tabIndex={-1} aria-hidden="true"
            onChange={(event) => { const [file] = event.target.files || []; event.target.value = ''; if (file) upload(file); }} />
        </div>
      </div>
      <p role={message?.tone === 'error' ? 'alert' : 'status'} aria-live="polite"
        className={`text-[11.5px] ${compact ? 'mt-1.5' : ''} ${message?.tone === 'error' ? 'text-rose-600 dark:text-rose-400' : message ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-gray-400'}`}>
        {message?.text || 'We look for the logo on the website. Or upload a square PNG, JPEG or WebP (at least 64×64, up to 2 MB).'}
      </p>
    </div>
  );
}
