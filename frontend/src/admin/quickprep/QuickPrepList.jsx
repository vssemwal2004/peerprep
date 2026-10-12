import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, CircleCheck, FilePen, Layers, Plus, Rocket, Tags, Users, Zap } from 'lucide-react';
import { api } from '../../utils/api';
import { QUEST_CATEGORIES, questCategory, questTheme } from '../../student/quests/questTheme';
import { Chips, MixBar, Notice, Page, PageHeader, ProgressBar, RowMenu, SearchBox, Segmented, StatCard, StatusPill, card, primaryButton, secondaryButton } from './ui';
import { timeAgo } from './format';
import useQuickPrepActions, { QUICKPREP_ROOT } from './useQuickPrepActions';

const STATUS_TABS = ['all', 'published', 'draft', 'archived'];

/** Admin "All QuickPreps": every curated set in one table, with its reach and progress and a row menu. */
export default function QuickPrepList() {
  const navigate = useNavigate();
  const [state, setState] = useState({ quests: [], loading: true, error: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try { setState({ quests: (await api.listAdminQuests()).quests || [], loading: false, error: '' }); }
    catch (cause) { setState((previous) => ({ ...previous, loading: false, error: cause.message || 'QuickPreps could not load.' })); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const { actionsFor, busyId, message, setMessage } = useQuickPrepActions({ onChanged: load });

  const quests = state.quests;
  const counts = useMemo(() => Object.fromEntries(STATUS_TABS.map((tab) => [tab, tab === 'all' ? quests.filter((quest) => quest.status !== 'archived').length : quests.filter((quest) => quest.status === tab).length])), [quests]);
  const totals = useMemo(() => {
    const live = quests.filter((quest) => quest.status !== 'archived');
    return { started: live.reduce((sum, quest) => sum + quest.stats.enrolled, 0), completed: live.reduce((sum, quest) => sum + quest.stats.completed, 0) };
  }, [quests]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quests.filter((quest) => (status === 'all' ? quest.status !== 'archived' : quest.status === status)
      && (category === 'all' || quest.category === category)
      && (!term || [quest.title, quest.description, ...quest.companies, ...quest.topics].some((value) => String(value || '').toLowerCase().includes(term))));
  }, [quests, search, status, category]);

  return <Page>
    <PageHeader icon={Zap} title="QuickPrep" crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'QuickPrep' }]}
      description="Curated question sets for focused practice, such as company sets, topic tracks or a 75 Hard plan. Students earn the badge and XP when they solve every question."
      actions={<>
        <Link to={`${QUICKPREP_ROOT}/insights`} className={secondaryButton}><BarChart3 className="h-4 w-4" />Insights</Link>
        <Link to={`${QUICKPREP_ROOT}/new`} className={primaryButton}><Plus className="h-4 w-4" />Create QuickPrep</Link>
      </>} />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Layers} label="QuickPreps" value={counts.all} hint={`${counts.archived} archived`} tone="sky" />
      <StatCard icon={Rocket} label="Published" value={counts.published} hint="Visible to students" tone="emerald" />
      <StatCard icon={FilePen} label="Drafts" value={counts.draft} hint="Not visible yet" tone="amber" />
      <StatCard icon={Users} label="Students started" value={totals.started} hint={`${totals.completed} completions`} tone="violet" />
    </div>

    {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}
    {state.error && <Notice tone="error">{state.error} <button type="button" className="font-semibold underline" onClick={load}>Retry</button></Notice>}

    <section className={card} aria-labelledby="quickprep-table-title">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-zinc-800">
        <h2 id="quickprep-table-title" className="sr-only">All QuickPreps</h2>
        <Segmented label="Status" value={status} onChange={setStatus} options={STATUS_TABS.map((tab) => ({ value: tab, label: tab === 'all' ? 'All' : tab[0].toUpperCase() + tab.slice(1), count: counts[tab] }))} />
        <label className="sr-only" htmlFor="quickprep-type">Type</label>
        <select id="quickprep-type" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900">
          <option value="all">All types</option>
          {QUEST_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name, company or topic" />
      </div>

      {state.loading && !quests.length ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((key) => <div key={key} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />)}</div>
        : !quests.length ? <EmptyState />
          : !visible.length ? <p className="px-4 py-12 text-center text-sm text-slate-500">No QuickPrep matches these filters.</p>
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-left text-sm">
                <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="py-3 pl-4 pr-3">QuickPrep</th>
                    <th scope="col" className="px-3 py-3">Type</th>
                    <th scope="col" className="px-3 py-3">Companies · Topics</th>
                    <th scope="col" className="px-3 py-3">Questions</th>
                    <th scope="col" className="px-3 py-3">Audience</th>
                    <th scope="col" className="px-3 py-3">Started / Done</th>
                    <th scope="col" className="w-36 px-3 py-3">Avg. progress</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3">Updated</th>
                    <th scope="col" className="py-3 pl-3 pr-4 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {visible.map((quest) => {
                    const theme = questTheme(quest.theme);
                    const type = questCategory(quest.category);
                    const TypeIcon = type.icon;
                    return <tr key={quest.id} onClick={() => navigate(`${QUICKPREP_ROOT}/${quest.id}`)} className={`group cursor-pointer transition hover:bg-sky-50/40 dark:hover:bg-zinc-800/40 ${busyId === quest.id ? 'opacity-60' : ''}`}>
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${theme.band}`}><TypeIcon className="h-5 w-5" aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <Link to={`${QUICKPREP_ROOT}/${quest.id}`} onClick={(event) => event.stopPropagation()} className="block max-w-[15rem] truncate font-semibold text-slate-900 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300">{quest.title}</Link>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate-400"><span className="font-mono">/{quest.slug}</span>{quest.unavailableCount > 0 && <span className="rounded bg-amber-50 px-1 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" title="Unpublished in the library and hidden from students">{quest.unavailableCount} unavailable</span>}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold ${theme.soft}`}><TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />{type.label}</span></td>
                      <td className="px-3 py-3"><div className="space-y-1"><Chips values={quest.companies} icon={Building2} empty="All companies" /><Chips values={quest.topics} icon={Tags} empty="All topics" /></div></td>
                      <td className="px-3 py-3"><p className="font-semibold tabular-nums">{quest.questionCount}</p><MixBar difficulty={quest.difficulty} compact /></td>
                      <td className="px-3 py-3"><p className="font-semibold tabular-nums">{quest.audience ?? '—'} <span className="text-xs font-normal text-slate-400">students</span></p><p className="text-[11.5px] text-slate-500">{quest.semesters?.length ? `Sem ${quest.semesters.join(', ')}` : 'All semesters'}</p></td>
                      <td className="px-3 py-3 tabular-nums"><span className="font-semibold">{quest.stats.enrolled}</span><span className="text-slate-400"> / </span><span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />{quest.stats.completed}</span></td>
                      <td className="px-3 py-3"><ProgressBar value={quest.stats.averageProgress} tone={theme.bar} label={`Average progress for ${quest.title}`} /></td>
                      <td className="px-3 py-3"><StatusPill status={quest.status} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12.5px] text-slate-500">{timeAgo(quest.updatedAt)}</td>
                      <td className="py-3 pl-3 pr-4 text-right" onClick={(event) => event.stopPropagation()}><div className="flex justify-end"><RowMenu name={quest.title} actions={actionsFor(quest)} /></div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>}
      {visible.length > 0 && <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] text-slate-500 dark:border-zinc-800">Showing {visible.length} of {quests.length} QuickPreps</p>}
    </section>
  </Page>;
}

function EmptyState() {
  return <div className="px-6 py-16 text-center">
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25"><Zap className="h-7 w-7" aria-hidden="true" /></span>
    <h3 className="mt-4 text-base font-semibold">Create your first QuickPrep</h3>
    <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-zinc-400">Name it, pick its companies and topics, add questions from the library, then publish it to the semesters you choose.</p>
    <Link to={`${QUICKPREP_ROOT}/new`} className={`${primaryButton} mt-5`}><Plus className="h-4 w-4" />Create QuickPrep</Link>
  </div>;
}
