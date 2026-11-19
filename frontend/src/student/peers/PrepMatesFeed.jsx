import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Flame, Medal } from 'lucide-react';
import { api } from '../../utils/api';
import { difficultyTheme } from '../../utils/difficultyTheme';
import PeerAvatar from './PeerAvatar';
import { PEER_NETWORK_EVENT, errorMessage, timeAgo } from './peerNetwork';
import { tierStyle } from '../rewards/tiers';

const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]';
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'A Prep Mate';
const KIND = {
  solved: { Icon: CheckCircle2, tone: 'bg-emerald-500' },
  badge: { Icon: Medal, tone: 'bg-amber-500' },
  streak: { Icon: Flame, tone: 'bg-orange-500' },
};

function FeedText({ item }) {
  const name = <Link to={`/student/peers/${item.mate.id}`} className="font-semibold text-slate-900 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300">{firstName(item.mate.name)}</Link>;
  if (item.type === 'solved') {
    return <>
      <p className="text-[13px] text-slate-600 dark:text-zinc-300">{name} solved {item.count === 1 ? 'a problem' : `${item.count} problems`}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {item.problems.map((problem, index) => {
          const theme = difficultyTheme(problem.difficulty);
          return <li key={`${problem.title}-${index}`} className="max-w-full truncate rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-inset ring-slate-100 dark:bg-white/[0.04] dark:text-zinc-300 dark:ring-white/5">
            {problem.difficulty && <span className={`mr-1 font-semibold ${theme?.text || ''}`}>{problem.difficulty[0]}</span>}{problem.title}
          </li>;
        })}
        {item.count > item.problems.length && <li className="px-1 text-[11px] text-slate-400">+{item.count - item.problems.length} more</li>}
      </ul>
    </>;
  }
  if (item.type === 'badge') {
    return <p className="text-[13px] text-slate-600 dark:text-zinc-300">{name} reached <b className="text-slate-900 dark:text-white">{item.badge.title}</b>{' '}
      <span className={`ml-0.5 rounded-full px-1.5 py-px text-[11px] font-semibold ring-1 ${tierStyle(item.badge.tier).chip}`}>Level {item.badge.level} · {item.badge.tier}</span></p>;
  }
  return <p className="text-[13px] text-slate-600 dark:text-zinc-300">{name} is on a <b className="text-slate-900 dark:text-white">{item.days}-day</b> practice streak</p>;
}

/** What your Prep Mates did in the last two weeks: solves (grouped per day), badge levels, streaks. */
export default function PrepMatesFeed() {
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const load = useCallback(() => api.getPeerFeed()
    .then((data) => setState({ loading: false, error: null, items: data.items || [] }))
    .catch((error) => setState((current) => ({ ...current, loading: false, error }))), []);
  useEffect(() => {
    load();
    window.addEventListener(PEER_NETWORK_EVENT, load);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, load);
  }, [load]);

  return <section className={card} aria-labelledby="prep-feed-title">
    <header className="border-b border-slate-100 px-4 py-3.5 dark:border-zinc-800">
      <h2 id="prep-feed-title" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-50"><Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />Prep Mates activity</h2>
      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">Practice from the last 14 days</p>
    </header>
    {state.loading ? <ul className="space-y-3 p-4" aria-busy="true">{[0, 1, 2, 3].map((key) => <li key={key} className="flex gap-3"><span className="h-8 w-8 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" /><span className="h-8 flex-1 animate-pulse rounded bg-slate-100 dark:bg-zinc-800" /></li>)}</ul>
      : state.error ? <p className="p-5 text-sm text-rose-600 dark:text-rose-400">{errorMessage(state.error)}</p>
        : !state.items.length ? <p className="px-4 py-8 text-center text-[13px] text-slate-500 dark:text-zinc-400">When your Prep Mates solve problems or level up a badge, it shows here.</p>
          : <ol className="max-h-[640px] overflow-y-auto px-4 py-2">
            {state.items.map((item, index) => {
              const { Icon, tone } = KIND[item.type] || KIND.solved;
              return <li key={item.id} className="relative flex gap-3 py-2.5">
                {index < state.items.length - 1 && <span className="absolute left-4 top-11 bottom-0 w-px bg-slate-100 dark:bg-zinc-800" aria-hidden="true" />}
                <span className="relative shrink-0">
                  <PeerAvatar name={item.mate.name} url={item.mate.avatarUrl} size="sm" />
                  <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-white ring-2 ring-white dark:ring-[#242424] ${tone}`} aria-hidden="true"><Icon className="h-2.5 w-2.5" /></span>
                </span>
                <div className="min-w-0 flex-1">
                  <FeedText item={item} />
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">{timeAgo(item.at)}</p>
                </div>
              </li>;
            })}
          </ol>}
  </section>;
}
