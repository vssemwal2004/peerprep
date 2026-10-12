import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CircleCheck, Crown, Layers, Medal, Plus, Rocket, Users, UsersRound } from 'lucide-react';
import { api } from '../../utils/api';
import { questCategory, questTheme } from '../../student/quests/questTheme';
import { Notice, Page, PageHeader, ProgressBar, StatCard, StatusPill, card, primaryButton } from './ui';
import { timeAgo } from './format';
import { QUICKPREP_ROOT } from './useQuickPrepActions';

const MEDALS = ['text-amber-500', 'text-slate-400', 'text-orange-500'];

/** Admin "Insights": reach and completion of every QuickPrep side by side, plus the most consistent students. */
export default function QuickPrepInsights() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await api.getQuestOverview()); setError(''); }
    catch (cause) { setError(cause.message || 'Insights could not load.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const header = <PageHeader icon={BarChart3} title="QuickPrep insights" crumbs={[{ label: 'QuickPrep', to: QUICKPREP_ROOT }, { label: 'Insights' }]}
    description="How far each QuickPrep reaches, how many students finish it, and who is finishing the most."
    actions={<Link to={`${QUICKPREP_ROOT}/new`} className={primaryButton}><Plus className="h-4 w-4" />Create QuickPrep</Link>} />;
  if (data?.totals?.central) return <Page>{header}<Notice tone="info">QuickPreps reach every university with coding enabled, and each university keeps its own students’ progress privately. Student insights are therefore not available on the central platform.</Notice></Page>;
  if (error) return <Page>{header}<Notice tone="error">{error} <button type="button" onClick={load} className="font-semibold underline">Retry</button></Notice></Page>;
  if (!data) return <Page>{header}<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-zinc-800" />)}</div></Page>;

  const { totals, quests, leaders } = data;
  const rate = totals.started ? Math.round((totals.completed / totals.started) * 100) : 0;
  return <Page>
    {header}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard icon={Layers} label="QuickPreps" value={totals.quickpreps} hint={`${totals.drafts} drafts`} tone="sky" />
      <StatCard icon={Rocket} label="Published" value={totals.published} hint="Live for students" tone="emerald" />
      <StatCard icon={UsersRound} label="Students" value={totals.students} hint="Active, full access" tone="slate" />
      <StatCard icon={Users} label="Starts" value={totals.started} hint="Across all QuickPreps" tone="violet" />
      <StatCard icon={CircleCheck} label="Completions" value={totals.completed} hint={`${rate}% of starts`} tone="amber" />
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className={card} aria-labelledby="compare-title">
        <div className="border-b border-slate-100 p-4 dark:border-zinc-800"><h2 id="compare-title" className="text-base font-semibold">Compare QuickPreps</h2><p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Reach is the share of the audience that has started it.</p></div>
        {!quests.length ? <p className="px-4 py-12 text-center text-sm text-slate-500">No QuickPreps yet.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr><th scope="col" className="py-3 pl-4 pr-3">QuickPrep</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3 text-right">Audience</th><th scope="col" className="w-36 px-3 py-3">Reach</th><th scope="col" className="px-3 py-3 text-right">Done</th><th scope="col" className="w-36 py-3 pl-3 pr-4">Avg. progress</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {quests.map((quest) => {
                const theme = questTheme(quest.theme);
                const Icon = questCategory(quest.category).icon;
                const reach = quest.audience ? Math.round((quest.stats.enrolled / quest.audience) * 100) : 0;
                return <tr key={quest.id} className="transition hover:bg-slate-50/70 dark:hover:bg-zinc-800/40">
                  <td className="py-3 pl-4 pr-3"><Link to={`${QUICKPREP_ROOT}/${quest.id}`} className="flex items-center gap-2.5 font-semibold hover:text-sky-700 dark:hover:text-sky-300"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white ${theme.band}`}><Icon className="h-4 w-4" aria-hidden="true" /></span><span className="max-w-[14rem] truncate">{quest.title}</span></Link></td>
                  <td className="px-3 py-3"><StatusPill status={quest.status} /></td>
                  <td className="px-3 py-3 text-right tabular-nums">{quest.audience}</td>
                  <td className="px-3 py-3"><ProgressBar value={reach} tone="bg-violet-500" label={`Reach for ${quest.title}`} /></td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{quest.stats.completed}<span className="font-normal text-slate-400">/{quest.stats.enrolled}</span></td>
                  <td className="py-3 pl-3 pr-4"><ProgressBar value={quest.stats.averageProgress} tone={theme.bar} label={`Average progress for ${quest.title}`} /></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
      </section>

      <section className={`${card} self-start`} aria-labelledby="leaders-title">
        <div className="border-b border-slate-100 p-4 dark:border-zinc-800"><h2 id="leaders-title" className="flex items-center gap-2 text-base font-semibold"><Crown className="h-4 w-4 text-amber-500" />Top finishers</h2><p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Most QuickPreps completed, then most questions solved.</p></div>
        {!leaders.length ? <p className="px-4 py-10 text-center text-sm text-slate-500">No student has started a QuickPrep yet.</p>
          : <ol className="divide-y divide-slate-100 dark:divide-zinc-800">
            {leaders.map((leader, index) => <li key={leader.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/70 dark:hover:bg-zinc-800/40">
              <span className="flex w-6 justify-center text-sm font-semibold tabular-nums text-slate-400">{index < 3 ? <Medal className={`h-5 w-5 ${MEDALS[index]}`} aria-label={`Rank ${index + 1}`} /> : index + 1}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{leader.name}</p><p className="text-[11.5px] text-slate-400">{leader.rollNumber || '—'}{leader.semester ? ` · Sem ${leader.semester}` : ''} · {timeAgo(leader.lastActivity)}</p></div>
              <div className="text-right"><p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{leader.completed}<span className="text-slate-400">/{leader.started}</span></p><p className="text-[11px] text-slate-400">{leader.solved} solved</p></div>
            </li>)}
          </ol>}
      </section>
    </div>
  </Page>;
}
