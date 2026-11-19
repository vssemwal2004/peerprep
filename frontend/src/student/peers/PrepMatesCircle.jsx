import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Check, Flame, Loader2, Trophy, Zap } from 'lucide-react';
import { api } from '../../utils/api';
import { useOptionalToast } from '../../components/CustomToast';
import PeerAvatar from './PeerAvatar';
import { PEER_NETWORK_EVENT, errorMessage } from './peerNetwork';
import { YOU_COLOR } from './circleViz';

const PERIODS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];
const MEDALS = ['from-amber-300 to-amber-500 text-amber-950', 'from-slate-200 to-slate-400 text-slate-800', 'from-orange-300 to-orange-600 text-orange-950'];
const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]';
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';

function Rank({ rank }) {
  if (rank <= 3) return <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[12px] font-black shadow-sm ${MEDALS[rank - 1]}`} aria-label={`Rank ${rank}`}>{rank}</span>;
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[12px] font-semibold tabular-nums text-slate-400 dark:text-zinc-500" aria-label={`Rank ${rank}`}>{rank}</span>;
}

function NudgeButton({ row, onNudged }) {
  const toast = useOptionalToast();
  const [busy, setBusy] = useState(false);
  if (row.nudged) return <span className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-slate-400 dark:text-zinc-500"><Check className="h-3.5 w-3.5" aria-hidden="true" />Pinged</span>;
  if (!row.canNudge) return null;
  // "Prep Ping": a friendly reminder to a Prep Mate who has not practised today (once a day).
  const ping = async () => {
    setBusy(true);
    try {
      await api.nudgePrepMate(row.id);
      onNudged(row.id);
      toast?.success(`Prep Ping sent. ${firstName(row.name)} will get a friendly reminder.`);
    } catch (error) {
      toast?.error(errorMessage(error));
    } finally { setBusy(false); }
  };
  return <button type="button" onClick={ping} disabled={busy} title={`${firstName(row.name)} has not practised today. Send a Prep Ping.`} aria-label={`Send ${row.name} a Prep Ping`}
    className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-50 px-2.5 text-[12px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Zap className="h-3.5 w-3.5" aria-hidden="true" />}Prep Ping
  </button>;
}

/**
 * "Your circle": you and your Prep Mates ranked by practice problems solved this week, this month
 * or all time. Shows each streak and whether they practised today; idle Prep Mates can be nudged.
 */
export default function PrepMatesCircle() {
  const [period, setPeriod] = useState('week');
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const load = useCallback((quiet = false) => {
    if (!quiet) setState((current) => ({ ...current, loading: true }));
    return api.getPeerCircle(period)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState((current) => ({ ...current, loading: false, error })));
  }, [period]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = () => load(true);
    window.addEventListener(PEER_NETWORK_EVENT, refresh);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, refresh);
  }, [load]);
  const markNudged = (peerId) => setState((current) => ({ ...current, data: current.data && {
    ...current.data, rows: current.data.rows.map((row) => (row.id === peerId ? { ...row, nudged: true, canNudge: false } : row)),
  } }));

  const rows = state.data?.rows || [];
  const max = Math.max(1, ...rows.map((row) => row.solved));
  const you = rows.find((row) => row.isYou);
  const leader = rows[0];
  const periodLabel = PERIODS.find((item) => item.key === period).label.toLowerCase();
  const headline = !you || rows.length < 2 ? null
    : you.rank === 1 && (rows[1]?.solved ?? 0) < you.solved ? `You lead your circle ${periodLabel}.`
      : leader && !leader.isYou ? `${firstName(leader.name)} leads with ${leader.solved}. ${Math.max(0, leader.solved - you.solved + 1)} more puts you on top.`
        : `You share the top spot ${periodLabel}.`;

  return <section className={card} aria-labelledby="prep-circle-title">
    <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
      <div className="min-w-0">
        <h2 id="prep-circle-title" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-50"><Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />Your circle</h2>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">{headline || 'You and your Prep Mates, ranked by practice problems solved'}</p>
      </div>
      <div className="flex shrink-0 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="tablist" aria-label="Leaderboard period">
        {PERIODS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={period === item.key} onClick={() => setPeriod(item.key)}
          className={`rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${period === item.key ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>{item.label}</button>)}
      </div>
    </header>

    {state.loading && !state.data ? <ul className="divide-y divide-slate-100 dark:divide-zinc-800" aria-busy="true">
      {[0, 1, 2].map((key) => <li key={key} className="flex items-center gap-3 px-4 py-3"><span className="h-9 w-9 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" /><span className="h-3 flex-1 animate-pulse rounded bg-slate-100 dark:bg-zinc-800" /></li>)}
    </ul> : state.error && !state.data ? <p className="p-5 text-sm text-rose-600 dark:text-rose-400">{errorMessage(state.error)}</p> : <>
      <ol className="divide-y divide-slate-100 dark:divide-zinc-800">
        {rows.map((row) => <li key={row.id} className={`flex items-center gap-3 px-4 py-3 ${row.isYou ? 'bg-sky-50/60 dark:bg-sky-500/[0.06]' : ''}`}>
          <Rank rank={row.rank} />
          {row.isYou ? <PeerAvatar name={row.name} url={row.avatarUrl} size="md" />
            : <Link to={`/student/peers/${row.id}`} className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"><PeerAvatar name={row.name} url={row.avatarUrl} size="md" /></Link>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {row.isYou ? <span className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-50">{row.name}</span>
                : <Link to={`/student/peers/${row.id}`} className="truncate text-sm font-semibold text-slate-900 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300">{row.name}</Link>}
              {row.isYou && <span className="shrink-0 rounded-full bg-sky-600 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">You</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2 sm:gap-2.5">
              <span className="h-1.5 min-w-[32px] max-w-[180px] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" aria-hidden="true">
                <span className={`block h-full rounded-full ${row.isYou ? '' : 'bg-slate-400 dark:bg-zinc-500'}`} style={{ width: `${(row.solved / max) * 100}%`, ...(row.isYou ? { backgroundColor: YOU_COLOR } : {}) }} />
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11.5px] text-slate-500 dark:text-zinc-400" title="Current practice streak"><Flame className={`h-3.5 w-3.5 ${row.streak ? 'text-orange-500' : 'text-slate-300 dark:text-zinc-600'}`} aria-hidden="true" />{row.streak}d</span>
              <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] ${row.practisedToday ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400 dark:text-zinc-500'}`} title={row.practisedToday ? 'Practised today' : 'Not yet today'}>
                <span className={`h-1.5 w-1.5 rounded-full ${row.practisedToday ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'}`} aria-hidden="true" />
                {/* Phones keep the dot; the words return from the sm breakpoint. */}
                <span className="sr-only sm:not-sr-only">{row.practisedToday ? 'Practised today' : 'Not yet today'}</span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!row.isYou && <NudgeButton row={row} onNudged={markNudged} />}
            {!row.isYou && <Link to={`/student/peers/${row.id}/compare`} title={`Compare with ${firstName(row.name)}`} aria-label={`Compare with ${row.name}`}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 ring-1 sm:inline-flex ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-white/5"><BarChart3 className="h-4 w-4" aria-hidden="true" /></Link>}
            <span className="w-8 text-right text-[17px] font-bold tabular-nums text-slate-900 sm:w-10 dark:text-white" aria-label={`${row.solved} solved`}>{row.solved}</span>
          </div>
        </li>)}
      </ol>
      {rows.length < 2 && <p className="border-t border-slate-100 px-4 py-4 text-center text-[13px] text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
        Add Prep Mates to start a friendly race. Search a classmate above.
      </p>}
    </>}
  </section>;
}
