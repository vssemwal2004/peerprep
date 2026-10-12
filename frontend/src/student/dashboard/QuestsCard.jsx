import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Map as MapIcon } from 'lucide-react';
import useQuests from '../quests/useQuests';
import { questPercent, questState, questTheme } from '../quests/questTheme';
import { card, focusRing, Skeleton, textLink, Unavailable } from './ui';

/** Quests in progress first; otherwise a few to start. Replaces the old weekly/monthly card. */
export default function QuestsCard() {
  const { quests, loading, error, reload } = useQuests();
  const active = quests.filter((quest) => questState(quest) === 'active')
    .sort((a, b) => new Date(b.lastViewedAt || b.startedAt || 0) - new Date(a.lastViewedAt || a.startedAt || 0));
  const fresh = quests.filter((quest) => questState(quest) === 'new');
  const shown = (active.length ? active : fresh).slice(0, 3);
  const completed = quests.filter((quest) => questState(quest) === 'completed').length;

  return <section aria-labelledby="dashboard-quests-title" className={`flex h-full flex-col p-5 ${card}`}>
    <header className="flex items-start justify-between gap-3">
      <div>
        <h2 id="dashboard-quests-title" className="text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-100">Your quests</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-zinc-400">{active.length ? 'Pick up where you left off' : completed ? `${completed} completed · start another` : 'Curated sets from your university'}</p>
      </div>
      <Link className={`${textLink} mt-0.5`} to="/student/quests">All quests<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
    </header>
    {loading && !quests.length ? <Skeleton className="mt-4 h-[150px]" />
      : error && !quests.length ? <Unavailable className="mt-4" message="Quests could not be loaded." onRetry={reload} />
        : !shown.length ? <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-white/10">
          {completed ? <Check className="h-6 w-6 text-emerald-500" aria-hidden="true" /> : <MapIcon className="h-6 w-6 text-sky-500" aria-hidden="true" />}
          <p className="mt-2 text-[13px] font-medium text-slate-700 dark:text-zinc-200">{completed ? 'Every quest is complete. Impressive.' : 'No quests published yet'}</p>
        </div>
          : <ol className="mt-3 space-y-2">
            {shown.map((quest) => {
              const theme = questTheme(quest.theme);
              const percent = questPercent(quest);
              const started = questState(quest) === 'active';
              return <li key={quest.id}>
                <Link to={started && quest.lastProblem ? quest.lastProblem.href : `/student/quests/${quest.slug}`}
                  className={`group flex items-center gap-3 rounded-xl border border-[#eef0f3] px-3 py-2.5 transition-colors hover:border-sky-200 hover:bg-sky-50/40 dark:border-white/[0.06] dark:hover:border-sky-400/30 dark:hover:bg-sky-500/[0.05] ${focusRing}`}>
                  <span className={`h-9 w-1.5 shrink-0 rounded-full bg-gradient-to-b ${theme.band}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-slate-800 group-hover:text-sky-700 dark:text-zinc-100 dark:group-hover:text-sky-300">{quest.title}</span>
                    {started
                      ? <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="progressbar" aria-label={`${quest.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                          <span className={`block h-full rounded-full ${theme.bar}`} style={{ width: `${percent}%` }} />
                        </span>
                        <span className="shrink-0 text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400">{quest.solved}/{quest.total}</span>
                      </span>
                      : <span className="block text-[12px] text-slate-500 dark:text-zinc-400">{quest.total} questions · {quest.rewardXp} XP</span>}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-slate-400 transition-colors group-hover:text-sky-700 dark:text-zinc-500 dark:group-hover:text-sky-300">{started ? 'Continue' : 'View'}</span>
                </Link>
              </li>;
            })}
          </ol>}
  </section>;
}
