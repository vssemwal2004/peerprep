import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarCheck, Check, CircleDashed, LoaderCircle, Play, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import BadgeEmblem from './profile/BadgeEmblem';
import { DifficultyMix } from './quests/QuestCard';
import { DIFFICULTY_TONES, questCategory, questPercent, questTheme } from './quests/questTheme';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2';
const FILTERS = [['all', 'All'], ['todo', 'To solve'], ['solved', 'Solved']];

function StatusMark({ status }) {
  if (status === 'solved') return <span title="Solved" className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /><span className="sr-only">Solved</span></span>;
  if (status === 'attempted') return <span title="Attempted" className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-amber-400"><span className="sr-only">Attempted</span></span>;
  return <span title="Not attempted" className="flex h-6 w-6 items-center justify-center text-slate-300 dark:text-zinc-600"><CircleDashed className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Not attempted</span></span>;
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
  const [state, setState] = useState({ quest: null, loading: true, error: '' });
  const [starting, setStarting] = useState(false);
  const [filter, setFilter] = useState('all');
  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const result = await api.getQuest(slug);
      setState({ quest: result.quest, loading: false, error: '' });
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: error?.response?.status === 404 ? 'This quest is not available.' : error?.message || 'The quest could not load.' }));
    }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const quest = state.quest;
  const groups = useMemo(() => groupBySection((quest?.items || []).filter((item) => filter === 'all' || (filter === 'solved' ? item.status === 'solved' : item.status !== 'solved'))), [filter, quest]);
  const start = async () => {
    setStarting(true);
    try { setState({ quest: (await api.startQuest(slug)).quest, loading: false, error: '' }); }
    catch (error) { setState((previous) => ({ ...previous, error: error?.message || 'The quest could not start.' })); }
    finally { setStarting(false); }
  };

  if (!quest) {
    return <div className="min-h-screen bg-[#f6f7f9] px-4 py-6 font-dmsans dark:bg-[#1a1a1a] sm:px-8">
      <Link to="/student/quests" className={`inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-300 ${focusRing}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />All quests</Link>
      {state.loading ? <div className="mt-6 h-56 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/[0.05]" role="status" aria-label="Loading quest" />
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

  return <div className="min-h-screen bg-[#f6f7f9] pb-12 font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
    <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 sm:px-6 lg:px-8">
      <Link to="/student/quests" className={`inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white ${focusRing}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />All quests</Link>

      <section aria-labelledby="quest-title" className={`relative mt-3 overflow-hidden rounded-3xl bg-gradient-to-br ${theme.band} p-6 text-white shadow-[0_24px_48px_-32px_rgba(15,23,42,0.6)] sm:p-8`}>
        <CategoryIcon className="absolute -bottom-10 -right-6 h-56 w-56 rotate-[-10deg] text-white/[0.1]" strokeWidth={1.2} aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/85">
              <span className="rounded-full bg-white/20 px-2.5 py-1 ring-1 ring-inset ring-white/25">{category.label}</span>
              {quest.company && <span className="rounded-full bg-white/20 px-2.5 py-1 ring-1 ring-inset ring-white/25">{quest.company}</span>}
              {quest.topics?.slice(0, 3).map((topic) => <span key={topic} className="rounded-full bg-white/10 px-2.5 py-1">{topic}</span>)}
            </p>
            <h1 id="quest-title" className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]">{quest.title}</h1>
            {quest.description && <p className="mt-2 text-[14.5px] leading-relaxed text-white/85">{quest.description}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {quest.completedAt
                ? <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-emerald-700"><CalendarCheck className="h-4 w-4" aria-hidden="true" />Completed {new Date(quest.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                : !quest.started
                  ? <button type="button" onClick={start} disabled={starting} className={`inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-900 shadow transition-transform hover:-translate-y-px disabled:opacity-70 ${focusRing}`}>
                    {starting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4 fill-current" aria-hidden="true" />}Start quest
                  </button>
                  : next && <Link to={next.href} className={`inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-900 shadow transition-transform hover:-translate-y-px ${focusRing}`}>
                    Continue: {next.title}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>}
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2.5 text-[13px] font-medium ring-1 ring-inset ring-white/25"><Sparkles className="h-4 w-4 text-amber-200" aria-hidden="true" />{quest.rewardXp} XP</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-5 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
            <div className="relative h-24 w-24" role="progressbar" aria-label="Quest progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${quest.solved} of ${quest.total} solved`}>
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

      <section aria-labelledby="quest-questions-title" className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="quest-questions-title" className="text-[18px] font-semibold tracking-[-0.015em]">Questions</h2>
            <div className="mt-2 w-56"><DifficultyMix difficulty={quest.difficulty} total={quest.total} /></div>
            <p className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">{['Easy', 'Medium', 'Hard'].filter((level) => quest.difficulty?.[level]).map((level) => `${quest.difficulty[level]} ${level}`).join(' · ')}</p>
          </div>
          <div role="radiogroup" aria-label="Filter questions" className="flex rounded-xl border border-[#e4e7ec] bg-white p-1 dark:border-white/10 dark:bg-[#1f1f21]">
            {FILTERS.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={filter === value} onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${focusRing} ${filter === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'}`}>{label}</button>)}
          </div>
        </div>
        {state.error && <p role="alert" className="mt-3 text-[13px] text-rose-600 dark:text-rose-300">{state.error}</p>}
        {!groups.length && <p className="mt-6 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-[13px] text-slate-500 dark:border-white/10 dark:text-zinc-400">{filter === 'solved' ? 'Nothing solved yet. Your first one is a click away.' : 'Every question is solved. Nicely done!'}</p>}
        {groups.map((group) => <div key={`${group.name}-${group.items[0].key}`} className="mt-5">
          {group.name && <h3 className="mb-2 text-[13px] font-semibold text-slate-500 dark:text-zinc-400">{group.name}</h3>}
          <ol className="space-y-2">
            {group.items.map((item) => {
              const tone = DIFFICULTY_TONES[item.difficulty];
              return <li key={item.key}>
                <Link to={item.href} className={`group flex items-center gap-3 rounded-xl border border-[#eef0f3] bg-white px-4 py-3 transition-[border-color,box-shadow] hover:border-sky-200 hover:shadow-[0_12px_26px_-20px_rgba(2,132,199,0.6)] dark:border-white/[0.06] dark:bg-[#232325] dark:hover:border-sky-400/30 ${focusRing}`}>
                  <StatusMark status={item.status} />
                  <span className="w-7 shrink-0 text-[12px] tabular-nums text-slate-400 dark:text-zinc-500">{item.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-slate-900 group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300">{item.title}</span>
                    {item.tags?.length > 0 && <span className="mt-1 hidden flex-wrap gap-1.5 sm:flex">{item.tags.map((tag) => <span key={tag} className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-white/[0.05] dark:text-zinc-400">{tag}</span>)}</span>}
                  </span>
                  {tone && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${tone.pill}`}>{item.difficulty}</span>}
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-sky-600 dark:text-zinc-600" aria-hidden="true" />
                </Link>
              </li>;
            })}
          </ol>
        </div>)}
      </section>
    </main>
  </div>;
}
