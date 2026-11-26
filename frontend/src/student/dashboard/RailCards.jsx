import { useState } from 'react';
import GlobalRankCard from '../profile/GlobalRankCard';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarClock, ChevronDown, Megaphone, Trophy } from 'lucide-react';
import { formatScore, rankGapText } from '../prepScore/formatScore';
import { formatRelativeTime, formatSchedule, isImportantAnnouncement, numeric } from './dashboardUtils';
import { card, CardTitle, focusRing, Skeleton, textLink, Unavailable } from './ui';
import AnnouncementDialog from '../../components/announcements/AnnouncementDialog';
import { categoryOf, labelOf, themeOf } from '../../components/announcements/announcementMeta';

// Rail cards are kept compact so the whole rail fits beside the scrolling main column.
const railCard = `p-4 ${card}`;
const railChip = 'inline-flex flex-1 items-center justify-center gap-1 rounded-[10px] bg-[#f1f2f5] px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:bg-[var(--student-dash-hover,rgba(255,255,255,0.06))] dark:text-[color:var(--student-dash-fg,#e4e4e7)] dark:hover:bg-[var(--student-dash-control,rgba(14,165,233,0.10))] dark:hover:text-sky-300';

export function RankCard({ ranking, loading, error, onRetry }) {
  const total = numeric(ranking?.totalStudents);
  const rawRank = numeric(ranking?.rank);
  const rank = rawRank > 0 && total > 0 ? Math.min(total, rawRank) : null;
  const position = rank ? total === 1 ? 100 : ((total - rank) / (total - 1)) * 100 : 0;
  const topPercent = rank && total > 1 ? Math.max(1, Math.ceil((rank / total) * 100)) : null;
  const score = Number.isFinite(Number(ranking?.score)) ? Math.max(0, Number(ranking.score)) : 0;
  const unranked = !loading && !error && !rank;
  const unrankedMessage = !ranking ? 'Your university standing is unavailable right now.'
    : !ranking.universityName ? 'Ask your coordinator to add your university details.'
      : 'Your Prep Score and rank will appear here.';

  return <><section aria-labelledby="rank-title" aria-busy={Boolean(loading)} className={railCard}>
    <CardTitle id="rank-title" title="Prep Score & rank" icon={Trophy} tone="amber"
      action={!loading && topPercent ? <span className="rounded-full bg-sky-600 px-2.5 py-0.5 text-[11.5px] font-semibold text-white dark:bg-sky-500/15 dark:text-sky-200">Top {topPercent}%</span> : null} />
    {loading ? <Skeleton className="mt-3 h-[72px]" />
      : error ? <Unavailable className="mt-3" message="Your university rank could not be loaded." onRetry={onRetry} />
        : <>
          {/* The Prep Score always leads, ranked or not; the rank sits beside it. */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3">
            <div className="rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 px-3.5 py-3 text-white shadow-[0_6px_18px_-10px_rgba(2,132,199,0.8)] dark:bg-[var(--student-dash-hover,#2c2c2c)] dark:bg-none dark:text-sky-300 dark:shadow-none">
              <p className="text-[11.5px] font-medium text-sky-100 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">Your Prep Score</p>
              <p className="mt-1 text-[30px] font-bold leading-none tracking-[-0.04em] tabular-nums" aria-label={`Prep Score ${ranking ? formatScore(score) : 'unavailable'}`}>
                {ranking ? formatScore(score) : '—'}
              </p>
            </div>
            <div className="flex min-w-[96px] flex-col justify-center rounded-xl bg-[#f4f5f8] px-3.5 py-3 text-right dark:bg-[var(--student-dash-hover,rgba(255,255,255,0.05))]">
              <p className="text-[11.5px] font-medium text-slate-500 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">University rank</p>
              {rank ? <p className="mt-1 tabular-nums leading-none">
                <span className="text-[22px] font-bold tracking-[-0.04em] text-slate-950 dark:text-[color:var(--student-dash-fg,#fafafa)]"><span className="text-sky-600 dark:text-sky-400">#</span>{rank.toLocaleString()}</span>
                <span className="mt-1 block text-[11px] text-slate-500 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">of {total.toLocaleString()}{ranking.tied ? ' · tied' : ''}</span>
              </p> : <p className="mt-1 text-[13px] font-semibold text-slate-400 dark:text-[color:var(--student-dash-muted,#71717a)]">Not ranked yet</p>}
            </div>
          </div>
          {unranked ? <p className="mt-2.5 text-[12.5px] leading-snug text-slate-600 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">{unrankedMessage}</p>
            : <div className="relative mt-3 h-2 rounded-full bg-[#eef0f3] dark:bg-[var(--student-dash-border,rgba(255,255,255,0.08))]" role="progressbar" aria-label="University rank position" aria-valuemin={1} aria-valuemax={total} aria-valuenow={rank} aria-valuetext={`Rank ${rank} of ${total} students`}>
              <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-sky-600 transition-[width] duration-500 motion-reduce:transition-none dark:bg-sky-400/75 dark:bg-none" style={{ width: `${position}%` }} />
              <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-sky-600 shadow-[0_2px_6px_rgba(2,132,199,0.45)] dark:border-[color:var(--student-dash-card,#242424)] dark:bg-sky-300 dark:shadow-none" style={{ left: `clamp(7px, ${position}%, calc(100% - 7px))` }} aria-hidden="true" />
            </div>}
        </>}
    {!loading && !error && <>
      {rank && rankGapText(ranking) ? <p className="mt-2.5 text-[12px] font-medium leading-snug text-sky-700 dark:text-sky-300">{rankGapText(ranking)}</p> : null}
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px]">
        <span className="min-w-0 truncate text-slate-500 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">{ranking?.universityName || ''}</span>
      </div>
    </>}
  </section><GlobalRankCard scoreRevision={ranking?.score} /></>;
}

export function ComingUpCard({ items, loading, error, onRetry, canAssessments, canEvents, canInterviews = false }) {
  return <section aria-labelledby="coming-up-title" className={railCard}>
    <CardTitle id="coming-up-title" title="Coming up" icon={CalendarClock} tone="emerald" />
    {error && <Unavailable className="mt-3" message="Some upcoming items could not be loaded." onRetry={onRetry} />}
    {loading && !items.length ? <Skeleton className="mt-3 h-12" />
      : items.length ? <ul className="mt-2 divide-y divide-[#f0f1f4] dark:divide-[color:var(--student-dash-border,rgba(255,255,255,0.06))]">
        {items.slice(0, 2).map((item) => <li key={item.id}>
          <Link to={item.href} className={`group -mx-2 flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-[#f6f7f9] dark:hover:bg-[var(--student-dash-hover,rgba(255,255,255,0.04))] ${focusRing}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${item.available ? 'bg-emerald-500 ring-4 ring-emerald-500/15' : 'bg-slate-300 dark:bg-zinc-600'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-[color:var(--student-dash-fg,#f4f4f5)]">{item.title}</span>
              <span className="block truncate text-[12px] text-slate-500 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">{item.label} · {item.timeLabel} {formatSchedule(item.time, { ist: item.ist })}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-sky-600 dark:text-zinc-600 dark:group-hover:text-sky-300" aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
        : !error && <p className="mt-2.5 text-[13px] text-slate-500 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">Nothing scheduled yet</p>}
    {(canAssessments || canEvents || canInterviews) && <div className="mt-3 flex gap-2">
      {canAssessments && <Link to="/student/assessments" className={`group ${railChip} ${focusRing}`}>Prep Assessment<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
      {canEvents && <Link to="/student/interview" className={`group ${railChip} ${focusRing}`}>Interviews<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
      {canInterviews && <Link to="/student/ai-interviews" className={`group ${railChip} ${focusRing}`}>AI interviews<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
    </div>}
  </section>;
}

/** One announcement in the rail: its own name (Notice, Exam ...) and colour; opens in full. */
function Notice({ announcement, now, onOpen }) {
  const message = String(announcement.message || '');
  const important = isImportantAnnouncement(announcement);
  const theme = themeOf(announcement);
  const { Icon } = categoryOf(announcement);
  return <li className={`relative py-2.5 pl-3.5 before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-full ${theme.rule}`}>
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className={`inline-flex min-w-0 items-center gap-1 font-semibold uppercase tracking-[0.08em] ${theme.text}`}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{labelOf(announcement)}</span>
        {important ? <span className="ml-1 rounded bg-rose-500 px-1 py-px text-[9.5px] text-white">Important</span> : null}
      </span>
      <time dateTime={announcement.createdAt} className="shrink-0 text-slate-400 dark:text-[color:var(--student-dash-muted,#71717a)]">{formatRelativeTime(announcement.createdAt, now)}</time>
    </div>
    <button type="button" onClick={onOpen} className={`group mt-0.5 block w-full rounded-md text-left ${focusRing}`}>
      <span className="flex items-start gap-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug text-slate-900 group-hover:text-sky-700 dark:text-[color:var(--student-dash-fg,#f4f4f5)] dark:group-hover:text-sky-300">{announcement.title}</span>
          <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600 dark:text-[color:var(--student-dash-muted,#a1a1aa)]">{message}</span>
        </span>
        {announcement.imageUrl ? <img src={announcement.imageUrl} alt="" className="mt-0.5 h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" /> : null}
      </span>
      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-medium text-sky-700 dark:text-sky-400">Open<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
    </button>
  </li>;
}

/** Rendered only when there is something to say; announcements lead the rail. */
export function AnnouncementsCard({ items, section, onRetry, now, showAll, onToggleAll }) {
  const [reading, setReading] = useState(null);
  const visible = showAll ? items : items.slice(0, 2);
  return <section id="dashboard-announcements" tabIndex={-1} aria-labelledby="announcements-title"
    className={`${railCard} scroll-mt-24 outline-none transition-shadow focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-500/50`}>
    <CardTitle id="announcements-title" title="Announcements" icon={Megaphone} tone="rose"
      action={items.length > 0 ? <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11.5px] font-semibold tabular-nums text-white">{items.length}</span> : null} />
    {section.error && !items.length
      ? <Unavailable className="mt-3" message="Announcements could not be loaded." onRetry={onRetry} />
      : <ul className="mt-1 max-h-[300px] divide-y divide-[#f0f1f4] overflow-y-auto overscroll-contain dark:divide-[color:var(--student-dash-border,rgba(255,255,255,0.06))]">{visible.map((announcement) => <Notice key={announcement._id} announcement={announcement} now={now}
        onOpen={() => setReading(items.findIndex((item) => item._id === announcement._id))} />)}</ul>}
    {items.length > 2 && <button type="button" onClick={onToggleAll} className={`mt-1 ${textLink}`}>{showAll ? 'Show fewer' : `View all ${items.length}`}<ArrowRight className="h-3 w-3" aria-hidden="true" /></button>}
    {reading !== null && reading >= 0 ? <AnnouncementDialog items={items} startIndex={reading} onClose={() => setReading(null)} doneLabel="Close" /> : null}
  </section>;
}
