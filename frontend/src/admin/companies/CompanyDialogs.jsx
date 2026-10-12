import { useState } from 'react';
import { Building2, Check, Sparkles } from 'lucide-react';
import { SearchBox, inputClass } from '../quickprep/ui';
import { Modal } from './companyUi';

const normalize = (value) => value.trim().replace(/\s+/g, ' ');

/** Approve a student-typed name under a corrected spelling; an existing name is merged instead. */
export function RenameDialog({ row, catalog, busy, error, onClose, onApprove, onMerge }) {
  const [name, setName] = useState(row.name);
  const clean = normalize(name);
  const lower = clean.toLowerCase();
  // The server matches a listed company by key or by display name, so both are checked here.
  const existing = catalog.find((entry) => entry.key !== row.key && (entry.key === lower || entry.name.toLowerCase() === lower));
  const tooShort = clean.length > 0 && clean.length < 2;
  return <Modal title="Approve with another name" description={`Students typed “${row.name}”. Enter the name students should see on question tags.`}
    submitLabel="Approve" disabled={clean.length < 2 || clean.length > 80 || Boolean(existing)} busy={busy} error={error} onClose={onClose} onSubmit={() => onApprove(clean)}>
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">Company name</span>
      <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} aria-invalid={tooShort} className={inputClass} />
    </label>
    {tooShort && <p className="text-[12.5px] text-rose-600 dark:text-rose-400">Use at least 2 characters.</p>}
    {existing && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
      “{existing.name}” is already approved. <button type="button" disabled={busy} onClick={() => onMerge(existing)} className="font-semibold underline">Merge into it instead</button>
    </p>}
  </Modal>;
}

/** Fold a student-typed name into a company that is already in the catalog. */
export function MergeDialog({ row, catalog, busy, error, onClose, onMerge }) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(row.suggestion?.key || '');
  const options = catalog.filter((entry) => entry.key !== row.key);
  const term = query.trim().toLowerCase();
  const matches = term ? options.filter((entry) => entry.name.toLowerCase().includes(term)) : options;
  const shown = [...matches.filter((entry) => entry.key === row.suggestion?.key), ...matches.filter((entry) => entry.key !== row.suggestion?.key)].slice(0, 200);
  const chosen = options.find((entry) => entry.key === target);
  return <Modal title={`Merge “${row.name}”`} description="Reports for this name will count toward the company you choose." submitLabel={chosen ? `Merge into ${chosen.name}` : 'Merge'}
    disabled={!chosen} busy={busy} error={error} onClose={onClose} onSubmit={() => onMerge(chosen)}>
    {options.length ? <>
      <SearchBox value={query} onChange={setQuery} placeholder="Search approved companies" label="Search approved companies" />
      <ul role="listbox" aria-label="Approved companies" className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 py-1 dark:border-zinc-700">
        {shown.map((entry) => {
          const active = entry.key === target;
          return <li key={entry.key} role="option" aria-selected={active}>
            <button type="button" onClick={() => setTarget(entry.key)} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-zinc-800 ${active ? 'bg-sky-50/80 font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-200' : 'text-slate-700 dark:text-zinc-200'}`}>
              <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {entry.key === row.suggestion?.key && <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"><Sparkles className="h-3 w-3" aria-hidden="true" />Similar</span>}
              {active && <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />}
            </button>
          </li>;
        })}
        {!shown.length && <li className="px-3 py-3 text-sm text-slate-500">No approved company matches “{query}”.</li>}
      </ul>
    </> : <p className="rounded-xl bg-slate-50 px-3 py-3 text-[13px] text-slate-500 dark:bg-zinc-900 dark:text-zinc-400">There are no approved companies to merge into yet. Approve this name instead.</p>}
  </Modal>;
}
