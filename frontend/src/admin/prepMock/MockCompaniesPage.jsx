import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  BriefcaseBusiness, Building2, ClipboardList, ExternalLink, Globe, ImageOff, ImagePlus, Loader2, Plus, RotateCcw,
  Search, Trash2, Upload, WandSparkles, X,
} from 'lucide-react';
import { api } from '../../utils/api';
import PageGuideButton from '../../guide/platform/PageGuideButton';
import { Notice, Page, PageHeader, RowMenu, SearchBox, Segmented, StatCard, card, inputClass, primaryButton, secondaryButton } from '../quickprep/ui';
import { plural } from '../quickprep/format';
import CompanyLogo from './CompanyLogo';
import CompanyLogoEditor from './CompanyLogoEditor';
import { RoleBadges } from '../assessment/components/RolePicker';
import { logoFileProblem, roleNameProblem, useMockRoles } from './catalog';

const PAGE_SIZE = 48;
const FILTERS = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'logo', label: 'With logo', test: (row) => Boolean(row.logo) },
  { value: 'nologo', label: 'No logo', test: (row) => !row.logo },
  { value: 'mocks', label: 'Has mocks', test: (row) => row.mocks > 0 },
];
const SORTS = {
  mocks: { label: 'Most mocks', compare: (a, b) => b.mocks - a.mocks || b.questions - a.questions || a.company.localeCompare(b.company) },
  questions: { label: 'Most questions', compare: (a, b) => b.questions - a.questions || a.company.localeCompare(b.company) },
  name: { label: 'Name A–Z', compare: (a, b) => a.company.localeCompare(b.company) },
  missing: { label: 'Missing logo first', compare: (a, b) => Number(Boolean(a.logo)) - Number(Boolean(b.logo)) || b.questions - a.questions || a.company.localeCompare(b.company) },
};
const SOURCES = {
  'built-in': ['Built-in', 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700'],
  website: ['From website', 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20'],
  upload: ['Uploaded', 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20'],
};
const companies = (count) => `${count.toLocaleString()} compan${count === 1 ? 'y' : 'ies'}`;
const normalise = (row) => ({
  company: row.company,
  key: row.key || row.company.toLowerCase(),
  questions: Number(row.questions ?? row.count) || 0,
  mocks: Number(row.mocks) || 0,
  published: Number(row.published) || 0,
  logo: row.logo || null,
  domain: row.domain || '',
});

function SourceBadge({ logo }) {
  if (!logo) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20"><ImageOff className="h-3 w-3" aria-hidden="true" />No logo</span>;
  const [label, tone] = SOURCES[logo.source] || SOURCES.upload;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>{label}</span>;
}

/** Progress and result of "Find missing logos". */
function LogoRun({ run, onStop, onClose }) {
  const processed = run.saved.length + run.missed.length;
  const total = run.total ?? run.estimate;
  const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const running = run.status === 'running';
  const waiting = running && !processed;
  const width = running ? Math.max(percent, 4) : run.status === 'done' ? 100 : percent;
  const [showMissed, setShowMissed] = useState(false);
  return (
    <section data-guide="pmc-run" aria-label="Find missing logos" className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-zinc-50">
            {running ? <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" /> : <WandSparkles className="h-4 w-4 text-sky-600" aria-hidden="true" />}
            {running ? 'Finding logos on company websites…' : run.status === 'error' ? 'Finding logos stopped with an error' : run.status === 'stopped' ? 'Stopped' : 'Finished finding logos'}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-zinc-400">
            {running ? `Checked ${processed}${total ? ` of ${total}` : ''} companies. This page updates as logos arrive.` : processed ? `Checked ${companies(processed)} that had a known website and no logo.` : run.status === 'done' ? 'Every company with a known website already has a logo.' : 'No company was checked.'}
          </p>
        </div>
        {running
          ? <button type="button" onClick={onStop} className={`${secondaryButton} py-1.5 text-xs`}>Stop</button>
          : <button type="button" onClick={onClose} aria-label="Close summary" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="h-4 w-4" /></button>}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" role="progressbar" aria-label="Companies checked" aria-valuemin={0} aria-valuemax={100} aria-valuenow={waiting ? undefined : width}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${run.status === 'error' ? 'bg-rose-500' : 'bg-gradient-to-r from-sky-500 to-indigo-500'} ${waiting ? 'animate-pulse' : ''}`} style={{ width: `${waiting ? 25 : width}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Logos saved', run.saved.length, 'text-emerald-600 dark:text-emerald-400'],
          ['No logo found', run.missed.length, 'text-amber-600 dark:text-amber-400'],
          ['No website known', run.withoutWebsite ?? '—', 'text-slate-600 dark:text-zinc-300'],
        ].map(([label, value, tone]) => <div key={label} className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-zinc-900">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">{label}</dt>
          <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
        </div>)}
      </dl>
      {run.error && <p role="alert" className="mt-2 text-[12.5px] text-rose-600 dark:text-rose-400">{run.error}</p>}
      {!running && (run.missed.length > 0 || run.withoutWebsite > 0) && <p className="mt-2 text-[12.5px] text-slate-500 dark:text-zinc-400">
        For these, open the company's logo actions and type its website, or upload a logo.
        {run.missed.length > 0 && <button type="button" onClick={() => setShowMissed((value) => !value)} className="ml-1 font-semibold text-sky-700 hover:underline dark:text-sky-300">{showMissed ? 'Hide' : 'Show'} companies with no logo found</button>}
      </p>}
      {showMissed && <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600 dark:bg-zinc-900 dark:text-zinc-300">{run.missed.join(', ')}</p>}
    </section>
  );
}

/** Side panel: the roles a company's mock can be for, with an Add role field. */
function RolesDrawer({ company, onClose }) {
  const roles = useMockRoles(company.company);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const needle = query.trim().toLowerCase();
  const shared = needle ? roles.shared.filter((role) => role.name.toLowerCase().includes(needle)) : roles.shared;
  const own = needle ? roles.company.filter((role) => role.name.toLowerCase().includes(needle)) : roles.company;

  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll('button, input, a[href]')].filter((element) => !element.disabled);
        if (!items.length) return;
        const [first, last] = [items[0], items[items.length - 1]];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.({ preventScroll: true }); };
  }, [onClose]);

  const add = async (event) => {
    event.preventDefault();
    const problem = roleNameProblem(name);
    if (problem) { setMessage({ tone: 'error', text: problem }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.addMockRole({ name: name.trim().replace(/\s+/g, ' '), company: company.company });
      setMessage({ tone: 'success', text: `${result?.name || name} is saved. It now appears first for ${company.company} when creating a mock.` });
      setName('');
      roles.reload();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message || 'The role could not be added.' });
    } finally {
      setSaving(false);
    }
  };

  const list = (items, emptyText) => items.length ? <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
    {items.map((role) => <li key={role.name} className="flex items-center gap-2.5 py-2">
      <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 dark:text-zinc-100">{role.name}</span>
      <RoleBadges role={role} className="shrink-0 justify-end" />
    </li>)}
  </ul> : <p className="py-3 text-[12.5px] text-slate-500 dark:text-zinc-400">{emptyText}</p>;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/40" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={panelRef} data-guide="pmc-roles" role="dialog" aria-modal="true" aria-labelledby="pmc-roles-title"
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#1f1f1f]">
        <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
          <CompanyLogo name={company.company} logo={company.logo} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Roles</p>
            <h2 id="pmc-roles-title" className="truncate text-base font-semibold text-slate-950 dark:text-zinc-50">{company.company}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close roles" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <form onSubmit={add} className="space-y-2">
            <label htmlFor="pmc-add-role" className="block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">Add a role</label>
            <div className="flex gap-2">
              <input id="pmc-add-role" ref={inputRef} value={name} onChange={(event) => { setName(event.target.value); setMessage(null); }} maxLength={80}
                placeholder="e.g. SDE 1, Data Analyst" className={`${inputClass} py-2`} />
              <button type="submit" disabled={saving || !name.trim()} className={`${primaryButton} shrink-0 px-3 py-2`}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}Add
              </button>
            </div>
            {message ? <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-[12px] ${message.tone === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{message.text}</p>
              : <p className="text-[12px] text-slate-500 dark:text-zinc-400">Saved roles appear in the Role list for every mock, first for this company.</p>}
          </form>
          <label className="relative block">
            <span className="sr-only">Search roles</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles" className={`${inputClass} py-2 pl-9`} />
          </label>
          {roles.error && <Notice tone="error">{roles.error}</Notice>}
          {roles.loading && !roles.company.length && !roles.shared.length ? <div className="space-y-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-zinc-800" />)}</div> : <>
            <section>
              <h3 className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-zinc-400">Roles at {company.company}<span className="tabular-nums">{own.length}</span></h3>
              <p className="mt-0.5 text-[11.5px] text-slate-400 dark:text-zinc-500">Reported by students after interviews, used by its mocks, or added here.</p>
              {list(own, needle ? 'No role here matches your search.' : 'None yet. Add one above, or pick any role when creating a mock.')}
            </section>
            <section>
              <h3 className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-zinc-400">All other roles<span className="tabular-nums">{shared.length}</span></h3>
              {list(shared.slice(0, 300), needle ? 'No other role matches your search.' : 'No other roles yet.')}
              {shared.length > 300 && <p className="pt-1 text-[11.5px] text-slate-400">{shared.length - 300} more: search to find them.</p>}
            </section>
          </>}
        </div>
      </aside>
    </div>
  );
}

function CompanyCard({ row, busy, editing, onEdit, onUpload, onRemove, onRoles, onSaved }) {
  const actions = [
    { id: 'find', label: 'Find logo from website', icon: WandSparkles, run: () => onEdit(true) },
    { id: 'upload', label: 'Upload logo', icon: Upload, run: onUpload },
    { id: 'roles', label: 'View roles', icon: BriefcaseBusiness, run: onRoles },
    row.domain && { id: 'site', label: 'Open website', icon: ExternalLink, run: () => window.open(`https://${row.domain}`, '_blank', 'noopener,noreferrer') },
    'divider',
    { id: 'remove', label: 'Remove logo', icon: Trash2, danger: true, disabled: !row.logo, title: row.logo ? undefined : 'This company has no logo', run: onRemove },
  ];
  return (
    <article className={`${card} flex flex-col p-4 transition hover:border-slate-300 hover:shadow-md dark:hover:border-zinc-700`}>
      <div className="flex items-start gap-3">
        <span className="relative">
          <CompanyLogo name={row.company} logo={row.logo} size="2xl" />
          {busy && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-zinc-900/80"><Loader2 className="h-5 w-5 animate-spin text-sky-600" aria-label="Saving" /></span>}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-slate-950 dark:text-zinc-50" title={row.company}>{row.company}</h3>
          {row.domain
            ? <a href={`https://${row.domain}`} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[12px] text-slate-500 hover:text-sky-700 dark:text-zinc-400 dark:hover:text-sky-300"><Globe className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{row.domain}</span></a>
            : <p className="mt-0.5 text-[12px] text-slate-400 dark:text-zinc-500">Website not known</p>}
          <div className="mt-1.5"><SourceBadge logo={row.logo} /></div>
        </div>
        <div data-guide="pmc-logo-actions"><RowMenu name={row.company} actions={actions} /></div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-zinc-900">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Practice questions</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{row.questions.toLocaleString()}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-zinc-900">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Mocks</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{row.mocks}<span className="ml-1 text-[11px] font-medium text-slate-400 dark:text-zinc-500">{row.mocks ? `${row.published} published` : ''}</span></dd>
        </div>
      </dl>
      {editing && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12.5px] font-semibold text-slate-700 dark:text-zinc-200">{row.logo ? 'Replace logo' : 'Add logo'}</p>
          <button type="button" onClick={() => onEdit(false)} aria-label="Close logo editor" className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"><X className="h-3.5 w-3.5" /></button>
        </div>
        <CompanyLogoEditor compact autoFocus company={row.company} domain={row.domain} onSaved={onSaved} />
      </div>}
      <div className="mt-auto flex gap-2 pt-3">
        <button type="button" data-guide="pmc-roles-open" onClick={onRoles} className={`${secondaryButton} flex-1 px-3 py-2 text-[13px]`}><BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />Roles</button>
        {!editing && <button type="button" onClick={() => onEdit(true)} className={`${secondaryButton} flex-1 px-3 py-2 text-[13px]`}><ImagePlus className="h-4 w-4" aria-hidden="true" />{row.logo ? 'Change logo' : 'Add logo'}</button>}
      </div>
    </article>
  );
}

/** Admin: the companies a Prep Mock can be for, their logos, and the roles each mock can be for. */
export default function MockCompaniesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // ?company=Google (from a company's menu on All Mocks) opens the page searched to that company.
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('company') || '');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('mocks');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState('');
  const [busy, setBusy] = useState({});
  const [rolesFor, setRolesFor] = useState(null);
  const [message, setMessage] = useState(null);
  const [run, setRun] = useState(null);
  const stopRef = useRef(false);
  const fileRef = useRef(null);
  const uploadFor = useRef('');
  const deferredSearch = useDeferredValue(search);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const result = await api.listMockCompanies();
      setRows((result.companies || []).filter((row) => row?.company).map(normalise));
    } catch (error) {
      setLoadError(error.message || 'Could not load companies.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { stopRef.current = true; }, []);
  useEffect(() => { setShown(PAGE_SIZE); }, [deferredSearch, filter, sort]);

  const patch = useCallback((company, changes) => {
    const key = String(company).toLowerCase();
    setRows((current) => current.map((row) => (row.company.toLowerCase() === key ? { ...row, ...changes } : row)));
  }, []);
  const setBusyFor = (company, value) => setBusy((current) => ({ ...current, [company]: value }));

  const stats = useMemo(() => {
    const withLogo = rows.filter((row) => row.logo).length;
    return {
      total: rows.length,
      withLogo,
      withoutLogo: rows.length - withLogo,
      findable: rows.filter((row) => !row.logo && row.domain).length,
      withMocks: rows.filter((row) => row.mocks > 0).length,
      mocks: rows.reduce((sum, row) => sum + row.mocks, 0),
      published: rows.reduce((sum, row) => sum + row.published, 0),
    };
  }, [rows]);
  const visible = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const test = FILTERS.find((entry) => entry.value === filter)?.test || (() => true);
    return rows
      .filter((row) => test(row) && (!needle || row.company.toLowerCase().includes(needle) || row.domain.includes(needle)))
      .sort(SORTS[sort]?.compare || SORTS.mocks.compare);
  }, [rows, deferredSearch, filter, sort]);
  const filterOptions = FILTERS.map((entry) => ({ value: entry.value, label: entry.label, count: rows.filter(entry.test).length }));

  const findMissing = async () => {
    stopRef.current = false;
    const saved = [];
    const missed = [];
    let total = null;
    let withoutWebsite = null;
    setRun({ status: 'running', saved, missed, total, estimate: stats.findable, withoutWebsite, error: '' });
    try {
      while (!stopRef.current) {
        const result = await api.fetchMissingCompanyLogos({ limit: 12, skip: missed });
        const batchSaved = result.saved || [];
        const batchMissed = result.missed || [];
        saved.push(...batchSaved);
        missed.push(...batchMissed);
        withoutWebsite = Number(result.withoutWebsite) || 0;
        const remaining = Number(result.remaining) || 0;
        if (total === null) total = saved.length + missed.length + remaining;
        batchSaved.forEach((entry) => patch(entry.company, { logo: entry.logo, ...(entry.domain ? { domain: entry.domain } : {}) }));
        setRun({ status: 'running', saved: [...saved], missed: [...missed], total, estimate: stats.findable, withoutWebsite, error: '' });
        if (!remaining || (!batchSaved.length && !batchMissed.length)) break;
      }
      setRun({ status: stopRef.current ? 'stopped' : 'done', saved, missed, total: stopRef.current ? saved.length + missed.length : total, estimate: 0, withoutWebsite, error: '' });
    } catch (error) {
      setRun({ status: 'error', saved, missed, total: saved.length + missed.length, estimate: 0, withoutWebsite, error: error.message || 'Logos could not be fetched.' });
    }
    load(true);
  };

  const startUpload = (company) => { uploadFor.current = company; fileRef.current?.click(); };
  const uploadPicked = async (file) => {
    const company = uploadFor.current;
    if (!file || !company) return;
    const problem = logoFileProblem(file);
    if (problem) { setMessage({ tone: 'error', text: `${company}: ${problem}` }); return; }
    setBusyFor(company, true);
    try {
      const result = await api.uploadCompanyLogo(company, file);
      patch(company, { logo: result.logo });
      setMessage({ tone: 'success', text: `Logo uploaded for ${company}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: `${company}: ${error.message || 'the logo could not be uploaded.'}` });
    } finally {
      setBusyFor(company, false);
    }
  };
  const removeLogo = async (row) => {
    if (!window.confirm(`Remove the logo of ${row.company}? Students will see its initial instead.`)) return;
    setBusyFor(row.company, true);
    try {
      await api.removeCompanyLogo(row.company);
      patch(row.company, { logo: null });
      setMessage({ tone: 'success', text: `Logo removed for ${row.company}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: `${row.company}: ${error.message || 'the logo could not be removed.'}` });
    } finally {
      setBusyFor(row.company, false);
    }
  };
  const closeRoles = useCallback(() => setRolesFor(null), []);
  const value = (number) => (loading && !rows.length ? '—' : number.toLocaleString());

  return <Page>
    <PageHeader icon={Building2} title="Companies & roles" guide="pmc-header" info={<PageGuideButton />}
      crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'PrepMock', to: '/admin/prepmock' }, { label: 'Companies & roles' }]}
      description="The companies a mock can be for, with the logo students see, and the job roles each mock can be for. Students pick a company, then a role, then its mocks."
      actions={<>
        <button type="button" onClick={() => load()} disabled={loading} className={`${secondaryButton} px-3`} aria-label="Refresh companies" title="Refresh"><RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /></button>
        <button type="button" data-guide="pmc-find-logos" onClick={findMissing} disabled={run?.status === 'running' || loading} className={primaryButton}>
          {run?.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <WandSparkles className="h-4 w-4" aria-hidden="true" />}Find missing logos
        </button>
      </>} />

    <div data-guide="pmc-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Building2} label="Companies" value={value(stats.total)} hint="On Prep Coding or with mocks" tone="sky" />
      <StatCard icon={ImagePlus} label="With logo" value={value(stats.withLogo)} hint={stats.total ? `${Math.round((stats.withLogo / stats.total) * 100)}% of companies` : undefined} tone="emerald" />
      <StatCard icon={ImageOff} label="Without logo" value={value(stats.withoutLogo)} hint={`${stats.findable.toLocaleString()} with a known website`} tone="amber" />
      <StatCard icon={ClipboardList} label="Companies with mocks" value={value(stats.withMocks)} hint={`${plural(stats.mocks, 'mock')} · ${stats.published} published`} tone="violet" />
    </div>

    {run && <LogoRun run={run} onStop={() => { stopRef.current = true; }} onClose={() => setRun(null)} />}
    {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}

    <div data-guide="pmc-toolbar" className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <SearchBox value={search} onChange={setSearch} placeholder="Search companies or websites" label="Search companies" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto"><Segmented label="Show" value={filter} onChange={setFilter} options={filterOptions} /></div>
        <label className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-zinc-400">
          <span className="shrink-0">Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className={`${inputClass} w-auto py-2 pr-8`}>
            {Object.entries(SORTS).map(([key, entry]) => <option key={key} value={key}>{entry.label}</option>)}
          </select>
        </label>
      </div>
    </div>

    <section data-guide="pmc-list" aria-label="Companies" aria-busy={loading}>
      {loadError && <Notice tone="error"><span>{loadError}</span> <button type="button" onClick={() => load()} className="ml-1 font-semibold underline">Try again</button></Notice>}
      {loading && !rows.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className={`${card} h-52 animate-pulse p-4`}><div className="flex gap-3"><div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-zinc-800" /><div className="flex-1 space-y-2"><div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-zinc-800" /><div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-zinc-800" /></div></div></div>)}
        </div>
      ) : !visible.length && !loadError ? (
        <div className={`${card} flex flex-col items-center px-6 py-12 text-center`}>
          <Building2 className="h-8 w-8 text-slate-300 dark:text-zinc-600" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-zinc-100">{rows.length ? 'No company matches' : 'No companies yet'}</h2>
          <p className="mt-1 max-w-sm text-[13px] text-slate-500 dark:text-zinc-400">{rows.length ? 'Try another search or filter.' : 'Companies could not be loaded. Try again.'}</p>
          {rows.length > 0 && <button type="button" onClick={() => { setSearch(''); setFilter('all'); }} className={`${secondaryButton} mt-4 py-2 text-xs`}>Clear search and filter</button>}
        </div>
      ) : <>
        <p className="mb-2 text-[12.5px] text-slate-500 dark:text-zinc-400">Showing {Math.min(shown, visible.length).toLocaleString()} of {companies(visible.length)}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.slice(0, shown).map((row) => <CompanyCard key={row.key} row={row} busy={Boolean(busy[row.company])} editing={editing === row.company}
            onEdit={(open) => setEditing(open ? row.company : '')}
            onUpload={() => startUpload(row.company)}
            onRemove={() => removeLogo(row)}
            onRoles={() => setRolesFor(row)}
            onSaved={(result) => {
              patch(row.company, { logo: result.logo, ...(result.domain ? { domain: result.domain } : {}) });
              setEditing('');
              setMessage({ tone: 'success', text: `Logo saved for ${row.company}.` });
            }} />)}
        </div>
        {shown < visible.length && <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setShown((count) => count + PAGE_SIZE)} className={secondaryButton}>Show {Math.min(PAGE_SIZE, visible.length - shown)} more</button>
        </div>}
      </>}
    </section>

    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" tabIndex={-1} aria-hidden="true"
      onChange={(event) => { const [file] = event.target.files || []; event.target.value = ''; uploadPicked(file); }} />
    {rolesFor && <RolesDrawer company={rolesFor} onClose={closeRoles} />}
  </Page>;
}
