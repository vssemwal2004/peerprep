import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Map as MapIcon, RefreshCw } from 'lucide-react';
import QuestCard from './QuestCard';
import { QUEST_CATEGORIES, questPercent, questState, questTheme } from './questTheme';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2';

function ActiveQuest({ quest }) {
  const theme = questTheme(quest.theme);
  const percent = questPercent(quest);
  return <li className="flex flex-col gap-3 rounded-2xl border border-[#e9eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center dark:border-white/[0.07] dark:bg-[#232325]">
    <span className={`h-12 w-1.5 shrink-0 rounded-full bg-gradient-to-b ${theme.band} max-sm:hidden`} aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <Link to={`/student/quests/${quest.slug}`} className={`rounded text-[15px] font-semibold text-slate-950 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300 ${focusRing}`}>{quest.title}</Link>
      <p className="mt-0.5 truncate text-[12.5px] text-slate-500 dark:text-zinc-400">
        {quest.lastProblem ? <>Last opened: <span className="font-medium text-slate-700 dark:text-zinc-200">{quest.lastProblem.title}</span></> : 'Started, no question opened yet'}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="progressbar" aria-label={`${quest.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span className={`block h-full rounded-full ${theme.bar}`} style={{ width: `${percent}%` }} />
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-400"><strong className="font-semibold text-slate-900 dark:text-zinc-100">{quest.solved}</strong>/{quest.total}</span>
      </div>
    </div>
    <Link to={quest.lastProblem?.href || `/student/quests/${quest.slug}`} className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-sky-700 ${focusRing}`}>
      Continue<ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  </li>;
}

/** "Your quests" (in progress) and the full catalogue with category filters. */
export default function QuestsSection({ quests, loading, error, onRetry }) {
  const [category, setCategory] = useState('all');
  const active = quests.filter((quest) => questState(quest) === 'active')
    .sort((a, b) => new Date(b.lastViewedAt || b.startedAt || 0) - new Date(a.lastViewedAt || a.startedAt || 0));
  const used = new Set(quests.map((quest) => quest.category));
  const filters = QUEST_CATEGORIES.filter((entry) => used.has(entry.value));
  const visible = quests.filter((quest) => category === 'all' || quest.category === category);
  const completed = quests.filter((quest) => questState(quest) === 'completed').length;

  return <section aria-labelledby="quests-title" className="quests-section mt-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="quests-title" className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-zinc-50"><MapIcon className="h-5 w-5 text-sky-600" aria-hidden="true" />Quests</h2>
        <p className="mt-0.5 text-[13px] text-slate-500 dark:text-zinc-400">Curated question sets from your university. Finish one to earn its badge and XP.</p>
      </div>
      {quests.length > 0 && <p className="text-[12.5px] text-slate-500 dark:text-zinc-400"><strong className="font-semibold text-slate-900 dark:text-zinc-100">{completed}</strong> of {quests.length} completed</p>}
    </header>

    {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      {error}<button type="button" onClick={onRetry} className={`inline-flex items-center gap-1 font-medium ${focusRing}`}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Retry</button>
    </div>}

    {loading && !quests.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading quests">{[0, 1, 2].map((key) => <div key={key} className="h-[250px] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-white/[0.05]" />)}</div>
      : !quests.length && !error ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-white/10 dark:bg-[#232325]">
        <MapIcon className="mx-auto h-7 w-7 text-sky-500" aria-hidden="true" />
        <h3 className="mt-3 text-[15px] font-semibold">No quests yet</h3>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">Your university has not published any quests. Your daily challenge is waiting above.</p>
      </div> : <>
        {active.length > 0 && <div className="mt-5">
          <h3 className="text-[13px] font-medium text-slate-500 dark:text-zinc-400">In progress</h3>
          <ul className="mt-2 space-y-2">{active.slice(0, 3).map((quest) => <ActiveQuest key={quest.id} quest={quest} />)}</ul>
        </div>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-slate-500 dark:text-zinc-400">Explore quests</h3>
          {filters.length > 1 && <div role="radiogroup" aria-label="Quest type" className="flex flex-wrap gap-1.5">
            {[{ value: 'all', label: 'All' }, ...filters].map((entry) => <button key={entry.value} type="button" role="radio" aria-checked={category === entry.value} onClick={() => setCategory(entry.value)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${focusRing} ${category === entry.value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-[#232325] dark:text-zinc-300 dark:ring-white/10'}`}>{entry.label}</button>)}
          </div>}
        </div>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((quest) => <li key={quest.id} className="flex"><div className="flex w-full flex-col [&>a]:flex-1"><QuestCard quest={quest} /></div></li>)}</ul>
      </>}
  </section>;
}
