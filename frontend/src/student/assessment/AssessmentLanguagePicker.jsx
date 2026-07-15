import { memo, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Code2 } from 'lucide-react';
import { getLanguageLabel } from '../../admin/compiler/compilerUtils';

function AssessmentLanguagePicker({ languages = [], value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selectLanguage = (language) => {
    setOpen(false);
    if (language !== value) onChange(language);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || languages.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex min-w-[8.5rem] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? 'border-sky-300 bg-sky-50 text-sky-800 ring-2 ring-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200 dark:ring-sky-900/30'
            : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sky-700'
        }`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Code2 className="h-3.5 w-3.5 shrink-0 text-sky-600" />
          <span className="truncate">{getLanguageLabel(value)}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        role="listbox"
        aria-label="Programming language"
        className={`absolute right-0 top-[calc(100%_+_0.5rem)] z-[70] w-56 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_22px_55px_-22px_rgba(15,23,42,0.42)] transition-all duration-150 dark:border-gray-700 dark:bg-gray-900 ${
          open ? 'visible translate-y-0 scale-100 opacity-100' : 'invisible -translate-y-1 scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Select language
        </div>
        <div className="max-h-64 overflow-y-auto">
          {languages.map((language) => {
            const selected = language === value;
            return (
              <button
                key={language}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => selectLanguage(language)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  selected
                    ? 'bg-sky-50 text-sky-800 dark:bg-sky-900/25 dark:text-sky-200'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                <span>{getLanguageLabel(language)}</span>
                {selected ? <Check className="h-4 w-4 text-sky-600" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function languagePickerPropsEqual(previous, next) {
  return previous.value === next.value
    && previous.disabled === next.disabled
    && previous.languages.length === next.languages.length
    && previous.languages.every((language, index) => language === next.languages[index]);
}

export default memo(AssessmentLanguagePicker, languagePickerPropsEqual);
