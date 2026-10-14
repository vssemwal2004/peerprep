import { useEffect, useId, useRef, useState } from 'react';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { UniversityLogo } from './primitives';
import { LOGO_RULES, checkLogoFile } from './universityModel';
import { focusRing, ghostButton } from './styles';

/**
 * Logo picker with drag and drop, preview and the same checks the server applies.
 * `onSelect(file)` receives only files that passed validation; it may return a promise (upload).
 * `file` is a not-yet-uploaded selection; otherwise the university's stored logo is shown.
 */
export default function LogoUploader({ university, file = null, onSelect, onRemove, busy = false, error = '', label = 'University logo', removeLabel = 'Remove' }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState('');
  const hintId = useId();
  const errorId = useId();
  const [previewUrl, setPreviewUrl] = useState('');
  // Created and revoked in one effect so StrictMode's double run never leaves a revoked URL on screen.
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const hasLogo = Boolean(file || university?.logo?.url);
  const shownError = localError || error;
  const locked = busy || checking;

  async function take(candidate) {
    if (!candidate || locked) return;
    setChecking(true);
    setLocalError('');
    try {
      const problem = await checkLogoFile(candidate);
      if (problem) setLocalError(problem);
      else await onSelect(candidate);
    } finally {
      setChecking(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return <div>
    <p className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{label}</p>
    <div
      onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files?.length > 1) setLocalError('Drop a single image.'); else take(event.dataTransfer.files?.[0]); }}
      className={`flex flex-col gap-3 rounded-xl border-2 border-dashed p-3 transition sm:flex-row sm:items-center ${dragging ? 'border-sky-400 bg-sky-50/70 dark:border-sky-500 dark:bg-sky-500/10' : shownError ? 'border-rose-300 dark:border-rose-500/40' : 'border-slate-200 dark:border-zinc-700'}`}>
      <div className="relative self-start">
        <UniversityLogo university={university} size="lg" src={previewUrl || undefined} />
        {locked && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 dark:bg-black/50"><Loader2 className="h-5 w-5 animate-spin text-sky-600" aria-label={busy ? 'Uploading logo' : 'Checking image'} /></span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700 dark:text-zinc-200">
          <button type="button" disabled={locked} onClick={() => inputRef.current?.click()} aria-describedby={`${hintId}${shownError ? ` ${errorId}` : ''}`}
            className={`rounded font-semibold text-sky-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-sky-300 ${focusRing}`}>
            {hasLogo ? 'Choose a different image' : 'Choose an image'}
          </button>
          <span className="text-slate-500 dark:text-zinc-400"> or drag it here</span>
        </p>
        <p id={hintId} className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">PNG, JPEG or WebP · up to 2 MB · at least 64×64 px. A square logo on a transparent or white background works best.</p>
        {file && <p className="mt-1 truncate text-[12px] font-medium text-slate-600 dark:text-zinc-300" title={file.name}>Selected: {file.name}</p>}
      </div>
      {hasLogo && onRemove && <button type="button" disabled={locked} onClick={() => { setLocalError(''); onRemove(); }} className={`${ghostButton} self-start text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10 sm:self-center`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />{removeLabel}
      </button>}
      <input ref={inputRef} type="file" accept={LOGO_RULES.accept} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => take(event.target.files?.[0])} />
    </div>
    {shownError && <p id={errorId} role="alert" className="mt-1.5 text-[12px] font-medium text-rose-600 dark:text-rose-400">{shownError}</p>}
  </div>;
}
