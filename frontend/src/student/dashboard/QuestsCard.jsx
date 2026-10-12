import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Sparkles, Zap } from 'lucide-react';
import useQuests from '../quests/useQuests';
import { questCategory, questPercent, questState, questTheme } from '../quests/questTheme';
import { card, focusRing, Skeleton, textLink, Unavailable } from './ui';

/** QuickPreps in progress first; otherwise a few to start. Each row lifts and reveals its action on hover. */
export default function QuestsCard() {
  const { quests, loading, error, reload } = useQuests();
  const active = quests.filter((quest) => questState(quest) === 'active')
    .sort((a, b) => new Date(b.lastViewedAt || b.startedAt || 0) - new Date(a.lastViewedAt || a.startedAt || 0));
  const fresh = quests.filter((quest) => questState(quest) === 'new');
  const shown = [...active, ...fresh].slice(0, 3);
  const completed = quests.filter((quest) => questState(quest) === 'completed').length;

  return <section aria-labelledby="dashboard-quests-title" className={`flex h-full flex-col p-5 ${card}`}>
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25"><Zap className="h-4 w-4" aria-hidden="true" /></span>
        <div>
          <h2 id="dashboard-quests-title" className="text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-100">Your QuickPreps</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-zinc-400">{active.length ? 'Pick up where you left off' : completed ? `${completed} completed · start another` : 'Curated sets from your university'}</p>
        </div>
      </div>
      <Link className={`${textLink} mt-0.5`} to="/student/quickprep">All QuickPreps<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
    </header>
    {loading && !quests.length ? <Skeleton className="mt-4 h-[150px]" />
      : error && !quests.length ? <Unavailable className="mt-4" message="QuickPreps could not be loaded." onRetry={reload} />
        : !shown.length ? <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-white/10">
          {completed ? <Check className="h-6 w-6 text-emerald-500" aria-hidden="true" /> : <Zap className="h-6 w-6 text-sky-500" aria-hidden="true" />}
          <p className="mt-2 text-[13px] font-medium text-slate-700 dark:text-zinc-200">{completed ? 'Every QuickPrep is complete. Impressive.' : 'No QuickPrep published yet'}</p>
        </div>
          : <ol className="mt-3 space-y-2">
            {shown.map((quest) => {
              const theme = questTheme(quest.theme);
              const Icon = questCategory(quest.category).icon;
              const percent = questPercent(quest);
              const started = questState(quest) === 'active';
              const companies = quest.companies?.length ? quest.companies : quest.company ? [quest.company] : [];
              return <li key={quest.id}>
                <Link to={started && quest.lastProblem ? quest.lastProblem.href : `/student/quickprep/${quest.slug}`}
                  className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border border-[#eef0f3] bg-white px-3 py-2.5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_14px_28px_-20px_rgba(2,132,199,0.55)] motion-reduce:transform-none dark:border-white/[0.06] dark:bg-transparent dark:hover:border-sky-400/30 ${focusRing}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[-4deg] ${theme.band}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-slate-800 group-hover:text-sky-700 dark:text-zinc-100 dark:group-hover:text-sky-300">{quest.title}</span>
                    {started
                      ? <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="progressbar" aria-label={`${quest.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                          <span className={`block h-full rounded-full ${theme.bar}`} style={{ width: `${percent}%` }} />
                        </span>
                        <span className="shrink-0 text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400">{quest.solved}/{quest.total}</span>
                      </span>
                      : <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-slate-500 dark:text-zinc-400">
                        {companies[0] && <span className="truncate">{companies.slice(0, 2).join(', ')} ·</span>}
                        <span className="shrink-0">{quest.total} questions</span>
                        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-amber-600 dark:text-amber-300"><Sparkles className="h-3 w-3" aria-hidden="true" />{quest.rewardXp}</span>
                      </span>}
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${started ? 'bg-sky-50 text-sky-700 group-hover:bg-sky-600 group-hover:text-white dark:bg-sky-500/10 dark:text-sky-300' : 'text-slate-400 group-hover:bg-sky-600 group-hover:text-white dark:text-zinc-500'}`}>
                    {started ? 'Continue' : 'Start'}<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>;
            })}
          </ol>}
  </section>;
}
