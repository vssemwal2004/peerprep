import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useOptionalToast } from '../../components/CustomToast';
import PeerAvatar from './PeerAvatar';
import { errorMessage } from './peerNetwork';
import { MiniFlame, PingGlyph } from './peerGlyphs';
import { pageWindow } from './circleMath';

// Small pieces shared by the Prep Mates ranking, directory and suggestions.
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';
const MEDALS = [
  { fill: 'from-amber-300 via-yellow-400 to-amber-500', text: 'text-amber-950', ribbon: '#f59e0b' },
  { fill: 'from-slate-200 via-zinc-300 to-slate-400', text: 'text-slate-800', ribbon: '#94a3b8' },
  { fill: 'from-orange-300 via-orange-400 to-orange-600', text: 'text-orange-950', ribbon: '#ea580c' },
];

/** Rank: a ribboned medal for the top three, a plain number after that. */
export function RankBadge({ rank }) {
  const medal = MEDALS[rank - 1];
  if (medal) {
    return <span className="relative flex h-8 w-8 shrink-0 items-center justify-center" aria-label={`Rank ${rank}`}>
      <svg viewBox="0 0 32 32" className="absolute inset-0 h-8 w-8" aria-hidden="true"><path d="M10 2h5l-2 9H8ZM22 2h-5l2 9h5Z" fill={medal.ribbon} opacity=".55" /></svg>
      <span className={`relative mt-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[11.5px] font-black shadow-md ring-2 ring-white dark:ring-[#242424] ${medal.fill} ${medal.text}`}>{rank}</span>
    </span>;
  }
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[13px] font-semibold tabular-nums text-slate-400 dark:text-zinc-500" aria-label={`Rank ${rank}`}>{rank}</span>;
}

/** Avatar with a status ring: green when the student practised today. */
export function StatusAvatar({ name, url, practisedToday, size = 'md' }) {
  return <span className={`relative shrink-0 rounded-full p-[2px] ${practisedToday ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-slate-200 dark:bg-white/10'}`}>
    <PeerAvatar name={name} url={url} size={size} className="!rounded-full ring-2 ring-white dark:ring-[#242424]" />
    {practisedToday && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#242424]" title="Practised today" />}
  </span>;
}

/** Streak flame and practised-today state (the words show from the sm breakpoint). */
export function PracticeMeta({ streak = 0, practisedToday = false }) {
  return <span className="flex items-center gap-3 text-[11.5px]">
    <span className={`inline-flex items-center gap-1 font-medium ${streak ? 'text-orange-700 dark:text-orange-300' : 'text-slate-400 dark:text-zinc-500'}`} title="Current practice streak"><MiniFlame lit={streak > 0} className="h-3.5 w-3" />{streak}d</span>
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
    className="inline-flex h-8 items-center gap-1 rounded-lg bg-gradient-to-b from-amber-50 to-amber-100 px-2.5 text-[12px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 transition hover:from-amber-100 hover:to-amber-200 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:from-amber-500/15 dark:to-amber-500/10 dark:text-amber-200 dark:ring-amber-400/25">
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <PingGlyph className="h-3.5 w-3.5" />}{compact ? <span className="sr-only sm:not-sr-only">Prep Ping</span> : 'Prep Ping'}
  </button>;
}

export function Pager({ page, pages, onPage, label, summary }) {
  if (pages <= 1) return null;
  const arrow = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 ring-1 ring-inset ring-[#e6e7eb] transition hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-300 dark:ring-white/[0.08] dark:hover:bg-white/[0.05]';
  return <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={label}>
    <span className="text-[12px] text-slate-500 dark:text-zinc-400">{summary || <>Page <b className="text-slate-800 dark:text-zinc-100">{page}</b> of {pages}</>}</span>
    <span className="flex items-center gap-1">
      <button type="button" className={arrow} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      {pageWindow(page, pages).map((item) => (typeof item === 'string'
        ? <span key={item} className="w-6 text-center text-[12px] text-slate-400" aria-hidden="true">…</span>
        : <button key={item} type="button" onClick={() => onPage(item)} aria-current={item === page ? 'page' : undefined} aria-label={`Page ${item}`}
          className={`h-8 min-w-8 rounded-lg px-2 text-[12.5px] font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${item === page ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'}`}>{item}</button>))}
      <button type="button" className={arrow} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
    </span>
  </nav>;
}
