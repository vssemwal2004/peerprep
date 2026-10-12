import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, CalendarCheck, Check, CircleDashed, Layers, LoaderCircle, Play, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import BadgeEmblem from './profile/BadgeEmblem';
import { DifficultyMix } from './quests/QuestCard';
import { DIFFICULTY_TONES, questCategory, questPercent, questTheme } from './quests/questTheme';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2';
const FILTERS = [['all', 'All'], ['todo', 'To solve'], ['solved', 'Solved']];
const STATUS_LABEL = { solved: 'Solved', attempted: 'Attempted', none: 'Not started' };

function StatusMark({ status }) {
  if (status === 'solved') return <span title="Solved" className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/40"><Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /><span className="sr-only">Solved</span></span>;
  if (status === 'attempted') return <span title="Attempted" className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-500/10"><span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" /><span className="sr-only">Attempted</span></span>;
  return <span title="Not started" className="flex h-7 w-7 items-center justify-center text-slate-300 transition-colors group-hover:text-sky-400 dark:text-zinc-600"><CircleDashed className="h-6 w-6" aria-hidden="true" /><span className="sr-only">Not started</span></span>;
}

function groupBySection(items) {
  const groups = [];
  for (const [index, item] of items.entries()) {
    const name = item.section || '';
    if (!groups.length || groups.at(-1).name !== name) groups.push({ name, items: [] });
    groups.at(-1).items.push({ ...item, number: index + 1 });
  }
  return groups;
}

export default function QuestDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ quest: null, loading: true, error: '' });
  const [starting, setStarting] = useState(false);
  const [filter, setFilter] = useState('all');
  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const result = await api.getQuest(slug);
      setState({ quest: result.quest, loading: false, error: '' });
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: error?.response?.status === 404 ? 'This QuickPrep is not available.' : error?.message || 'The QuickPrep could not load.' }));
    }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const quest = state.quest;
  const numbered = useMemo(() => (quest?.items || []).map((item, index) => ({ ...item, number: index + 1 })), [quest]);
  const groups = useMemo(() => groupBySection(numbered.filter((item) => filter === 'all' || (filter === 'solved' ? item.status === 'solved' : item.status !== 'solved'))).map((group) => ({
    ...group,
    // Section progress counts the whole section, not just the filtered rows.
    solved: numbered.filter((item) => (item.section || '') === group.name && item.status === 'solved').length,
    total: numbered.filter((item) => (item.section || '') === group.name).length,
  })), [filter, numbered]);
  const start = async () => {
    setStarting(true);
    try { setState({ quest: (await api.startQuest(slug)).quest, loading: false, error: '' }); }
    catch (error) { setState((previous) => ({ ...previous, error: error?.message || 'The QuickPrep could not start.' })); }
    finally { setStarting(false); }
  };

  if (!quest) {
    return <div className="min-h-screen bg-[#f6f7f9] px-4 py-6 font-dmsans dark:bg-[#1a1a1a] sm:px-8">
      <Link to="/student/quickprep" className={`inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-300 ${focusRing}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />All QuickPreps</Link>
      {state.loading ? <div className="mt-6 h-56 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/[0.05]" role="status" aria-label="Loading QuickPrep" />
        : <div role="alert" className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-[#232325]">
          <p className="text-[15px] font-semibold">{state.error}</p>
          <button type="button" onClick={load} className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-sky-700 dark:text-sky-300 ${focusRing}`}><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</button>
        </div>}
    </div>;
  }

  const theme = questTheme(quest.theme);
  const category = questCategory(quest.category);
  const CategoryIcon = category.icon;
  const percent = questPercent(quest);
  const next = quest.items.find((item) => item.status !== 'solved');
  const badge = { ...quest.badge, earned: Boolean(quest.completedAt) };
  const companies = quest.companies?.length ? quest.companies : quest.company ? [quest.company] : [];
  const attempted = quest.items.filter((item) => item.status === 'attempted').length;

  return <div className="min-h-screen bg-[#f6f7f9] pb-12 font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
    <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 sm:px-6 lg:px-8">
      <Link to="/student/quickprep" className={`inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white ${focusRing}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />All QuickPreps</Link>

      <section aria-labelledby="quest-title" className={`relative mt-3 overflow-hidden rounded-3xl bg-gradient-to-br ${theme.band} p-6 text-white shadow-[0_24px_48px_-32px_rgba(15,23,42,0.6)] sm:p-8`}>
        <span className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:16px_16px]" aria-hidden="true" />
        <CategoryIcon className="absolute -bottom-10 -right-6 h-56 w-56 rotate-[-10deg] text-white/[0.1]" strokeWidth={1.2} aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/90">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 ring-1 ring-inset ring-white/25"><CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />{category.label}</span>
              {companies.slice(0, 4).map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 ring-1 ring-inset ring-white/25"><Building2 className="h-3 w-3" aria-hidden="true" />{name}</span>)}
              {quest.topics?.slice(0, 3).map((topic) => <span key={topic} className="rounded-full bg-white/10 px-2.5 py-1">{topic}</span>)}
            </p>
            <h1 id="quest-title" className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]">{quest.title}</h1>
            {quest.description && <p className="mt-2 text-[14.5px] leading-relaxed text-white/85">{quest.description}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {quest.completedAt
                ? <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-emerald-700"><CalendarCheck className="h-4 w-4" aria-hidden="true" />Completed {new Date(quest.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                : !quest.started
                  ? <button type="button" onClick={start} disabled={starting} className={`inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-900 shadow transition-transform hover:-translate-y-px disabled:opacity-70 ${focusRing}`}>
                    {starting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4 fill-current" aria-hidden="true" />}Start QuickPrep
                  </button>
                  : next && <Link to={next.href} className={`inline-flex max-w-full items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-900 shadow transition-transform hover:-translate-y-px ${focusRing}`}>
                    <span className="truncate">Continue: {next.title}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Link>}
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2.5 text-[13px] font-medium ring-1 ring-inset ring-white/25"><Sparkles className="h-4 w-4 text-amber-200" aria-hidden="true" />{quest.rewardXp} XP</span>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2.5 text-[13px] font-medium ring-1 ring-inset ring-white/25"><Layers className="h-4 w-4" aria-hidden="true" />{quest.total} questions</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-5 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
            <div className="relative h-24 w-24" role="progressbar" aria-label="QuickPrep progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${quest.solved} of ${quest.total} solved`}>
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" /><circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="8" pathLength="100" strokeDasharray={`${percent} 100`} strokeLinecap="round" /></svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[20px] font-bold tabular-nums">{quest.solved}/{quest.total}</span><span className="text-[11px] text-white/80">solved</span></span>
            </div>
            <div className="w-28 text-center">
              <BadgeEmblem badge={badge} className="mx-auto h-16 w-14" />
              <p className="mt-1.5 line-clamp-2 text-[11.5px] font-medium leading-snug">{badge.title}</p>
              <p className="text-[10.5px] text-white/75">{quest.completedAt ? 'Unlocked' : 'Unlock on completion'}</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="quest-questions-title" className="mt-6 overflow-hidden rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#202022]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eef0f3] px-5 py-4 dark:border-white/[0.06]">
          <div className="min-w-0">
            <h2 id="quest-questions-title" className="text-[17px] font-semibold tracking-[-0.015em]">Questions</h2>
            <div className="mt-2 flex items-center gap-3">
              <div className="w-48"><DifficultyMix difficulty={quest.difficulty} total={quest.total} /></div>
              <p className="text-[12px] text-slate-500 dark:text-zinc-400">{['Easy', 'Medium', 'Hard'].filter((level) => quest.difficulty?.[level]).map((level) => `${quest.difficulty[level]} ${level}`).join(' · ')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12.5px] text-slate-500 dark:text-zinc-400"><strong className="text-emerald-600 dark:text-emerald-400">{quest.solved}</strong> solved · <strong className="text-amber-600 dark:text-amber-400">{attempted}</strong> attempted · <strong className="text-slate-700 dark:text-zinc-200">{quest.total - quest.solved - attempted}</strong> to start</p>
            <div role="radiogroup" aria-label="Filter questions" className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]">
              {FILTERS.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={filter === value} onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${focusRing} ${filter === value ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100'}`}>{label}</button>)}
            </div>
          </div>
        </div>
        {state.error && <p role="alert" className="px-5 pt-3 text-[13px] text-rose-600 dark:text-rose-300">{state.error}</p>}
        {!groups.length ? <p className="px-6 py-12 text-center text-[13px] text-slate-500 dark:text-zinc-400">{filter === 'solved' ? 'Nothing solved yet. Your first one is a click away.' : 'Every question is solved. Nicely done!'}</p>
          : <table className="w-full text-left text-sm">
            <caption className="sr-only">Questions in {quest.title}, in order</caption>
            <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400 max-sm:hidden dark:bg-white/[0.02] dark:text-zinc-500">
              <tr>
                <th scope="col" className="w-14 py-2.5 pl-5">Status</th>
                <th scope="col" className="w-12 px-2 py-2.5">#</th>
                <th scope="col" className="px-3 py-2.5">Question</th>
                <th scope="col" className="w-28 px-3 py-2.5">Difficulty</th>
                <th scope="col" className="w-32 py-2.5 pl-3 pr-5 text-right"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            {groups.map((group) => <tbody key={`${group.name}-${group.items[0].key}`} className="divide-y divide-[#f1f2f5] dark:divide-white/[0.05]">
              {group.name && <tr className="bg-gradient-to-r from-slate-50 to-transparent dark:from-white/[0.03]">
                <th scope="rowgroup" colSpan={5} className="px-5 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className={`h-4 w-1 rounded-full ${theme.bar}`} aria-hidden="true" />
                    <span className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{group.name}</span>
                    <span className="text-[11.5px] font-medium tabular-nums text-slate-400">{group.solved}/{group.total} solved</span>
                    <span className="ml-auto hidden h-1.5 w-28 overflow-hidden rounded-full bg-slate-200/70 sm:block dark:bg-white/[0.07]" aria-hidden="true"><span className={`block h-full rounded-full ${theme.bar}`} style={{ width: `${group.total ? (group.solved / group.total) * 100 : 0}%` }} /></span>
                  </span>
                </th>
              </tr>}
              {group.items.map((item) => {
                const tone = DIFFICULTY_TONES[item.difficulty];
                return <tr key={item.key} onClick={() => navigate(item.href)} className={`group relative cursor-pointer transition-colors duration-200 hover:bg-sky-50/60 dark:hover:bg-sky-400/[0.06] ${item.status === 'solved' ? 'bg-emerald-50/30 dark:bg-emerald-500/[0.03]' : ''}`}>
                  <td className="relative py-3 pl-5">
                    <span className={`absolute inset-y-0 left-0 w-1 origin-center scale-y-0 transition-transform duration-200 group-hover:scale-y-100 ${theme.bar}`} aria-hidden="true" />
                    <StatusMark status={item.status} />
                  </td>
                  <td className="px-2 py-3 text-[12.5px] font-medium tabular-nums text-slate-400 dark:text-zinc-500">{String(item.number).padStart(2, '0')}</td>
                  <td className="min-w-0 px-3 py-3">
                    <Link to={item.href} onClick={(event) => event.stopPropagation()} className={`block truncate rounded text-[14.5px] font-semibold text-slate-900 transition-colors group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300 ${focusRing}`}>{item.title}</Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="sr-only">{STATUS_LABEL[item.status] || STATUS_LABEL.none}. </span>
                      {item.tags?.map((tag) => <span key={tag} className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[11px] text-slate-500 transition-colors group-hover:bg-white dark:bg-white/[0.05] dark:text-zinc-400 dark:group-hover:bg-white/[0.08]">{tag}</span>)}
                      {tone && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset sm:hidden ${tone.pill}`}>{item.difficulty}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3 max-sm:hidden">{tone && <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${tone.pill}`}>{item.difficulty}</span>}</td>
                  <td className="py-3 pl-3 pr-5 text-right">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200 ${item.status === 'solved' ? 'text-emerald-700 group-hover:bg-emerald-100/70 dark:text-emerald-300 dark:group-hover:bg-emerald-500/10' : 'text-slate-400 group-hover:bg-sky-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-sky-600/30 dark:text-zinc-500'}`} aria-hidden="true">
                      {item.status === 'solved' ? 'Review' : item.status === 'attempted' ? 'Retry' : 'Solve'}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </td>
                </tr>;
              })}
            </tbody>)}
          </table>}
      </section>
    </main>
  </div>;
}
