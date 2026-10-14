import { useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, EyeOff, Save } from 'lucide-react';
import { api } from '../../../utils/api';
import { SearchBox, Segmented } from '../../quickprep/ui';
import { EmptyState, SectionCard } from './primitives';
import { formatDateTime } from './universityModel';
import { ghostButton, primaryButton, secondaryButton } from './styles';

const PAGE = 20;
const keyOf = (row) => `assessment:${row._id}`;
const sameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value));

/**
 * Grants published assessments from the central library to selected universities.
 * Unsaved selections are kept per assessment until saved; the stored access is the baseline.
 */
export default function SharedAssessmentsPanel({ catalog, universities, run, busyIn }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [drafts, setDrafts] = useState({});
  const [limit, setLimit] = useState(PAGE);
  const publications = useMemo(() => new Map((catalog?.publications || []).filter((item) => item.kind === 'assessment').map((item) => [`assessment:${item.contentId}`, item])), [catalog]);
  const assessments = useMemo(() => catalog?.assessments || [], [catalog]);
  const counts = useMemo(() => {
    const published = assessments.filter((row) => publications.get(keyOf(row))?.published).length;
    return { all: assessments.length, published, hidden: assessments.length - published };
  }, [assessments, publications]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assessments.filter((row) => {
      const published = Boolean(publications.get(keyOf(row))?.published);
      if (filter === 'published' && !published) return false;
      if (filter === 'hidden' && published) return false;
      return !term || String(row.title || row._id).toLowerCase().includes(term);
    });
  }, [assessments, publications, search, filter]);

  if (!assessments.length) {
    return <SectionCard><EmptyState icon={ClipboardList} title="No assessments yet">Assessments created in the main admin library appear here so you can share them with universities.</EmptyState></SectionCard>;
  }

  return <div className="space-y-4">
    <p className="text-sm text-slate-500 dark:text-zinc-400">Public, published coding problems are shared automatically with universities that have Coding Problems enabled. Private problems stay in the main admin library and can still be used inside the assessments you share here.</p>
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchBox value={search} onChange={(value) => { setSearch(value); setLimit(PAGE); }} placeholder="Search assessments" label="Search assessments" />
      <div className="max-w-full overflow-x-auto">
        <Segmented label="Visibility" value={filter} onChange={(value) => { setFilter(value); setLimit(PAGE); }}
          options={[{ value: 'all', label: 'All', count: counts.all }, { value: 'published', label: 'Published', count: counts.published }, { value: 'hidden', label: 'Hidden', count: counts.hidden }]} />
      </div>
    </div>
    {!visible.length ? <SectionCard><p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-400">No assessment matches these filters.</p></SectionCard>
      : <ul className="space-y-3">
        {visible.slice(0, limit).map((row) => {
          const key = keyOf(row);
          const publication = publications.get(key);
          const stored = publication?.universityIds || [];
          const selected = drafts[key] ?? stored;
          const dirty = !sameSet(selected, stored);
          const busy = busyIn(`publication:${row._id}:`);
          const setSelected = (next) => setDrafts((previous) => ({ ...previous, [key]: next }));
          const clearDraft = () => setDrafts((previous) => { const next = { ...previous }; delete next[key]; return next; });
          const save = (published) => run(`publication:${row._id}:${published ? 'save' : 'hide'}`,
            () => api.publishPlatformContent('assessment', row._id, { published, universityIds: selected }),
            published ? `Access saved for “${row.title || 'assessment'}”.` : `“${row.title || 'Assessment'}” is hidden from universities.`).then((ok) => { if (ok) clearDraft(); });
          return <li key={key} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-[#242424]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-zinc-50">{row.title || String(row._id)}</h3>
                  {publication?.published
                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">Published · {stored.length} {stored.length === 1 ? 'university' : 'universities'}</span>
                    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700">Hidden</span>}
                  {dirty && <span className="text-[11.5px] font-semibold text-sky-700 dark:text-sky-300">Unsaved changes</span>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 dark:text-zinc-400">
                  {row.lifecycleStatus && <span className="capitalize">{row.lifecycleStatus}</span>}
                  {(row.startTime || row.endTime) && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{formatDateTime(row.startTime)} – {formatDateTime(row.endTime)}</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${secondaryButton} px-3 py-2`} disabled={Boolean(busy)} onClick={() => save(false)}><EyeOff className="h-4 w-4" aria-hidden="true" />{busy === 'hide' ? 'Hiding…' : 'Hide'}</button>
                <button type="button" className={`${primaryButton} px-3 py-2`} disabled={Boolean(busy)} onClick={() => save(true)}><Save className="h-4 w-4" aria-hidden="true" />{busy === 'save' ? 'Saving…' : 'Save access'}</button>
              </div>
            </div>
            {universities.length ? <fieldset className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-zinc-900/60">
              <legend className="sr-only">Universities that can use {row.title || 'this assessment'}</legend>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <span className="font-semibold text-slate-600 dark:text-zinc-300">{selected.length} of {universities.length} selected</span>
                <span className="flex gap-1">
                  <button type="button" className={ghostButton} disabled={Boolean(busy)} onClick={() => setSelected(universities.map((university) => university.universityId))}>Select all</button>
                  <button type="button" className={ghostButton} disabled={Boolean(busy) || !selected.length} onClick={() => setSelected([])}>Select none</button>
                </span>
              </div>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {universities.map((university) => <label key={university.universityId} className="flex min-w-0 items-center gap-2 text-[13px] text-slate-700 dark:text-zinc-200">
                  <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500" disabled={Boolean(busy)} checked={selected.includes(university.universityId)}
                    onChange={(event) => setSelected(event.target.checked ? [...selected, university.universityId] : selected.filter((id) => id !== university.universityId))} />
                  <span className="truncate" title={`${university.name} (${university.universityId})`}>{university.name}</span>
                </label>)}
              </div>
            </fieldset> : <p className="mt-3 text-[12.5px] text-slate-500 dark:text-zinc-400">Add a university first to share this assessment.</p>}
          </li>;
        })}
      </ul>}
    {visible.length > limit && <div className="flex justify-center"><button type="button" className={secondaryButton} onClick={() => setLimit((value) => value + PAGE)}>Show more ({visible.length - limit} remaining)</button></div>}
  </div>;
}
