import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDownAZ, ArrowDownWideNarrow, Blocks, Check, ChevronRight, Search, X } from 'lucide-react';
import { brandTile, fieldBase, focusRing, topicBar } from './problemsUi';
import GuideInfo from '../../guide/platform/GuideInfo';

const CHUNK = 150;
const SORTS = [
  { value: 'count', label: 'Most questions', icon: ArrowDownWideNarrow },
  { value: 'name', label: 'A–Z', icon: ArrowDownAZ },
];

/** The title-bar button that opens the Topics drawer; shows the chosen topic once one is picked. */
export function TopicsButton({ count, selected, open, onOpen, buttonRef }) {
  return <button ref={buttonRef} type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open} data-guide="pc-topics"
    className={`group inline-flex h-9 max-w-[18rem] items-center gap-2 rounded-xl border pl-1 pr-2.5 text-[13px] font-semibold transition-[border-color,background-color,box-shadow] ${focusRing} ${selected
      ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100'
      : 'border-[#e6e7eb] bg-white text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-violet-200 hover:text-violet-700 dark:border-white/[0.08] dark:bg-[#242424] dark:text-zinc-200 dark:hover:border-violet-400/30 dark:hover:text-violet-200'}`}>
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${brandTile}`} aria-hidden="true"><Blocks className="h-3.5 w-3.5" /></span>
    <span className="min-w-0 truncate">{selected || 'Topics'}</span>
    {!selected && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-500 dark:bg-white/[0.07] dark:text-zinc-400">{Number(count || 0).toLocaleString()}</span>}
    <ChevronRight className="h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  </button>;
}

function TopicRow({ tag, count, max, active, onPick }) {
  return <li>
    <button type="button" aria-pressed={active} onClick={() => onPick(tag)}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0 ${active
        ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25'
        : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.04]'}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold ${active ? 'text-violet-800 dark:text-violet-100' : 'text-slate-800 dark:text-zinc-100'}`} title={tag}>{tag}</span>
          <span className={`text-[12px] tabular-nums ${active ? 'font-semibold text-violet-700 dark:text-violet-200' : 'text-slate-400 dark:text-zinc-500'}`}>{count == null ? '—' : Number(count).toLocaleString()}</span>
        </span>
        {count != null && <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.06]" aria-hidden="true">
          <span className={`block h-full rounded-full ${active ? 'bg-gradient-to-r from-violet-500 to-indigo-500' : `${topicBar(tag)} opacity-70 group-hover:opacity-100`}`} style={{ width: `${Math.max(3, (count / max) * 100)}%` }} />
        </span>}
      </span>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${active ? 'bg-violet-600 text-white' : 'text-transparent'}`} aria-hidden="true"><Check className="h-3 w-3" strokeWidth={3} /></span>
    </button>
  </li>;
}

/**
 * Every topic in a drawer that slides in from the right. Searchable and sortable; the list scrolls
 * (wheel, touch, keys) without a visible scrollbar. Picking a topic filters the list and closes it.
 */
export default function TopicsDrawer({ open, onClose, topics, selected, onSelect, totalProblems, returnFocusRef }) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('count');
  const [limit, setLimit] = useState(CHUNK);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const max = Math.max(1, ...topics.map((topic) => Number(topic.count) || 0));
  // The effect below runs once per opening, whatever the parent passes on later renders.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onClose = () => closeRef.current();
    const returnTo = returnFocusRef?.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      // Keep Tab inside the drawer while it is open.
      const items = [...panelRef.current.querySelectorAll('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [open, returnFocusRef]);

  const groups = useMemo(() => {
    const matches = deferred ? topics.filter(({ tag }) => tag.toLowerCase().includes(deferred)) : topics;
    const ordered = sort === 'name' ? [...matches].sort((a, b) => a.tag.localeCompare(b.tag)) : matches;
    const shown = ordered.slice(0, limit);
    if (sort === 'count') return { total: ordered.length, shown: shown.length, list: [{ key: 'all', items: shown }] };
    const byLetter = new Map();
    for (const topic of shown) {
      const letter = /[a-z]/i.test(topic.tag[0]) ? topic.tag[0].toUpperCase() : '#';
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(topic);
    }
    return { total: ordered.length, shown: shown.length, list: [...byLetter].map(([key, items]) => ({ key, items })) };
  }, [deferred, sort, topics, limit]);

  const pick = (tag) => { onSelect(selected === tag ? '' : tag); onClose(); };
  const slide = reduceMotion ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } };

  return createPortal(<AnimatePresence>
    {open && <div className="fixed inset-0 z-[150]" key="topics-drawer">
      <motion.div aria-hidden="true" onMouseDown={onClose} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
      <motion.aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="topics-drawer-title" {...slide}
        transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 40 }}
        className="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-white shadow-[-24px_0_60px_-28px_rgba(16,24,40,0.45)] dark:bg-[#1f1f1f] sm:inset-y-3 sm:right-3 sm:w-[420px] sm:rounded-2xl sm:border sm:border-[#e9eaee] sm:dark:border-white/[0.08] font-dmsans text-slate-900 dark:text-zinc-100">
        <header className="relative shrink-0 overflow-hidden border-b border-[#eef0f3] px-5 pb-4 pt-5 dark:border-white/[0.06]">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(420px_140px_at_0%_-30%,rgba(139,92,246,0.14),transparent_70%)] dark:bg-[radial-gradient(420px_140px_at_0%_-30%,rgba(139,92,246,0.22),transparent_70%)]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${brandTile}`} aria-hidden="true"><Blocks className="h-[18px] w-[18px]" /></span>
              <div>
                <h2 id="topics-drawer-title" className="flex items-center gap-1.5 text-[17px] font-semibold tracking-[-0.01em]">
                  Topics <span className="rounded-full bg-slate-100 px-2 text-[11.5px] font-semibold tabular-nums text-slate-600 dark:bg-white/[0.08] dark:text-zinc-300">{topics.length.toLocaleString()}</span>
                  <GuideInfo step="pc-topics" />
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-zinc-400">Pick one to practise only its questions.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close topics" className={`flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-[#f3f4f6] hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white ${focusRing}`}><X className="h-5 w-5" /></button>
          </div>
          <div className="relative mt-4 flex items-center gap-2">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search topics</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input ref={inputRef} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(CHUNK); }} placeholder="Search topics"
                className={`w-full pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden ${fieldBase}`} />
              {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear topic search"
                className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 ${focusRing}`}><X className="h-3.5 w-3.5" /></button>}
            </label>
            <div role="radiogroup" aria-label="Sort topics" className="flex h-10 shrink-0 items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.05]">
              {SORTS.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" aria-checked={sort === value} aria-label={label} title={label}
                onClick={() => { setSort(value); setLimit(CHUNK); }}
                className={`flex h-full w-9 items-center justify-center rounded-[10px] transition-colors ${focusRing} ${sort === value ? 'bg-white text-violet-700 shadow-sm dark:bg-white/[0.12] dark:text-violet-200' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>)}
            </div>
          </div>
        </header>

        {/* Scrolls with wheel, touch and keys, without a visible scrollbar. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!deferred && <button type="button" aria-pressed={!selected} onClick={() => { onSelect(''); onClose(); }}
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0 ${!selected
              ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25'
              : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.04]'}`}>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13.5px] font-semibold ${!selected ? 'text-violet-800 dark:text-violet-100' : 'text-slate-800 dark:text-zinc-100'}`}>All topics</span>
              <span className="block text-[11.5px] text-slate-500 dark:text-zinc-400">{Number(totalProblems || 0).toLocaleString()} questions</span>
            </span>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${!selected ? 'bg-violet-600 text-white' : 'text-transparent'}`} aria-hidden="true"><Check className="h-3 w-3" strokeWidth={3} /></span>
          </button>}
          <p className="px-3 pb-1 text-[11px] font-medium text-slate-400 dark:text-zinc-500" aria-live="polite">
            {deferred ? `${groups.total.toLocaleString()} matching ${groups.total === 1 ? 'topic' : 'topics'}` : sort === 'count' ? 'Most questions first' : 'A to Z'}
          </p>
          {!groups.total && <p className="px-3 py-10 text-center text-[13px] text-slate-500 dark:text-zinc-400">No topic matches “{query}”.</p>}
          {groups.list.map((group) => <section key={group.key} aria-label={group.key === 'all' ? undefined : `Topics starting with ${group.key}`}>
            {group.key !== 'all' && <h3 className="sticky top-[-12px] z-10 flex items-center gap-2 bg-white/95 px-3 pb-1 pt-3 backdrop-blur dark:bg-[#1f1f1f]/95">
              <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">{group.key}</span>
              <span className="h-px flex-1 bg-[#eef0f3] dark:bg-white/[0.06]" aria-hidden="true" />
            </h3>}
            <ul className="space-y-0.5">
              {group.items.map(({ tag, count }) => <TopicRow key={tag} tag={tag} count={count} max={max} active={selected === tag} onPick={pick} />)}
            </ul>
          </section>)}
          {groups.shown < groups.total && <button type="button" onClick={() => setLimit((value) => value + CHUNK)}
            className={`mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#e6e7eb] text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/[0.04] ${focusRing}`}>
            Show more<span className="font-medium text-slate-400 dark:text-zinc-500">· {(groups.total - groups.shown).toLocaleString()} left</span>
          </button>}
        </div>

        {selected && <footer className="flex shrink-0 items-center gap-2 border-t border-[#eef0f3] px-4 py-3 dark:border-white/[0.06]">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-500 dark:text-zinc-400">Showing <b className="font-semibold text-slate-800 dark:text-zinc-100">{selected}</b></span>
          <button type="button" onClick={() => { onSelect(''); onClose(); }}
            className={`inline-flex h-9 items-center gap-1 rounded-xl border border-[#e6e7eb] px-3 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/[0.04] ${focusRing}`}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />Clear topic
          </button>
        </footer>}
      </motion.aside>
    </div>}
  </AnimatePresence>, document.body);
}
