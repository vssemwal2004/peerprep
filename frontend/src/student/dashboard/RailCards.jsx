import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarClock, Check, Clock3, Megaphone, Sparkles, Trophy } from 'lucide-react';
import { formatRelativeTime, formatSchedule, isImportantAnnouncement, numeric } from './dashboardUtils';
import { card, CardTitle, DifficultyTag, focusRing, Skeleton, textLink, Unavailable } from './ui';

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
      : 'Complete a question or lesson to enter your university ranking.';

  return <section aria-labelledby="rank-title" aria-busy={Boolean(loading)} className={`p-4 ${card}`}>
    <CardTitle id="rank-title" title="University standing" icon={Trophy}
      action={!loading && topPercent ? <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Top {topPercent}%</span> : null} />
    {loading ? <Skeleton className="mt-3 h-[84px]" />
      : error ? <Unavailable className="mt-3" message="Your university rank could not be loaded." onRetry={onRetry} />
        : unranked ? <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-slate-200 px-3 py-3 dark:border-zinc-700">
          <span className="text-[22px] font-bold leading-none text-slate-300 dark:text-zinc-600" aria-hidden="true">#–</span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100">Not ranked yet</h3>
            <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{unrankedMessage}</p>
          </div>
        </div>
          : <>
            <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{ranking.universityName}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-[30px] font-bold leading-none tracking-[-0.04em] text-slate-950 dark:text-zinc-50">#{rank.toLocaleString()}</span>
                <span className="text-[12px] text-slate-500 dark:text-zinc-400">of {total.toLocaleString()} students{ranking.tied ? ' · tied' : ''}</span>
              </p>
              <p className="text-right leading-none">
                <span className="block text-[15px] font-bold tabular-nums text-slate-900 dark:text-zinc-100">{score.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">points</span>
              </p>
            </div>
            <div className="relative mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800" role="progressbar" aria-label="University rank position" aria-valuemin={1} aria-valuemax={total} aria-valuenow={rank} aria-valuetext={`Rank ${rank} of ${total} students`}>
              <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-sky-600 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${position}%` }} />
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow-sm dark:border-[#242424]" style={{ left: `clamp(6px, ${position}%, calc(100% - 6px))` }} aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-400 dark:text-zinc-500"><span>Start</span><span>Rank #1</span></div>
          </>}
    {!loading && !error && <details className="group mt-3 border-t border-slate-100 pt-2.5 text-[11.5px] leading-relaxed text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
      <summary className={`flex w-fit cursor-pointer list-none items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-zinc-100 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        How ranking works<ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <p className="mt-2">{ranking?.methodology || 'Based on completed coding, learning and assessments. Equal points share the same rank.'}</p>
    </details>}
  </section>;
}

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function DailyChallengeCard({ section, onRetry }) {
  const now = useMinuteClock();
  const daily = section?.data?.daily;
  const deadline = new Date(daily?.endsAt || '').getTime();
  const minutes = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 60000)) : null;
  const done = Boolean(daily?.completed);
  return <section aria-labelledby="daily-title" aria-busy={Boolean(section?.loading)} className={`p-4 ${card} ${done ? 'is-completed' : ''}`}>
    <CardTitle id="daily-title" title="Daily challenge" icon={Sparkles}
      action={daily?.problem && daily.rewardPoints ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">+{daily.rewardPoints} pts</span> : null} />
    {section?.loading ? <Skeleton className="mt-3 h-[92px]" />
      : section?.error || !section?.data ? <Unavailable className="mt-3" message="Progress unavailable" onRetry={onRetry} />
        : !daily?.problem ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-[12px] text-slate-500 dark:bg-zinc-800/60 dark:text-zinc-400">{daily?.enabled === false ? 'Daily challenge is paused' : 'New challenge coming soon'}</p>
          : <>
            <h3 className="mt-2.5 line-clamp-2 text-[14px] font-semibold leading-snug text-slate-900 dark:text-zinc-100">{daily.problem.title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500 dark:text-zinc-400">
              <DifficultyTag difficulty={daily.problem.difficulty} />
              {done
                ? <span className="inline-flex items-center gap-1 font-semibold text-[#326f55] dark:text-[#83bd9e]"><Check className="h-3.5 w-3.5" aria-hidden="true" />Completed today</span>
                : minutes !== null && <span className="inline-flex items-center gap-1 tabular-nums"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{Math.floor(minutes / 60)}h {minutes % 60}m left</span>}
            </div>
            <Link to={daily.problem.href} className={`group mt-3 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors ${focusRing} ${done
              ? 'border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
              : 'bg-sky-600 text-white hover:bg-sky-700'}`}>
              {done ? 'Review solution' : 'Solve challenge'}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </>}
  </section>;
}

export function ComingUpCard({ items, loading, error, onRetry, canAssessments, canEvents }) {
  return <section aria-labelledby="coming-up-title" className={`p-4 ${card}`}>
    <CardTitle id="coming-up-title" title="Coming up" icon={CalendarClock}
      action={<span className="flex gap-3">{canAssessments && <Link to="/student/assessments" className={textLink}>Assessments</Link>}{canEvents && <Link to="/student/interview" className={textLink}>Interviews</Link>}</span>} />
    {error && <Unavailable className="mt-3" message="Some upcoming items could not be loaded." onRetry={onRetry} />}
    {loading && !items.length ? <Skeleton className="mt-3 h-14" />
      : items.length ? <ul className="mt-2 divide-y divide-slate-100 dark:divide-zinc-800">
        {items.slice(0, 3).map((item) => <li key={item.id}>
          <Link to={item.href} className={`group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/60 ${focusRing}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${item.available ? 'bg-emerald-500 ring-4 ring-emerald-500/15' : 'bg-slate-300 dark:bg-zinc-600'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{item.title}</span>
              <span className="block text-[11px] text-slate-500 dark:text-zinc-400">{item.label} · {item.timeLabel} {formatSchedule(item.time)}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-700 dark:text-zinc-600 dark:group-hover:text-zinc-200" aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
        : !error && <p className="mt-2 text-[12px] text-slate-500 dark:text-zinc-400">Nothing scheduled yet</p>}
  </section>;
}

const PRIORITY = { high: 0, normal: 1, low: 2 };


function Notice({ announcement, now }) {
  const [open, setOpen] = useState(false);
  const message = String(announcement.message || '');
  const long = message.length > 140;
  const important = isImportantAnnouncement(announcement);
  const rule = important ? 'before:bg-[#88465b]' : announcement.type === 'motivation' ? 'before:bg-[#43866a]' : 'before:bg-sky-500';
  return <li className={`relative py-2.5 pl-3.5 before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-full ${rule}`}>
    <div className="flex items-center justify-between gap-2 text-[10.5px]">
      <span className={`font-bold uppercase tracking-[0.08em] ${important ? 'text-[#88465b] dark:text-[#cf91a6]' : 'text-slate-400 dark:text-zinc-500'}`}>{announcement.priority === 'high' ? 'Important' : announcement.type === 'alert' ? 'Notice' : announcement.type === 'motivation' ? 'From your university' : 'Update'}</span>
      <time dateTime={announcement.createdAt} className="shrink-0 text-slate-400 dark:text-zinc-500">{formatRelativeTime(announcement.createdAt, now)}</time>
    </div>
    <h3 className="mt-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-zinc-100">{announcement.title}</h3>
    <p className={`mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-slate-500 dark:text-zinc-400 ${long && !open ? 'line-clamp-2' : ''}`}>{message}</p>
    {long && <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={`mt-1 text-[11.5px] font-semibold text-sky-700 dark:text-sky-400 ${focusRing}`}>{open ? 'Show less' : 'Read more'}</button>}
  </li>;
}

export function AnnouncementsCard({ section, onRetry, now }) {
  const [showAll, setShowAll] = useState(false);
  const announcements = [...(section.data || [])].sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || new Date(b.createdAt) - new Date(a.createdAt));
  const visible = showAll ? announcements : announcements.slice(0, 2);
  return <section aria-labelledby="announcements-title" className={`p-4 ${card}`}>
    <CardTitle id="announcements-title" title="Announcements" icon={Megaphone}
      action={announcements.length > 0 ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{announcements.length}</span> : null} />
    {section.loading ? <Skeleton className="mt-3 h-16" />
      : section.error ? <Unavailable className="mt-3" message="Announcements could not be loaded." onRetry={onRetry} />
        : !announcements.length ? <p className="mt-2 text-[12px] text-slate-500 dark:text-zinc-400">No new announcements</p>
          : <ul className="mt-1 divide-y divide-slate-100 dark:divide-zinc-800">{visible.map((announcement) => <Notice key={announcement._id} announcement={announcement} now={now} />)}</ul>}
    {announcements.length > 2 && <button type="button" onClick={() => setShowAll((value) => !value)} className={`mt-1 ${textLink}`}>{showAll ? 'Show fewer' : `View all ${announcements.length}`}<ArrowRight className="h-3 w-3" aria-hidden="true" /></button>}
  </section>;
}

