import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Gauge, Lightbulb, Medal, Sparkles, Trophy } from 'lucide-react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import PeerAvatar from './PeerAvatar';
import { errorMessage, peerSubtitle } from './peerNetwork';
import { compareInsight } from './compareInsight';
import { DuelLegend, MATE_COLOR, YOU_COLOR } from './circleViz';
import { PairedBars, WeeklyBars } from './compareCharts';
import MonthlyBadgeEmblem from '../rewards/MonthlyBadgeEmblem';
import { card, CardTitle, focusRing, Skeleton } from '../dashboard/ui';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';
const TIERS = ['Bronze', 'Bronze', 'Silver', 'Silver', 'Gold', 'Gold', 'Platinum', 'Platinum', 'Diamond', 'Legend'];
const tierOf = (level) => (level ? TIERS[Math.min(10, level) - 1] : null);

/** One person in the header: photo, name, level, rank and total solved. */
function Person({ person, color, role, to, align = 'left' }) {
  const right = align === 'right';
  const name = to
    ? <Link to={to} className="block truncate text-[16px] font-semibold text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">{person.name}</Link>
    : <p className="truncate text-[16px] font-semibold text-slate-900 dark:text-white">{person.name}</p>;
  return <div className={`flex min-w-0 flex-1 items-center gap-3 ${right ? 'flex-row-reverse text-right' : ''}`}>
    <span className="shrink-0 rounded-full p-[3px]" style={{ backgroundColor: color }}>
      <PeerAvatar name={person.name} url={person.avatarUrl} size="lg" className="!rounded-full ring-2 ring-white dark:ring-[#242424]" />
    </span>
    <div className="min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color }}>{role}</p>
      {name}
      <p className="truncate text-[12px] text-slate-500 dark:text-zinc-400">{[person.level?.title, peerSubtitle(person)].filter(Boolean).join(' · ') || 'Student'}</p>
      <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 dark:text-zinc-400 ${right ? 'justify-end' : ''}`}>
        <span><b className="text-[18px] font-bold tabular-nums text-slate-900 dark:text-white">{person.totals.total}</b> solved</span>
        {person.rank?.allTime && <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />#{person.rank.allTime} of {person.rank.of}</span>}
      </p>
    </div>
  </div>;
}

export default function PeerComparePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });
    api.comparePrepMate(id)
      .then((data) => { if (active) setState({ loading: false, error: null, data }); })
      .catch((error) => { if (active) setState({ loading: false, error, data: null }); });
    return () => { active = false; };
  }, [id]);
  const data = state.data;
  const insight = useMemo(() => (data ? compareInsight(data) : ''), [data]);

  const page = (children) => <div className="min-h-[calc(100dvh-65px)] bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
    <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 lg:py-8">{children}</div>
  </div>;
  const back = <Link to="/student/peers" className={`mb-4 inline-flex items-center gap-1 rounded text-[13px] font-semibold text-slate-500 hover:text-sky-700 dark:text-zinc-400 dark:hover:text-sky-300 ${focusRing}`}><ArrowLeft className="h-4 w-4" />Prep Mates</Link>;

  if (state.loading) return page(<>{back}<div className="space-y-4" aria-busy="true"><Skeleton className="h-32" /><Skeleton className="h-72" /><Skeleton className="h-56" /></div></>);
  if (state.error || !data) {
    return page(<>{back}<p className="py-10 text-center text-[14px] text-slate-600 dark:text-zinc-300">{errorMessage(state.error, 'This comparison is not available.')}</p></>);
  }

  const you = { ...data.you, avatarUrl: data.you.avatarUrl || user?.avatarUrl };
  const { mate } = data;
  const mateName = firstName(mate.name);
  const lead = you.totals.total - mate.totals.total;
  const verdict = lead === 0 ? 'You are level on problems solved.' : lead > 0 ? `You are ahead by ${lead} problem${lead === 1 ? '' : 's'}.` : `${mateName} is ahead by ${-lead} problem${lead === -1 ? '' : 's'}.`;

  return page(<>
    {back}
    {/* Who is compared, in which colour, and one plain verdict. */}
    <section className={`${card} overflow-hidden`} aria-label="You and your Prep Mate">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <Person person={you} color={YOU_COLOR} role="You" />
        <span className="hidden shrink-0 text-[13px] font-black tracking-[0.2em] text-slate-300 sm:block dark:text-zinc-600" aria-hidden="true">VS</span>
        <Person person={mate} color={MATE_COLOR} role="Prep Mate" to={`/student/peers/${mate.id}`} align="right" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f3] bg-[#fafafb] px-5 py-3 sm:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white">{verdict}</p>
        <DuelLegend mateLabel={mateName} />
      </div>
    </section>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className={`${card} p-5`} aria-labelledby="glance-title">
        <CardTitle id="glance-title" title="At a glance" icon={Sparkles} tone="sky" />
        <div className="mt-1 divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
          <PairedBars label="Problems solved" you={you.totals.total} mate={mate.totals.total} mateName={mateName} />
          <PairedBars label="Solved this week" you={you.thisWeek} mate={mate.thisWeek} mateName={mateName} />
          <PairedBars label="Current streak" you={you.streak.current} mate={mate.streak.current} mateName={mateName} unit="d" />
          <PairedBars label="Practice days (last 30)" you={you.activeDays30} mate={mate.activeDays30} mateName={mateName} />
          <PairedBars label="Topics covered" you={you.topicsCovered} mate={mate.topicsCovered} mateName={mateName} />
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        <section className={`${card} p-5`} aria-labelledby="weeks-title">
          <CardTitle id="weeks-title" title="Last 8 weeks" icon={BarChart3} tone="emerald" action={<DuelLegend mateLabel={mateName} />} />
          <div className="mt-3"><WeeklyBars you={you.weekly} mate={mate.weekly} mateName={mateName} /></div>
        </section>
        <section className={`${card} p-5`} aria-labelledby="difficulty-title">
          <CardTitle id="difficulty-title" title="By difficulty" icon={Gauge} tone="amber" />
          <div className="mt-1 divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
            <PairedBars label="Easy" you={you.totals.easy} mate={mate.totals.easy} mateName={mateName} />
            <PairedBars label="Medium" you={you.totals.medium} mate={mate.totals.medium} mateName={mateName} />
            <PairedBars label="Hard" you={you.totals.hard} mate={mate.totals.hard} mateName={mateName} />
          </div>
        </section>
      </div>
    </div>

    <section className={`${card} mt-5 p-5`} aria-labelledby="badges-title">
      <CardTitle id="badges-title" title="Badges this month" icon={Medal} tone="violet"
        action={<span className="text-[12px] text-slate-500 dark:text-zinc-400">Lifetime badges: <b style={{ color: YOU_COLOR }}>{you.badgesEarned?.earned ?? 0}</b> vs <b style={{ color: MATE_COLOR }}>{mate.badgesEarned?.earned ?? 0}</b></span>} />
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {data.badges.map((badge) => <li key={badge.key} className="flex items-center gap-3 rounded-2xl border border-[#eef0f3] bg-[#fbfbfc] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <MonthlyBadgeEmblem track={badge.key} level={badge.you} tier={tierOf(badge.you)} size={38} title={`You: ${badge.you ? `level ${badge.you}` : 'not started'}`} />
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{badge.title}</p>
            <p className="text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400"><span style={{ color: YOU_COLOR }} className="font-bold">L{badge.you}</span> vs <span style={{ color: MATE_COLOR }} className="font-bold">L{badge.mate}</span></p>
          </div>
          <MonthlyBadgeEmblem track={badge.key} level={badge.mate} tier={tierOf(badge.mate)} size={38} title={`${mateName}: ${badge.mate ? `level ${badge.mate}` : 'not started'}`} />
        </li>)}
      </ul>
    </section>

    <section className={`${card} mt-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center`} aria-label="What to do next">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/15" aria-hidden="true"><Lightbulb className="h-5 w-5" /></span>
      <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-slate-600 dark:text-zinc-300">{insight}</p>
      <Link to="/problems" className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-sky-700 ${focusRing}`}>Practice now</Link>
    </section>
    <p className="mt-3 text-center text-[11.5px] text-slate-400 dark:text-zinc-500">Only practice is compared. Prep Score, Prep Coins, tests and interviews stay private.</p>
  </>);
}
