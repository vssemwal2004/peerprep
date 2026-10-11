import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Search, Shapes, X } from 'lucide-react';
import { fieldBase, focusRing } from './problemsUi';

const SORTS = [['count', 'Most questions'], ['name', 'A–Z']];

/** Every topic, searchable and sortable. Built for catalogues with hundreds or thousands of tags. */
export default function TopicBrowser({ topics, selected, totalProblems, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('count');
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const max = Math.max(1, ...topics.map((topic) => Number(topic.count) || 0));

  useEffect(() => {
    const escape = (event) => { if (event.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape); };
  }, [onClose]);

  const groups = useMemo(() => {
    const matches = topics.filter(({ tag }) => tag.toLowerCase().includes(deferred));
    if (sort === 'count') return [{ key: 'all', items: matches }];
    const byLetter = new Map();
    for (const topic of [...matches].sort((a, b) => a.tag.localeCompare(b.tag))) {
      const letter = /[a-z]/i.test(topic.tag[0]) ? topic.tag[0].toUpperCase() : '#';
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(topic);
    }
    return [...byLetter].map(([key, items]) => ({ key, items }));
  }, [deferred, sort, topics]);
  const matchCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const choose = (tag) => { onSelect(tag); onClose(); };

  return <div className="fixed inset-0 z-[150] flex items-start justify-center bg-slate-950/40 p-4 pt-[8vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="topic-browser-title"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex max-h-[84vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#e9eaee] bg-white shadow-[0_32px_64px_-32px_rgba(16,24,40,0.5)] dark:border-white/[0.08] dark:bg-[#232325]">
      <header className="border-b border-[#f0f1f4] p-5 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <h2 id="topic-browser-title" className="flex items-center gap-2.5 text-[18px] font-semibold tracking-[-0.01em]">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" aria-hidden="true"><Shapes className="h-4 w-4" /></span>
            All topics <span className="text-[13px] font-normal tabular-nums text-slate-400">{topics.length.toLocaleString()}</span>
          </h2>
          <button type="button" onClick={onClose} aria-label="Close topics" className={`rounded-lg p-2 text-slate-500 hover:bg-[#f3f4f6] dark:text-zinc-400 dark:hover:bg-white/[0.06] ${focusRing}`}><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative block min-w-[220px] flex-1">
            <span className="sr-only">Search all topics</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics" className={`w-full pl-9 pr-3 ${fieldBase}`} />
          </label>
          <div role="radiogroup" aria-label="Sort topics" className="flex h-10 items-center rounded-xl border border-[#e4e7ec] p-1 dark:border-white/10">
            {SORTS.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={sort === value} onClick={() => setSort(value)}
              className={`h-full rounded-lg px-3 text-[12.5px] font-medium ${focusRing} ${sort === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-[#f3f4f6] dark:text-zinc-300 dark:hover:bg-white/[0.06]'}`}>{label}</button>)}
          </div>
          <button type="button" onClick={() => choose('')} aria-pressed={!selected}
            className={`h-10 rounded-xl px-3 text-[12.5px] font-medium ${focusRing} ${!selected ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'border border-[#e4e7ec] text-slate-600 hover:bg-[#f3f4f6] dark:border-white/10 dark:text-zinc-300'}`}>
            All topics · {Number(totalProblems || 0).toLocaleString()}
          </button>
        </div>
        <p className="mt-2 text-[12px] text-slate-500 dark:text-zinc-400" aria-live="polite">{deferred ? `${matchCount.toLocaleString()} matching topics` : 'Pick a topic to see its questions.'}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {!matchCount && <p className="py-10 text-center text-[13px] text-slate-500 dark:text-zinc-400">No topic matches “{query}”.</p>}
        {groups.map((group) => <section key={group.key} aria-label={group.key === 'all' ? undefined : `Topics starting with ${group.key}`} className="mb-4 last:mb-0">
          {group.key !== 'all' && <h3 className="sticky top-0 z-10 mb-2 bg-white/95 py-1 text-[12px] font-semibold text-slate-400 backdrop-blur dark:bg-[#232325]/95 dark:text-zinc-500">{group.key}</h3>}
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map(({ tag, count }) => {
              const active = selected === tag;
              return <li key={tag}><button type="button" aria-pressed={active} onClick={() => choose(tag)}
                className={`group flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2 text-left transition-colors ${focusRing} ${active ? 'border-sky-200 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-500/10' : 'border-[#eef0f3] hover:border-violet-200 hover:bg-violet-50/40 dark:border-white/[0.06] dark:hover:bg-white/[0.04]'}`}>
                <span className="flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-800 dark:text-zinc-100'}`} title={tag}>{tag}</span>
                  <span className="text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">{count ?? '—'}</span>
                </span>
                {count != null && <span className="block h-1 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.06]" aria-hidden="true">
                  <span className={`block h-full rounded-full ${active ? 'bg-sky-500' : 'bg-violet-300 dark:bg-violet-400/50'}`} style={{ width: `${Math.max(3, (count / max) * 100)}%` }} />
                </span>}
              </button></li>;
            })}
          </ul>
        </section>)}
      </div>
    </div>
  </div>;
}
