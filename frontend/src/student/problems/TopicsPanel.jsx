import { useCallback, useDeferredValue, useState } from 'react';
import { Maximize2, Search, Shapes } from 'lucide-react';
import TopicBrowser from './TopicBrowser';
import { card, fieldBase, focusRing } from './problemsUi';

const INITIAL = 20;
const SEARCH_LIMIT = 30;

/** The most common topics in a scrolling list that fills its column; the full catalogue opens in the topic browser. */
export default function TopicsPanel({ topics, selected, onSelect, totalProblems }) {
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const closeBrowser = useCallback(() => setBrowsing(false), []);
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const max = Math.max(1, ...topics.map((topic) => Number(topic.count) || 0));
  const matches = deferred ? topics.filter(({ tag }) => tag.toLowerCase().includes(deferred)) : topics;
  // The selected topic stays visible even when it is not among the most common ones.
  const pinned = !deferred && selected ? topics.find(({ tag }) => tag === selected) : null;
  const top = matches.slice(0, deferred ? SEARCH_LIMIT : INITIAL);
  const visible = pinned && !top.includes(pinned) ? [pinned, ...top.slice(0, INITIAL - 1)] : top;
  const row = (active) => `group flex w-full flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left transition-colors ${focusRing} ${active ? 'bg-sky-50 dark:bg-sky-500/10' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.04]'}`;

  return <section aria-labelledby="topics-title" className={`p-4 ${card}`}>
    <header className="flex items-center justify-between gap-3">
      <h2 id="topics-title" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/15" aria-hidden="true"><Shapes className="h-4 w-4" /></span>
        Topics
      </h2>
      <span className="text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">{topics.length.toLocaleString()}</span>
    </header>
    <label className="relative mt-3 block">
      <span className="sr-only">Search topics</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics" className={`w-full pl-9 pr-3 ${fieldBase}`} />
    </label>
    <ul className="mt-2 max-h-[360px] space-y-0.5 overflow-y-auto [scrollbar-width:thin] xl:max-h-[calc(100vh-14rem)]">
      {!deferred && <li><button type="button" aria-pressed={!selected} onClick={() => onSelect('')} className={`${row(!selected)} !flex-row !items-center !gap-3`}>
        <span className={`min-w-0 flex-1 truncate text-[13.5px] font-medium ${!selected ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-zinc-200'}`}>All topics</span>
        <span className="text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">{Number(totalProblems || 0).toLocaleString()}</span>
      </button></li>}
      {visible.map(({ tag, count }) => {
        const active = selected === tag;
        return <li key={tag}><button type="button" aria-pressed={active} onClick={() => onSelect(active ? '' : tag)} className={row(active)}>
          <span className="flex items-center gap-3">
            <span className={`min-w-0 flex-1 truncate text-[13.5px] font-medium ${active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-zinc-200'}`} title={tag}>{tag}</span>
            <span className="text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">{count ?? '—'}</span>
          </span>
          {count != null && <span className="block h-1 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.06]" aria-hidden="true">
            <span className={`block h-full rounded-full ${active ? 'bg-sky-500' : 'bg-violet-300 group-hover:bg-violet-400 dark:bg-violet-400/50'}`} style={{ width: `${Math.max(4, (count / max) * 100)}%` }} />
          </span>}
        </button></li>;
      })}
      {deferred && !matches.length && <li className="px-2.5 py-4 text-[12.5px] text-slate-500 dark:text-zinc-400">No topic matches “{query}”.</li>}
      {deferred && matches.length > SEARCH_LIMIT && <li className="px-2.5 py-2 text-[12px] text-slate-400 dark:text-zinc-500">{matches.length - SEARCH_LIMIT} more in the topic browser</li>}
    </ul>
    {topics.length > 0 && <button type="button" onClick={() => setBrowsing(true)} aria-haspopup="dialog"
      className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e4e7ec] py-2 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-violet-200 hover:bg-violet-50/50 hover:text-violet-700 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.04] ${focusRing}`}>
      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />View all {topics.length.toLocaleString()} topics
    </button>}
    {browsing && <TopicBrowser topics={topics} selected={selected} totalProblems={totalProblems} onSelect={onSelect} onClose={closeBrowser} />}
  </section>;
}
