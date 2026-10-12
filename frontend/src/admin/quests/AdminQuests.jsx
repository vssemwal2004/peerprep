import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Map as MapIcon, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../../utils/api';
import QuestBuilder from './QuestBuilder';
import { questCategory, questTheme } from '../../student/quests/questTheme';

const STATUS = {
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  draft: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
};

/** Admins curate quests: ordered question sets from the library with a badge and XP on completion. */
export default function AdminQuests() {
  const [editing, setEditing] = useState(null);
  const [state, setState] = useState({ quests: [], loading: true, error: '' });
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try { setState({ quests: (await api.listAdminQuests()).quests || [], loading: false, error: '' }); }
    catch (cause) { setState((previous) => ({ ...previous, loading: false, error: cause.message || 'Quests could not load.' })); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const finish = (message) => { setEditing(null); setNotice(message || ''); void load(); };
  const setStatus = async (quest, status) => {
    setBusyId(quest.id); setNotice('');
    try { await api.updateQuest(quest.id, { status }); setNotice(status === 'published' ? `“${quest.title}” is live.` : `“${quest.title}” is hidden from students.`); await load(); }
    catch (cause) { setState((previous) => ({ ...previous, error: cause.message || 'The quest could not be updated.' })); }
    finally { setBusyId(''); }
  };
  const remove = async (quest) => {
    if (!window.confirm(`Remove “${quest.title}”? Quests students have started are archived so their progress is kept.`)) return;
    setBusyId(quest.id);
    try { const result = await api.deleteQuest(quest.id); setNotice(result.deleted ? 'Draft deleted.' : 'Quest archived. Student progress is kept.'); await load(); }
    catch (cause) { setState((previous) => ({ ...previous, error: cause.message || 'The quest could not be removed.' })); }
    finally { setBusyId(''); }
  };

  return <div className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100 sm:p-6">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><MapIcon size={23} /></span>
          <div><h1 className="text-xl font-semibold">Quests</h1><p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-zinc-400">Curate question sets from the library, such as company sets, topic tracks or a “75 Hard” plan. Students earn the quest’s badge and XP when they solve every question.</p></div>
        </div>
        {!editing && <button type="button" onClick={() => { setNotice(''); setEditing('new'); }} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"><Plus size={16} />New quest</button>}
      </header>
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><Check size={15} className="mr-2 inline" />{notice}</p>}
      {state.error && !editing && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-900/10 dark:text-rose-300">{state.error} <button type="button" className="underline" onClick={load}>Retry</button></p>}

      {editing ? <QuestBuilder questId={editing === 'new' ? null : editing} onDone={finish} />
        : state.loading && !state.quests.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="h-44 animate-pulse rounded-2xl bg-slate-200 dark:bg-zinc-800" />)}</div>
          : !state.quests.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-[#242424]">
            <MapIcon className="mx-auto h-8 w-8 text-indigo-500" />
            <h2 className="mt-3 font-semibold">No quests yet</h2>
            <p className="mt-1 text-sm text-slate-500">Create your first quest by picking questions from the library.</p>
            <button type="button" onClick={() => setEditing('new')} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={16} />New quest</button>
          </div>
            : <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.quests.map((quest) => {
              const theme = questTheme(quest.theme);
              const unavailable = quest.items.filter((item) => !item.available).length;
              return <li key={quest.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-[#242424]">
                <div className={`h-2 bg-gradient-to-r ${theme.band}`} aria-hidden="true" />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold leading-snug">{quest.title}</h2>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${STATUS[quest.status] || STATUS.draft}`}>{quest.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{questCategory(quest.category).label}{quest.company ? ` · ${quest.company}` : ''} · {quest.questionCount} questions · {quest.rewardXp} XP{quest.semesters?.length ? ` · Semester ${quest.semesters.join(', ')}` : ''}</p>
                  {unavailable > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{unavailable} question{unavailable === 1 ? ' is' : 's are'} no longer published and hidden from students.</p>}
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[['Started', quest.stats.enrolled], ['Completed', quest.stats.completed], ['Avg. progress', `${quest.stats.averageProgress}%`]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 py-2 dark:bg-zinc-900/50"><dt className="text-[10.5px] text-slate-500">{label}</dt><dd className="text-sm font-semibold tabular-nums">{value}</dd></div>)}
                  </dl>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                    <button type="button" onClick={() => { setNotice(''); setEditing(quest.id); }} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"><Pencil size={13} />Edit</button>
                    {quest.status === 'published'
                      ? <button type="button" disabled={busyId === quest.id} onClick={() => setStatus(quest, 'draft')} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"><EyeOff size={13} />Unpublish</button>
                      : <button type="button" disabled={busyId === quest.id || !quest.questionCount} onClick={() => setStatus(quest, 'published')} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-500/10"><Eye size={13} />Publish</button>}
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400"><Users size={12} />{quest.stats.enrolled}</span>
                    <button type="button" disabled={busyId === quest.id} onClick={() => remove(quest)} aria-label={`Remove ${quest.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10"><Trash2 size={14} /></button>
                  </div>
                </div>
              </li>;
            })}</ul>}
    </div>
  </div>;
}
