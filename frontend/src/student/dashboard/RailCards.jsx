import { useState } from 'react';
import GlobalRankCard from '../profile/GlobalRankCard';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarClock, ChevronDown, Megaphone, Trophy } from 'lucide-react';
import { PrepScoreFlow, PrepScoreRules, ScoreValue } from '../prepScore/PrepScore';
import { formatRelativeTime, formatSchedule, isImportantAnnouncement, numeric } from './dashboardUtils';
import { card, CardTitle, focusRing, Skeleton, textLink, Unavailable } from './ui';

// Rail cards are kept compact so the whole rail fits beside the scrolling main column.
const railCard = `p-4 ${card}`;
const railChip = 'inline-flex flex-1 items-center justify-center gap-1 rounded-[10px] bg-[#f1f2f5] px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-sky-500/10 dark:hover:text-sky-300';

export function RankCard({ ranking, loading, error, onRetry }) {
  const [showMethod, setShowMethod] = useState(false);
  const total = numeric(ranking?.totalStudents);
  const rawRank = numeric(ranking?.rank);
  const rank = rawRank > 0 && total > 0 ? Math.min(total, rawRank) : null;
  const position = rank ? total === 1 ? 100 : ((total - rank) / (total - 1)) * 100 : 0;
  const topPercent = rank && total > 1 ? Math.max(1, Math.ceil((rank / total) * 100)) : null;
  const score = Number.isFinite(Number(ranking?.score)) ? Math.max(0, Number(ranking.score)) : 0;
  const unranked = !loading && !error && !rank;
  const unrankedMessage = !ranking ? 'Your university standing is unavailable right now.'
    : !ranking.universityName ? 'Ask your coordinator to add your university details.'
      : 'Solve a problem, finish a lesson or take a test to start your Prep Score.';

  return <><section aria-labelledby="rank-title" aria-busy={Boolean(loading)} className={railCard}>
    <CardTitle id="rank-title" title="Prep Score & rank" icon={Trophy} tone="amber"
      action={!loading && topPercent ? <span className="rounded-full bg-sky-600 px-2.5 py-0.5 text-[11.5px] font-semibold text-white">Top {topPercent}%</span> : null} />
    {loading ? <Skeleton className="mt-3 h-[72px]" />
      : error ? <Unavailable className="mt-3" message="Your university rank could not be loaded." onRetry={onRetry} />
        : unranked ? <div className="mt-3 flex items-center gap-3 rounded-xl bg-sky-50/70 px-3.5 py-3 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/[0.07] dark:ring-white/[0.06]">
          <span className="text-[22px] font-bold leading-none tracking-[-0.04em] text-sky-300 dark:text-sky-500/60" aria-hidden="true">#–</span>
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">Not ranked yet</h3>
            <p className="text-[12.5px] leading-snug text-slate-600 dark:text-zinc-400">{unrankedMessage}</p>
          </div>
        </div>
          : <>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-[30px] font-bold leading-none tracking-[-0.04em] text-slate-950 dark:text-zinc-50"><span className="text-sky-600 dark:text-sky-400">#</span>{rank.toLocaleString()}</span>
                <span className="text-[12.5px] text-slate-500 dark:text-zinc-400">of {total.toLocaleString()} students{ranking.tied ? ' · tied' : ''}</span>
              </p>
              <p className="text-right leading-none">
                <ScoreValue value={score} />
                <span className="mt-1 block text-[11.5px] text-slate-500 dark:text-zinc-400">Prep Score</span>
              </p>
            </div>
            <div className="relative mt-3 h-2 rounded-full bg-[#eef0f3] dark:bg-white/[0.08]" role="progressbar" aria-label="University rank position" aria-valuemin={1} aria-valuemax={total} aria-valuenow={rank} aria-valuetext={`Rank ${rank} of ${total} students`}>
              <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-sky-600 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${position}%` }} />
              <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-sky-600 shadow-[0_2px_6px_rgba(2,132,199,0.45)] dark:border-[#242424]" style={{ left: `clamp(7px, ${position}%, calc(100% - 7px))` }} aria-hidden="true" />
            </div>
            <PrepScoreFlow prepScore={ranking.prepScore} className="mt-3" />
          </>}
    {!loading && !error && <>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
        <span className="min-w-0 truncate text-slate-500 dark:text-zinc-400">{ranking?.universityName || ''}</span>
        <button type="button" onClick={() => setShowMethod((value) => !value)} aria-expanded={showMethod} aria-controls="rank-method"
          className={`inline-flex shrink-0 items-center gap-0.5 rounded font-medium text-slate-600 hover:text-sky-700 dark:text-zinc-300 dark:hover:text-sky-300 ${focusRing}`}>
          How the Prep Score works<ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMethod ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {showMethod && <div id="rank-method" className="mt-2 rounded-lg bg-[#f6f7f9] px-3 py-3 dark:bg-white/[0.04]">
        <PrepScoreRules prepScore={ranking?.prepScore} />
      </div>}
    </>}
  </section><GlobalRankCard scoreRevision={ranking?.score} /></>;
}

export function ComingUpCard({ items, loading, error, onRetry, canAssessments, canEvents }) {
  return <section aria-labelledby="coming-up-title" className={railCard}>
    <CardTitle id="coming-up-title" title="Coming up" icon={CalendarClock} tone="emerald" />
    {error && <Unavailable className="mt-3" message="Some upcoming items could not be loaded." onRetry={onRetry} />}
    {loading && !items.length ? <Skeleton className="mt-3 h-12" />
      : items.length ? <ul className="mt-2 divide-y divide-[#f0f1f4] dark:divide-white/[0.06]">
        {items.slice(0, 2).map((item) => <li key={item.id}>
          <Link to={item.href} className={`group -mx-2 flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-[#f6f7f9] dark:hover:bg-white/[0.04] ${focusRing}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${item.available ? 'bg-emerald-500 ring-4 ring-emerald-500/15' : 'bg-slate-300 dark:bg-zinc-600'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-zinc-100">{item.title}</span>
              <span className="block truncate text-[12px] text-slate-500 dark:text-zinc-400">{item.label} · {item.timeLabel} {formatSchedule(item.time)}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-sky-600 dark:text-zinc-600 dark:group-hover:text-sky-300" aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
        : !error && <p className="mt-2.5 text-[13px] text-slate-500 dark:text-zinc-400">Nothing scheduled yet</p>}
    {(canAssessments || canEvents) && <div className="mt-3 flex gap-2">
      {canAssessments && <Link to="/student/assessments" className={`group ${railChip} ${focusRing}`}>Assessments<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
      {canEvents && <Link to="/student/interview" className={`group ${railChip} ${focusRing}`}>Interviews<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
    </div>}
  </section>;
}

function Notice({ announcement, now }) {
  const [open, setOpen] = useState(false);
  const message = String(announcement.message || '');
  const long = message.length > 110;
  const important = isImportantAnnouncement(announcement);
  const rule = important ? 'before:bg-rose-500' : announcement.type === 'motivation' ? 'before:bg-[#43866a]' : 'before:bg-sky-500';
  return <li className={`relative py-2.5 pl-3.5 before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-full ${rule}`}>
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className={`font-semibold uppercase tracking-[0.08em] ${important ? 'text-rose-600 dark:text-rose-300' : 'text-slate-400 dark:text-zinc-500'}`}>{announcement.priority === 'high' ? 'Important' : announcement.type === 'alert' ? 'Notice' : announcement.type === 'motivation' ? 'From your university' : 'Update'}</span>
      <time dateTime={announcement.createdAt} className="shrink-0 text-slate-400 dark:text-zinc-500">{formatRelativeTime(announcement.createdAt, now)}</time>
    </div>
    <h3 className="mt-0.5 text-[13.5px] font-semibold leading-snug text-slate-900 dark:text-zinc-100">{announcement.title}</h3>
    <p className={`mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600 dark:text-zinc-400 ${long && !open ? 'line-clamp-2' : ''}`}>{message}</p>
    {long && <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={`mt-0.5 text-[12px] font-medium text-sky-700 dark:text-sky-400 ${focusRing}`}>{open ? 'Show less' : 'Read more'}</button>}
  </li>;
}

/** Rendered only when there is something to say; announcements lead the rail. */
export function AnnouncementsCard({ items, section, onRetry, now, showAll, onToggleAll }) {
  const visible = showAll ? items : items.slice(0, 2);
  return <section id="dashboard-announcements" tabIndex={-1} aria-labelledby="announcements-title"
    className={`${railCard} scroll-mt-24 outline-none transition-shadow focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-500/50`}>
    <CardTitle id="announcements-title" title="Announcements" icon={Megaphone} tone="rose"
      action={items.length > 0 ? <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11.5px] font-semibold tabular-nums text-white">{items.length}</span> : null} />
    {section.error && !items.length
      ? <Unavailable className="mt-3" message="Announcements could not be loaded." onRetry={onRetry} />
      : <ul className="mt-1 max-h-[300px] divide-y divide-[#f0f1f4] overflow-y-auto overscroll-contain dark:divide-white/[0.06]">{visible.map((announcement) => <Notice key={announcement._id} announcement={announcement} now={now} />)}</ul>}
    {items.length > 2 && <button type="button" onClick={onToggleAll} className={`mt-1 ${textLink}`}>{showAll ? 'Show fewer' : `View all ${items.length}`}<ArrowRight className="h-3 w-3" aria-hidden="true" /></button>}
  </section>;
}
