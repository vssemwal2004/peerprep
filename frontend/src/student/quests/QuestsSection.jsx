import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleCheck, Layers, PlayCircle, RefreshCw, Search, Sparkles, Zap } from 'lucide-react';
import QuestCard from './QuestCard';
import { QUEST_CATEGORIES, questCategory, questPercent, questState, questTheme } from './questTheme';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2';

function ActiveQuest({ quest }) {
  const theme = questTheme(quest.theme);
  const percent = questPercent(quest);
  const Icon = questCategory(quest.category).icon;
  return <li className="group flex flex-col gap-3 rounded-2xl border border-[#e9eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-26px_rgba(15,23,42,0.5)] motion-reduce:transform-none sm:flex-row sm:items-center dark:border-white/[0.07] dark:bg-[#232325]">
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md max-sm:hidden ${theme.band}`}><Icon className="h-6 w-6" aria-hidden="true" /></span>
    <div className="min-w-0 flex-1">
      <Link to={`/student/quickprep/${quest.slug}`} className={`rounded text-[15px] font-semibold text-slate-950 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300 ${focusRing}`}>{quest.title}</Link>
      <p className="mt-0.5 truncate text-[12.5px] text-slate-500 dark:text-zinc-400">
        {quest.lastProblem ? <>Last opened: <span className="font-medium text-slate-700 dark:text-zinc-200">{quest.lastProblem.title}</span></> : 'Started, no question opened yet'}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="progressbar" aria-label={`${quest.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span className={`block h-full rounded-full ${theme.bar} transition-[width] duration-700`} style={{ width: `${percent}%` }} />
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-400"><strong className="font-semibold text-slate-900 dark:text-zinc-100">{quest.solved}</strong>/{quest.total} · {percent}%</span>
      </div>
    </div>
    <Link to={quest.lastProblem?.href || `/student/quickprep/${quest.slug}`} className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-sky-600/30 transition hover:bg-sky-700 ${focusRing}`}>
      <PlayCircle className="h-4 w-4" aria-hidden="true" />Continue
    </Link>
  </li>;
}

/** QuickPrep sets in progress, then the full catalogue with type filters and search. */
export default function QuestsSection({ quests, loading, error, onRetry }) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const active = quests.filter((quest) => questState(quest) === 'active')
    .sort((a, b) => new Date(b.lastViewedAt || b.startedAt || 0) - new Date(a.lastViewedAt || a.startedAt || 0));
  const used = new Set(quests.map((quest) => quest.category));
  const filters = QUEST_CATEGORIES.filter((entry) => used.has(entry.value));
  const term = search.trim().toLowerCase();
  const visible = quests.filter((quest) => (category === 'all' || quest.category === category)
    && (!term || [quest.title, quest.description, ...(quest.companies || []), ...(quest.topics || [])].some((value) => String(value || '').toLowerCase().includes(term))));
  const completed = quests.filter((quest) => questState(quest) === 'completed').length;
  const xpLeft = quests.filter((quest) => !quest.completedAt).reduce((sum, quest) => sum + (quest.rewardXp || 0), 0);

  return <section aria-labelledby="quests-title" className="quests-section mt-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="quests-title" className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-zinc-50"><Zap className="h-5 w-5 text-sky-600" aria-hidden="true" />QuickPrep</h2>
        <p className="mt-0.5 text-[13px] text-slate-500 dark:text-zinc-400">Curated question sets from your university. Finish one to earn its badge and XP.</p>
      </div>
      {quests.length > 0 && <dl className="flex flex-wrap gap-2 text-[12px]">
        <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-inset ring-slate-200 dark:bg-[#232325] dark:ring-white/10"><Layers className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" /><dt className="text-slate-500 dark:text-zinc-400">Available</dt><dd className="font-semibold tabular-nums">{quests.length}</dd></div>
        <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-inset ring-slate-200 dark:bg-[#232325] dark:ring-white/10"><CircleCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /><dt className="text-slate-500 dark:text-zinc-400">Completed</dt><dd className="font-semibold tabular-nums">{completed}</dd></div>
        <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-inset ring-slate-200 dark:bg-[#232325] dark:ring-white/10"><Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" /><dt className="text-slate-500 dark:text-zinc-400">XP to earn</dt><dd className="font-semibold tabular-nums">{xpLeft}</dd></div>
      </dl>}
    </header>

    {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      {error}<button type="button" onClick={onRetry} className={`inline-flex items-center gap-1 font-medium ${focusRing}`}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Retry</button>
    </div>}

    {loading && !quests.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading QuickPrep">{[0, 1, 2].map((key) => <div key={key} className="h-[300px] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-white/[0.05]" />)}</div>
      : !quests.length && !error ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-[#232325]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25"><Zap className="h-6 w-6" aria-hidden="true" /></span>
        <h3 className="mt-3 text-[15px] font-semibold">No QuickPrep yet</h3>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">Your university has not published a QuickPrep for your semester yet. Your daily challenge is waiting above.</p>
      </div> : <>
        {active.length > 0 && <div className="mt-5">
          <h3 className="text-[13px] font-semibold text-slate-500 dark:text-zinc-400">In progress</h3>
          <ul className="mt-2 space-y-2">{active.slice(0, 3).map((quest) => <ActiveQuest key={quest.id} quest={quest} />)}</ul>
        </div>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold text-slate-500 dark:text-zinc-400">Explore</h3>
            {filters.length > 1 && <div role="radiogroup" aria-label="QuickPrep type" className="flex flex-wrap gap-1.5">
              {[{ value: 'all', label: 'All' }, ...filters].map((entry) => <button key={entry.value} type="button" role="radio" aria-checked={category === entry.value} onClick={() => setCategory(entry.value)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${focusRing} ${category === entry.value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-[#232325] dark:text-zinc-300 dark:ring-white/10'}`}>{entry.label}</button>)}
            </div>}
          </div>
          {quests.length > 3 && <label className="relative w-full sm:w-64">
            <span className="sr-only">Search QuickPrep</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company or topic" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-white/10 dark:bg-[#232325] dark:focus:ring-sky-500/15" />
          </label>}
        </div>
        {!visible.length ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-[13px] text-slate-500 dark:border-white/10 dark:text-zinc-400">No QuickPrep matches. <button type="button" onClick={() => { setSearch(''); setCategory('all'); }} className="font-semibold text-sky-700 underline dark:text-sky-300">Show all</button></p>
          : <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((quest) => <li key={quest.id} className="flex"><div className="flex w-full flex-col [&>a]:flex-1"><QuestCard quest={quest} /></div></li>)}</ul>}
        <p className="mt-3 flex items-center gap-1 text-[12px] text-slate-400"><ArrowRight className="h-3 w-3" aria-hidden="true" />Questions you already solved count the moment you start a QuickPrep.</p>
      </>}
  </section>;
}
