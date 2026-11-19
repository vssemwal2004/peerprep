import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flame, Loader2, Zap } from 'lucide-react';
import { api } from '../../utils/api';
import { useOptionalToast } from '../../components/CustomToast';
import { errorMessage } from './peerNetwork';

// Small pieces shared by the Prep Mates race, directory and today card. Styled like the dashboard.
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';
const MEDALS = ['from-amber-300 to-amber-500 text-amber-950', 'from-slate-200 to-slate-400 text-slate-800', 'from-orange-300 to-orange-600 text-orange-950'];

export function RankBadge({ rank, size = 'md' }) {
  const box = size === 'sm' ? 'h-6 w-6 text-[11px]' : 'h-7 w-7 text-[12px]';
  if (rank <= 3) return <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-black shadow-sm ${MEDALS[rank - 1]}`} aria-label={`Rank ${rank}`}>{rank}</span>;
  return <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold tabular-nums text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400`} aria-label={`Rank ${rank}`}>{rank}</span>;
}

/** Streak flame and practised-today dot (the words show from the sm breakpoint). */
export function PracticeMeta({ streak = 0, practisedToday = false }) {
  return <span className="flex items-center gap-2.5 text-[11.5px]">
    <span className="inline-flex items-center gap-0.5 text-slate-500 dark:text-zinc-400" title="Current practice streak"><Flame className={`h-3.5 w-3.5 ${streak ? 'text-orange-500' : 'text-slate-300 dark:text-zinc-600'}`} aria-hidden="true" />{streak}d</span>
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${practisedToday ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400 dark:text-zinc-500'}`} title={practisedToday ? 'Practised today' : 'Not yet today'}>
      <span className={`h-1.5 w-1.5 rounded-full ${practisedToday ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'}`} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{practisedToday ? 'Practised today' : 'Not yet today'}</span>
    </span>
  </span>;
}

/** "Prep Ping": a friendly reminder to a Prep Mate who has not practised today (once a day). */
export function PingButton({ row, onPinged, compact = false }) {
  const toast = useOptionalToast();
  const [busy, setBusy] = useState(false);
  if (row.nudged) return <span className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-slate-400 dark:text-zinc-500"><Check className="h-3.5 w-3.5" aria-hidden="true" />Pinged</span>;
  if (!row.canNudge) return null;
  const ping = async () => {
    setBusy(true);
    try {
      await api.nudgePrepMate(row.id);
      onPinged?.(row.id);
      toast?.success(`Prep Ping sent. ${firstName(row.name)} will get a friendly reminder.`);
    } catch (error) {
      toast?.error(errorMessage(error));
    } finally { setBusy(false); }
  };
  return <button type="button" onClick={ping} disabled={busy} title={`${firstName(row.name)} has not practised today. Send a Prep Ping.`} aria-label={`Send ${row.name} a Prep Ping`}
    className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-50 px-2.5 text-[12px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Zap className="h-3.5 w-3.5" aria-hidden="true" />}{compact ? <span className="sr-only sm:not-sr-only">Prep Ping</span> : 'Prep Ping'}
  </button>;
}

export function Pager({ page, pages, onPage, label }) {
  if (pages <= 1) return null;
  const button = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 ring-1 ring-inset ring-[#e6e7eb] transition hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-300 dark:ring-white/[0.08] dark:hover:bg-white/[0.05]';
  return <nav className="flex items-center justify-between gap-3" aria-label={label}>
    <span className="text-[12px] text-slate-500 dark:text-zinc-400">Page <b className="text-slate-800 dark:text-zinc-100">{page}</b> of {pages}</span>
    <span className="flex gap-1.5">
      <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
    </span>
  </nav>;
}
